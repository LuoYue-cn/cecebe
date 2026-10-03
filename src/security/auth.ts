import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { hashToken, token } from "./crypto";
import { assert } from "@/lib/errors";
export const cookieName = "cecebe_session";
export async function auth() {
  const raw = (await cookies()).get(cookieName)?.value;
  const session = raw
    ? await db.session.findUnique({
        where: { id: hashToken(raw) },
        include: { user: true },
      })
    : null;
  if (!session || session.expiresAt < new Date()) return null;
  if (
    session.user &&
    (session.user.status !== "active" || session.user.deletedAt)
  )
    return null;
  return session;
}
export async function newSession(userId?: string) {
  const raw = token();
  const session = await db.session.create({
    data: {
      id: hashToken(raw),
      csrf: token(),
      userId,
      expiresAt: new Date(Date.now() + 30 * 86400000),
    },
    include: { user: true },
  });
  (await cookies()).set(cookieName, raw, {
    httpOnly: true,
    sameSite: "lax",
    secure:
      new URL(process.env.APP_URL || "http://localhost:3000").protocol ===
      "https:",
    path: "/",
    maxAge: 30 * 86400,
  });
  return session;
}
export async function requireAuth() {
  const actor = await auth();
  assert(actor?.user, 401, "请先登录。");
  return actor;
}
export async function csrf(req: Request) {
  const origin = req.headers.get("origin");
  const expected = new URL(process.env.APP_URL || "http://localhost:3000")
    .origin;
  assert(origin === expected, 403, "请求来源不合法。");
  const actor = await auth();
  assert(
    actor && req.headers.get("x-csrf-token") === actor.csrf,
    403,
    "安全校验失败，请刷新页面。",
  );
  return actor;
}
