import { z } from "zod";
import argon2 from "argon2";
import nodemailer from "nodemailer";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { settings } from "@/lib/settings";
import { AppError, assert } from "@/lib/errors";
import { auth, newSession, cookieName } from "@/security/auth";
import { token, hashToken } from "@/security/crypto";
import { rateLimit } from "@/security/rate-limit";
export const credentials = z.object({
  email: z
    .string()
    .email()
    .max(200)
    .transform((s) => s.toLowerCase()),
  password: z.string().min(10).max(128),
});
export async function authAction(action: string, body: unknown, ip: string) {
  assert(
    ["register", "login", "logout", "password", "forgot", "reset"].includes(
      action,
    ),
    404,
    "接口不存在。",
  );
  await rateLimit(`auth:${action}:${ip}`, 1, 60);
  if (action === "register") {
    assert((await settings()).registration, 403, "本站已关闭注册。");
    const input = credentials
      .extend({ username: z.string().min(2).max(40) })
      .parse(body);
    const existing = await db.user.findUnique({
      where: { email: input.email },
    });
    assert(!existing, 409, "该邮箱已注册。");
    const user = await db.user.create({
      data: {
        email: input.email,
        username: input.username,
        passwordHash: await argon2.hash(input.password, {
          type: argon2.argon2id,
        }),
      },
    });
    await newSession(user.id);
    return { ok: true };
  }
  if (action === "login") {
    const input = credentials.parse(body);
    const user = await db.user.findUnique({ where: { email: input.email } });
    const valid = user
      ? await argon2.verify(user.passwordHash, input.password)
      : await argon2.verify(
          await argon2.hash("dummy-password-value"),
          input.password,
        );
    assert(
      user && valid && user.status === "active" && !user.deletedAt,
      401,
      "邮箱或密码错误，或账号不可用。",
    );
    const previous = await auth();
    if (previous) await db.session.delete({ where: { id: previous.id } });
    await newSession(user.id);
    return { ok: true };
  }
  if (action === "logout") {
    const session = await auth();
    if (session) await db.session.delete({ where: { id: session.id } });
    (await cookies()).delete(cookieName);
    return { ok: true };
  }
  if (action === "password") {
    const actor = await auth();
    assert(actor?.user, 401, "请先登录。");
    const input = z
      .object({
        oldPassword: z.string(),
        password: z.string().min(10).max(128),
      })
      .parse(body);
    assert(
      await argon2.verify(actor.user.passwordHash, input.oldPassword),
      400,
      "原密码不正确。",
    );
    await db.$transaction([
      db.user.update({
        where: { id: actor.user.id },
        data: { passwordHash: await argon2.hash(input.password) },
      }),
      db.session.deleteMany({ where: { userId: actor.user.id } }),
    ]);
    await newSession(actor.user.id);
    return { ok: true };
  }
  if (action === "forgot") {
    const input = z
      .object({
        email: z
          .string()
          .email()
          .transform((s) => s.toLowerCase()),
      })
      .parse(body);
    if (!process.env.SMTP_HOST || !process.env.SMTP_FROM)
      throw new AppError(503, "本站尚未配置密码找回邮件服务，请联系管理员。");
    const user = await db.user.findUnique({ where: { email: input.email } });
    if (user && user.status === "active" && !user.deletedAt) {
      const raw = token();
      await db.passwordReset.deleteMany({ where: { userId: user.id } });
      await db.passwordReset.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(raw),
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_PORT === "465",
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
          : undefined,
      });
      await transport.sendMail({
        from: process.env.SMTP_FROM,
        to: user.email,
        subject: "测测be · 重置密码",
        text: `请在 1 小时内打开以下地址重置密码：${process.env.APP_URL}/reset?token=${raw}\n如非本人操作，请忽略此邮件。`,
      });
    }
    return { ok: true, message: "如果该邮箱可用，重置邮件将发送至你的邮箱。" };
  }
  if (action === "reset") {
    const input = z
      .object({
        token: z.string().min(20),
        password: z.string().min(10).max(128),
      })
      .parse(body);
    const hash = hashToken(input.token);
    const reset = await db.passwordReset.findUnique({
      where: { tokenHash: hash },
    });
    assert(
      reset && reset.expiresAt > new Date(),
      400,
      "重置链接无效或已过期。",
    );
    const passwordHash = await argon2.hash(input.password);
    await db.$transaction(async (tx) => {
      const used = await tx.passwordReset.deleteMany({
        where: { id: reset.id, expiresAt: { gt: new Date() } },
      });
      assert(used.count === 1, 400, "重置链接已使用。");
      await tx.user.update({
        where: { id: reset.userId },
        data: { passwordHash },
      });
      await tx.session.deleteMany({ where: { userId: reset.userId } });
    });
    return { ok: true };
  }
  throw new AppError(404, "接口不存在。");
}
