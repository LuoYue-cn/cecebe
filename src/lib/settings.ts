import { z } from "zod";
import { db, json } from "./db";
export const settingsSchema = z.object({
  siteName: z.string().min(1).max(40).default("测测be"),
  description: z.string().max(200).default("把好奇变成一份认识自己的测试"),
  siteUrl: z.string().url(),
  logo: z.string().max(500).default(""),
  favicon: z.string().max(500).default("/favicon.svg"),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#7047bf"),
  shareFooter: z.string().max(80).default("扫码测同款"),
  defaultLanguage: z.enum(["zh-CN", "en"]).default("zh-CN"),
  registration: z.boolean().default(true),
  anonymousTest: z.boolean().default(true),
  anonymousCreate: z.boolean().default(false),
  anonymousResults: z.boolean().default(true),
  saveAnswers: z.boolean().default(false),
  historyDays: z.number().int().min(1).max(3650).default(365),
  allowSensitive: z.boolean().default(true),
  allowHighRisk: z.boolean().default(false),
  aiLogs: z.boolean().default(true),
  moderation: z.boolean().default(true),
  resultSharing: z.boolean().default(true),
  highRiskSharing: z.boolean().default(false),
  maxQuestions: z.number().int().min(1).max(100).default(50),
  maxInputLength: z.number().int().min(10).max(5000).default(500),
  generationPerMinute: z.number().int().min(1).max(100).default(1),
  anonymousPerMinute: z.number().int().min(1).max(50).default(1),
  allowedTypes: z
    .array(
      z.enum([
        "knowledge",
        "ability",
        "personality",
        "preference",
        "relationship",
        "entertainment",
        "self_exploration",
      ]),
    )
    .min(1)
    .default([
      "knowledge",
      "ability",
      "personality",
      "preference",
      "relationship",
      "entertainment",
      "self_exploration",
    ]),
  sensitiveWords: z.array(z.string().min(1).max(100)).max(200).default([]),
  auditIp: z.boolean().default(false),
});
export type Settings = z.infer<typeof settingsSchema>;
export async function initialized() {
  return (
    (
      await db.systemSetting.findUnique({
        where: { key: "system_initialized" },
      })
    )?.value === true
  );
}
export async function settings(): Promise<Settings> {
  const record = await db.systemSetting.findUnique({ where: { key: "site" } });
  return settingsSchema.parse(
    record?.value ?? {
      siteUrl: process.env.APP_URL || "http://localhost:3000",
    },
  );
}
export async function saveSettings(value: Settings) {
  await db.systemSetting.upsert({
    where: { key: "site" },
    create: { key: "site", value: json(value) },
    update: { value: json(value) },
  });
}
