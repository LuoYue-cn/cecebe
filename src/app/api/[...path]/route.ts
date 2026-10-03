import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { initialized, settings } from "@/lib/settings";
import { safeError, assert, AppError } from "@/lib/errors";
import { auth, newSession, csrf } from "@/security/auth";
import { isAdmin } from "@/security/permissions";
import { rateLimit } from "@/security/rate-limit";
import { authAction } from "@/services/api/auth";
import { installAction, installCheck } from "@/services/api/install";
import { testRead, testAction } from "@/services/api/tests";
import { adminRead, adminAction } from "@/services/api/admin";
import { writeFile } from "node:fs/promises";
import { token } from "@/security/crypto";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
async function handle(req: Request, context: Context) {
  try {
    const { path } = await context.params;
    const url = new URL(req.url);
    const method = req.method;
    // Never trust forwarding headers unless a reverse proxy overwrites them. Rate by session plus IP at the proxy.
    const ip =
      process.env.TRUST_PROXY === "true"
        ? (req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
          "unknown")
        : "local";
    if (path[0] === "health") {
      await db.$queryRaw`SELECT 1`;
      return NextResponse.json({ ok: true });
    }
    const installed = await initialized();
    if (method === "GET") {
      if (path[0] === "bootstrap") {
        const actor = (await auth()) ?? (await newSession());
        const config = await settings();
        return NextResponse.json({
          installed,
          csrf: actor.csrf,
          user: actor.user
            ? {
                id: actor.user.id,
                username: actor.user.username,
                role: actor.user.role,
              }
            : null,
          settings: config,
        });
      }
      if (path[0] === "install") {
        assert(!installed, 409, "系统已经安装。");
        return NextResponse.json(await installCheck());
      }
      assert(installed, 503, "请先完成安装。");
      const actor = await auth();
      if (path[0] === "tests")
        return NextResponse.json(await testRead(path.slice(1), actor));
      if (path[0] === "admin") {
        assert(actor, 401, "请先登录。");
        return NextResponse.json(await adminRead(path[1], actor, url));
      }
      if (path[0] === "me") {
        assert(actor?.user, 401, "请先登录。");
        if (path[1] === "created")
          return NextResponse.json({
            items: await db.test.findMany({
              where: { creatorId: actor.userId, deletedAt: null },
              include: {
                currentVersion: { select: { version: true } },
                _count: { select: { shares: true } },
                versions: {
                  select: { _count: { select: { sessions: true } } },
                },
              },
              orderBy: { createdAt: "desc" },
            }),
          });
        return NextResponse.json({
          items: await db.testSession.findMany({
            where: { userId: actor.userId, completedAt: { not: null } },
            include: {
              analysis: { select: { summary: true, resultLabel: true } },
              testVersion: {
                select: {
                  version: true,
                  test: { select: { title: true, slug: true } },
                },
              },
            },
            orderBy: { completedAt: "desc" },
          }),
        });
      }
      if (path[0] === "ads") {
        const page = z
          .enum(["home", "test", "result", "other"])
          .parse(url.searchParams.get("page"));
        const ads = await db.adConfig.findMany({ where: { enabled: true } });
        return NextResponse.json({
          items: ads
            .filter((a) => (a.pages as string[]).includes(page))
            .map((a) => ({ id: a.id, label: a.label })),
        });
      }
      if (path[0] === "ad-frame") {
        const ad = await db.adConfig.findUnique({ where: { id: path[1] } });
        assert(ad?.enabled, 404, "广告不可用。");
        return new Response(
          `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;font:14px sans-serif">${ad.code}</body></html>`,
          {
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "X-Frame-Options": "SAMEORIGIN",
              "Content-Security-Policy":
                "default-src https: data:; script-src https: 'unsafe-inline'; style-src https: 'unsafe-inline'; frame-ancestors 'self'; form-action 'none'; base-uri 'none'",
              "Cache-Control": "no-store",
            },
          },
        );
      }
      throw new AppError(404, "接口不存在。");
    }
    const actor = await csrf(req);
    // Without a trusted proxy address, use the validated session instead of
    // treating every visitor as the same "local" client.
    const rateIdentity = ip === "local" ? actor.id : ip;
    if (path[0] === "uploads") {
      assert(installed && isAdmin(actor.user?.role), 403, "需要管理员权限。");
      const form = await req.formData();
      const file = form.get("file");
      assert(
        file instanceof File && file.size <= 2 * 1024 * 1024,
        400,
        "请选择不超过 2MB 的图片。",
      );
      const bytes = Buffer.from(await file.arrayBuffer());
      let ext: string | undefined;
      if (
        bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      )
        ext = "png";
      if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ext = "jpg";
      if (
        bytes.subarray(0, 4).toString() === "RIFF" &&
        bytes.subarray(8, 12).toString() === "WEBP"
      )
        ext = "webp";
      assert(ext, 400, "仅支持 PNG、JPEG、WebP 图片。");
      const filename = `${token()}.${ext}`;
      await writeFile(`public/uploads/${filename}`, bytes);
      return NextResponse.json({ url: `/uploads/${filename}` });
    }
    const raw = await req.text();
    assert(Buffer.byteLength(raw) <= 250000, 413, "请求内容过大。");
    let body: unknown;
    try {
      body = JSON.parse(raw || "{}");
    } catch {
      throw new AppError(400, "JSON 格式不合法。");
    }
    let result: unknown;
    if (path[0] === "install") {
      assert(!installed, 409, "系统已经安装。");
      assert(
        path[1] === "connection" || path[1] === "complete",
        404,
        "接口不存在。",
      );
      await rateLimit(`install:${path[1]}:${rateIdentity}`, 1, 60);
      result = await installAction(path[1], body);
    } else {
      assert(installed, 503, "请先完成安装。");
      if (path[0] === "auth")
        result = await authAction(path[1], body, rateIdentity);
      else if (path[0] === "tests")
        result = await testAction(path.slice(1), body, actor, rateIdentity);
      else if (path[0] === "admin")
        result = await adminAction(
          path[1],
          path[2],
          body,
          actor,
          ip,
        );
      else if (path[0] === "ads") {
        const { id } = z.object({ id: z.string().uuid() }).parse(body);
        await rateLimit(`ad:${actor.id}:${id}`, 1, 60);
        await db.adConfig.updateMany({
          where: { id, enabled: true },
          data: { impressions: { increment: 1 } },
        });
        result = { ok: true };
      } else throw new AppError(404, "接口不存在。");
    }
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        {
          error: error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .slice(0, 6)
            .join("；"),
        },
        { status: 400 },
      );
    const failure = safeError(error);
    return NextResponse.json(
      { error: failure.message, code: failure.code },
      { status: failure.status },
    );
  }
}
export const GET = handle;
export const POST = handle;
