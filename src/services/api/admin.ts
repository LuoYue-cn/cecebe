import { z } from "zod";
import { db, json } from "@/lib/db";
import { assert, AppError } from "@/lib/errors";
import { settings, settingsSchema, saveSettings } from "@/lib/settings";
import { type auth } from "@/security/auth";
import { isAdmin, isSuper } from "@/security/permissions";
import { encrypt, decrypt } from "@/security/crypto";
import { providerConfigSchema, createProvider } from "@/providers/provider";
import { audit } from "../tests";
import { defaultPrompts } from "../ai";
type Actor = NonNullable<Awaited<ReturnType<typeof auth>>>;
export async function adminRead(section: string, actor: Actor, url: URL) {
  assert(isAdmin(actor.user?.role), 403, "需要管理员权限。");
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const q = (url.searchParams.get("q") ?? "").slice(0, 200);
  const skip = (page - 1) * 20;
  if (section === "dashboard") {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const [
      users,
      todayUsers,
      tests,
      completed,
      ai,
      errors,
      tokens,
      shares,
      popular,
    ] = await Promise.all([
      db.user.count({ where: { deletedAt: null } }),
      db.user.count({ where: { createdAt: { gte: today } } }),
      db.test.count({ where: { deletedAt: null } }),
      db.testSession.count({ where: { completedAt: { gte: today } } }),
      db.aIRequestLog.count(),
      db.aIRequestLog.count({ where: { status: "error" } }),
      db.aIRequestLog.aggregate({
        _sum: { promptTokens: true, completionTokens: true },
      }),
      db.share.aggregate({ _sum: { clickCount: true } }),
      db.test.findMany({
        where: { deletedAt: null },
        include: {
          _count: { select: { shares: true } },
          versions: { select: { _count: { select: { sessions: true } } } },
        },
        take: 100,
      }),
    ]);
    return {
      users,
      todayUsers,
      tests,
      todayCompleted: completed,
      aiRequests: ai,
      aiTokens:
        (tokens._sum.promptTokens ?? 0) + (tokens._sum.completionTokens ?? 0),
      aiErrorRate: ai ? Math.round((errors / ai) * 100) : 0,
      shareVisits: shares._sum.clickCount ?? 0,
      popular: popular
        .map((t) => ({
          title: t.title,
          slug: t.slug,
          count: t.versions.reduce((n, v) => n + v._count.sessions, 0),
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
    };
  }
  if (section === "users") {
    const where = {
      OR: [
        { email: { contains: q, mode: "insensitive" as const } },
        { username: { contains: q, mode: "insensitive" as const } },
      ],
    };
    return {
      items: await db.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          status: true,
          deletedAt: true,
          createdAt: true,
          _count: { select: { attempts: true, tests: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: 20,
      }),
      total: await db.user.count({ where }),
      page,
    };
  }
  if (section === "tests") {
    const where = { title: { contains: q, mode: "insensitive" as const } };
    return {
      items: await db.test.findMany({
        where,
        include: {
          creator: { select: { username: true } },
          versions: {
            select: {
              id: true,
              version: true,
              _count: { select: { sessions: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: 20,
      }),
      total: await db.test.count({ where }),
      page,
    };
  }
  if (section === "logs")
    return {
      items: await db.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take: 20,
      }),
      total: await db.auditLog.count(),
      page,
      ai: await db.aIRequestLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    };
  if (section === "ads") return { items: await db.adConfig.findMany() };
  assert(isSuper(actor.user?.role), 403, "需要超级管理员权限。");
  if (section === "security" || section === "settings")
    return { settings: await settings() };
  if (section === "ai")
    return {
      items: (
        await db.aIProvider.findMany({ orderBy: { createdAt: "desc" } })
      ).map(({ encryptedKey, ...p }) => ({
        ...p,
        apiKey: `****${decrypt(encryptedKey).slice(-4)}`,
      })),
    };
  if (section === "prompts")
    return {
      items: await db.promptTemplate.findMany({
        orderBy: { createdAt: "desc" },
      }),
      defaults: defaultPrompts,
    };
  throw new AppError(404, "管理页面不存在。");
}
export async function adminAction(
  section: string,
  action: string,
  body: unknown,
  actor: Actor,
  ip: string,
) {
  assert(isAdmin(actor.user?.role), 403, "需要管理员权限。");
  const actorId = actor.user!.id;
  let target = section;
  if (["ai", "security", "settings", "prompts"].includes(section))
    assert(isSuper(actor.user?.role), 403, "需要超级管理员权限。");
  if (section === "users") {
    const input = z
      .object({
        id: z.string().uuid(),
        role: z.enum(["USER", "ADMIN", "SUPER_ADMIN"]).optional(),
      })
      .parse(body);
    target = input.id;
    const user = await db.user.findUnique({ where: { id: input.id } });
    assert(user, 404, "用户不存在。");
    assert(input.id !== actorId, 400, "不能在此修改自己的管理权限或状态。");
    assert(
      user.role === "USER" || isSuper(actor.user?.role),
      403,
      "普通管理员不能管理管理员。",
    );
    if (action === "records") {
      return {
        items: await db.testSession.findMany({
          where: { userId: input.id },
          select: {
            id: true,
            startedAt: true,
            completedAt: true,
            status: true,
            testVersion: { select: { test: { select: { title: true } } } },
          },
          take: 50,
          orderBy: { startedAt: "desc" },
        }),
      };
    }
    if (action === "role") {
      assert(
        isSuper(actor.user?.role) && input.role,
        403,
        "需要超级管理员权限。",
      );
      await db.user.update({
        where: { id: input.id },
        data: { role: input.role },
      });
    } else {
      assert(
        ["ban", "unban", "delete", "restore"].includes(action),
        400,
        "操作不合法。",
      );
      await db.user.update({
        where: { id: input.id },
        data:
          action === "delete"
            ? { deletedAt: new Date(), status: "deleted" }
            : action === "restore"
              ? { deletedAt: null, status: "active" }
              : { status: action === "ban" ? "banned" : "active" },
      });
    }
    await db.session.deleteMany({ where: { userId: input.id } });
  } else if (section === "tests") {
    const input = z
      .object({ id: z.string().uuid(), recommended: z.boolean().optional() })
      .parse(body);
    target = input.id;
    assert(
      ["remove", "restore", "delete", "recommend"].includes(action),
      400,
      "操作不合法。",
    );
    await db.test.update({
      where: { id: input.id },
      data:
        action === "delete"
          ? { deletedAt: new Date(), status: "removed" }
          : action === "recommend"
            ? { recommended: input.recommended ?? false }
            : action === "restore"
              ? { deletedAt: null, status: "published" }
              : { status: "removed" },
    });
  } else if (section === "ai") {
    if (action === "connection") {
      const input = z
        .object({ id: z.string().uuid().optional() })
        .passthrough()
        .parse(body);
      let config;
      if (input.id) {
        const existing = await db.aIProvider.findUniqueOrThrow({
          where: { id: input.id },
        });
        config = providerConfigSchema.parse({
          ...existing,
          apiKey: decrypt(existing.encryptedKey),
        });
      } else config = providerConfigSchema.parse(body);
      await createProvider(config).testConnection();
      return { ok: true };
    }
    if (action === "default" || action === "disable") {
      const { id } = z.object({ id: z.string().uuid() }).parse(body);
      target = id;
      await db.$transaction(async (tx) => {
        if (action === "default") {
          await tx.aIProvider.updateMany({ data: { isDefault: false } });
          await tx.aIProvider.update({
            where: { id },
            data: { enabled: true, isDefault: true },
          });
        } else
          await tx.aIProvider.update({
            where: { id },
            data: { enabled: false, isDefault: false },
          });
      });
    } else {
      const input = providerConfigSchema
        .extend({ id: z.string().uuid().optional() })
        .parse(body);
      const { id, apiKey, ...data } = input;
      const encryptedKey = encrypt(apiKey);
      const p = id
        ? await db.aIProvider.update({
            where: { id },
            data: { ...data, encryptedKey },
          })
        : await db.aIProvider.create({ data: { ...data, encryptedKey } });
      target = p.id;
    }
  } else if (section === "settings" || section === "security") {
    const config = settingsSchema.parse(body);
    assert(
      new URL(config.siteUrl).origin === new URL(process.env.APP_URL!).origin,
      400,
      "站点 URL 必须与 APP_URL 一致。",
    );
    await saveSettings(config);
  } else if (section === "prompts") {
    const input = z
      .object({
        kind: z.enum([
          "classification",
          "generation",
          "analysis",
          "safety",
          "share",
        ]),
        content: z.string().min(10).max(20000),
      })
      .parse(body);
    target = input.kind;
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(76914022)`;
      const last = await tx.promptTemplate.findFirst({
        where: { kind: input.kind },
        orderBy: { version: "desc" },
      });
      await tx.promptTemplate.create({
        data: {
          ...input,
          version: (last?.version ?? 0) + 1,
          createdBy: actorId,
        },
      });
    });
  } else if (section === "ads") {
    const input = z
      .object({
        id: z.string().uuid().optional(),
        enabled: z.boolean(),
        code: z.string().max(20000),
        pages: z.array(z.enum(["home", "test", "result", "other"])).min(1),
        label: z
          .string()
          .min(1)
          .max(80)
          .refine(
            (s) => /广告|advertisement/i.test(s),
            "标签必须明确包含广告或 Advertisement",
          ),
      })
      .parse(body);
    const { id, ...data } = input;
    if (id)
      await db.adConfig.update({
        where: { id },
        data: { ...data, pages: json(data.pages) },
      });
    else
      await db.adConfig.create({ data: { ...data, pages: json(data.pages) } });
  } else throw new AppError(404, "接口不存在。");
  const config = await settings();
  await audit(
    actorId,
    `${section}:${action}`,
    target,
    config.auditIp && ip !== "local" ? ip : undefined,
  );
  return { ok: true };
}
