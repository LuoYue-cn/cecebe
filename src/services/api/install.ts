import { z } from "zod";
import argon2 from "argon2";
import { access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { db, json } from "@/lib/db";
import { redis } from "@/lib/redis";
import { settingsSchema } from "@/lib/settings";
import { providerConfigSchema, createProvider } from "@/providers/provider";
import { encrypt } from "@/security/crypto";
import { assert } from "@/lib/errors";
import { installAllowed } from "@/security/permissions";
import { credentials } from "./auth";
export async function installCheck() {
  const database = await db.$queryRaw`SELECT 1`
    .then(() => true)
    .catch(() => false);
  const cache = await redis
    .ping()
    .then(() => true)
    .catch(() => false);
  const writable = await mkdir("public/uploads", { recursive: true })
    .then(() => access("public/uploads", constants.W_OK))
    .then(() => true)
    .catch(() => false);
  const configured =
    !!process.env.AUTH_SECRET &&
    process.env.AUTH_SECRET.length >= 32 &&
    /^[a-f\d]{64}$/i.test(process.env.ENCRYPTION_KEY ?? "") &&
    !!process.env.APP_URL;
  return { database, cache, writable, configured, node: process.versions.node };
}
export async function installAction(action: string, body: unknown) {
  const flags = await db.systemSetting.findMany({
    where: { key: { in: ["system_initialized", "install_locked"] } },
  });
  assert(
    installAllowed(
      flags.some((f) => f.key === "system_initialized" && f.value === true),
      flags.some((f) => f.key === "install_locked" && f.value === true),
    ),
    409,
    "系统已经安装，安装接口已锁定。",
  );
  if (action === "connection") {
    await createProvider(providerConfigSchema.parse(body)).testConnection();
    return { ok: true };
  }
  const input = z
    .object({
      admin: credentials
        .extend({
          username: z.string().min(2).max(40),
          confirmPassword: z.string(),
        })
        .refine((v) => v.password === v.confirmPassword, "两次密码不一致"),
      provider: providerConfigSchema,
      settings: settingsSchema,
    })
    .parse(body);
  const checks = await installCheck();
  assert(Object.values(checks).every(Boolean), 400, "环境检查未通过。");
  assert(
    new URL(input.settings.siteUrl).origin ===
      new URL(process.env.APP_URL!).origin,
    400,
    "站点 URL 必须与 APP_URL 一致。",
  );
  await createProvider(input.provider).testConnection();
  const passwordHash = await argon2.hash(input.admin.password);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(76914021)`;
    const initialized = await tx.systemSetting.findUnique({
      where: { key: "install_locked" },
    });
    assert(!initialized, 409, "系统已经安装。");
    await tx.user.create({
      data: {
        email: input.admin.email,
        username: input.admin.username,
        passwordHash,
        role: "SUPER_ADMIN",
      },
    });
    const { apiKey, ...provider } = input.provider;
    await tx.aIProvider.create({
      data: { ...provider, encryptedKey: encrypt(apiKey), isDefault: true },
    });
    await tx.systemSetting.createMany({
      data: [
        { key: "site", value: json(input.settings) },
        { key: "system_initialized", value: true },
        { key: "install_locked", value: true },
        { key: "installed_at", value: new Date().toISOString() },
      ],
    });
  });
  return { ok: true };
}
