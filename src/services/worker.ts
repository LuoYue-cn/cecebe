import "dotenv/config";
import { Worker } from "bullmq";
import { z } from "zod";
import { db, json } from "@/lib/db";
import { settings } from "@/lib/settings";
import { queueConnection } from "./queue";
import { aiStructured } from "./ai";
import {
  testSchema,
  generationWireSchema,
  fromWire,
  analysisSchema,
  type Answers,
} from "@/schemas/test";
import { createTest } from "./tests";
import { enforceContent, schemaModerationText } from "@/security/content";
import { AppError } from "@/lib/errors";
const inputSchema = z.object({
  topic: z.string(),
  count: z.number(),
  language: z.string(),
  mode: z.enum([
    "auto",
    ...([
      "knowledge",
      "ability",
      "personality",
      "preference",
      "relationship",
      "entertainment",
      "self_exploration",
    ] as const),
  ]),
});
export async function processGeneration(id: string) {
  const job = await db.generationJob.findUniqueOrThrow({ where: { id } });
  if (job.status === "completed") return;
  const input = inputSchema.parse(job.input);
  const config = await settings();
  await db.generationJob.update({
    where: { id },
    data: { status: "generating", stage: "classifying" },
  });
  const classification = await aiStructured(
    "classification",
    z
      .object({
        type: z.enum([
          "knowledge",
          "ability",
          "personality",
          "preference",
          "relationship",
          "entertainment",
          "self_exploration",
        ]),
        sensitivity: z.enum(["normal", "sensitive", "high_risk"]),
      })
      .strict(),
    input,
  );
  const type = input.mode === "auto" ? classification.data.type : input.mode;
  if (!config.allowedTypes.includes(type))
    throw new AppError(400, "该测试类型暂未开放。");
  let level = enforceContent(
    input.topic,
    config,
    classification.data.sensitivity,
  );
  if (config.moderation) {
    await db.generationJob.update({
      where: { id },
      data: { stage: "moderating" },
    });
    const safety = await aiStructured(
      "safety",
      z
        .object({
          allowed: z.boolean(),
          reason: z.string().max(500),
          sensitivity: z.enum(["normal", "sensitive", "high_risk"]),
        })
        .strict(),
      input,
    );
    if (!safety.data.allowed)
      throw new AppError(400, "该主题未通过内容审核，请修改测试目标。");
    const safetyLevel = enforceContent(
      input.topic,
      config,
      safety.data.sensitivity,
    );
    if (
      safetyLevel === "high_risk" ||
      (safetyLevel === "sensitive" && level === "normal")
    )
      level = safetyLevel;
  }
  await db.generationJob.update({
    where: { id },
    data: { stage: "designing" },
  });
  let schema;
  let repair: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    await db.generationJob.update({
      where: { id },
      data: { stage: attempt ? "repairing" : "generating" },
    });
    try {
      const response = await aiStructured("generation", generationWireSchema, {
        ...input,
        type,
        sensitivity: level,
        repair,
      });
      let converted;
      try {
        converted = fromWire(response.data);
      } catch {
        throw new AppError(502, "评分结构不合法。", "INVALID_SCHEMA");
      }
      const generated = { data: converted };
      await db.generationJob.update({
        where: { id },
        data: { stage: "validating", status: "validating" },
      });
      if (
        generated.data.questions.length !== input.count ||
        generated.data.type !== type
      )
        throw new AppError(502, "题目数量或类型不符合请求。", "INVALID_SCHEMA");
      const finalLevel = enforceContent(
        schemaModerationText(generated.data),
        config,
        generated.data.sensitivity,
      );
      generated.data.sensitivity =
        level === "high_risk" || finalLevel === "high_risk"
          ? "high_risk"
          : level === "sensitive" || finalLevel === "sensitive"
            ? "sensitive"
            : "normal";
      schema = generated.data;
      break;
    } catch (error) {
      if (
        !(error instanceof AppError) ||
        error.code !== "INVALID_SCHEMA" ||
        attempt
      )
        throw error;
      repair = error.message;
    }
  }
  if (!schema) throw new AppError(502, "无法生成有效的测试结构。");
  await createTest(schema, job.ownerId, job.anonymousOwner, id);
}
export async function processAnalysis(id: string) {
  const session = await db.testSession.findUniqueOrThrow({
    where: { id },
    include: { testVersion: true, score: true, analysis: true },
  });
  if (session.analysis) return;
  const schema = testSchema.parse(session.testVersion.schema);
  const job = await db.generationJob.findUnique({ where: { id } });
  const supplement = (job?.input ?? {}) as {
    language?: string;
    openAnswers?: Answers;
  };
  const scored = ["knowledge", "ability"].includes(schema.type);
  const outputSchema = scored
    ? analysisSchema
    : analysisSchema.superRefine((value, ctx) => {
        const ids = value.dimensionInsights.map((item) => item.dimensionId);
        if (
          ids.length !== schema.dimensions.length ||
          new Set(ids).size !== ids.length ||
          schema.dimensions.some((dimension) => !ids.includes(dimension.id))
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["dimensionInsights"],
            message:
              "倾向类必须为每个维度提供且只提供一个类型标签与解释，dimensionId 必须与输入完整对应。",
          });
        }
      });
  const result = await aiStructured(
    "analysis",
    outputSchema,
    {
      title: schema.title,
      type: schema.type,
      sensitivity: schema.sensitivity,
      dimensions: schema.dimensions,
      dimensionScores: session.score?.dimensionScores,
      ...(!scored
        ? {
            scoringContext: schema.questions
              .filter((q) => q.type !== "text")
              .map((q) => ({
                text: q.text,
                options: q.options.map((o) => ({
                  text: o.text,
                  scores: o.scores,
                })),
              })),
          }
        : {}),
      ...(scored ? { totalScore: session.score?.totalScore } : {}),
      resultMode: scored ? "scored" : "typology",
      consistencyScore: session.consistencyScore,
      language: supplement.language ?? "zh-CN",
      openAnswers: supplement.openAnswers ?? {},
    },
    true,
  );
  await db.$transaction([
    db.analysisResult.create({
      data: {
        sessionId: id,
        ...result.data,
        dimensionInsights: json(result.data.dimensionInsights),
        traits: json(result.data.traits),
        strengths: json(result.data.strengths),
        potentialIssues: json(result.data.potentialIssues),
        suggestions: json(result.data.suggestions),
        model: result.model,
      },
    }),
    db.testSession.update({ where: { id }, data: { status: "completed" } }),
    db.generationJob.update({
      where: { id },
      data: { status: "completed", stage: "completed", input: {} },
    }),
  ]);
}
const worker = new Worker(
  "cecebe",
  async (job) => {
    try {
      if (job.name === "generate") await processGeneration(job.data.id);
      else await processAnalysis(job.data.id);
    } catch (error) {
      const message =
        error instanceof AppError
          ? error.message
          : "AI 服务暂时不可用，请重试。";
      await db.generationJob.update({
        where: { id: job.data.id },
        data: {
          status: "failed",
          stage: "failed",
          error: message,
          input: {},
        },
      });
      if (job.name === "analysis")
        await db.testSession.update({
          where: { id: job.data.id },
          data: { status: "analysis_failed" },
        });
      throw new Error(message);
    }
  },
  {
    connection: { ...queueConnection, maxRetriesPerRequest: null },
    concurrency: 2,
    lockDuration: 360000,
  },
);
worker.on("ready", () =>
  console.info(JSON.stringify({ level: "INFO", event: "worker_ready" })),
);
worker.on("failed", (job) =>
  console.warn(
    JSON.stringify({ level: "WARN", event: "job_failed", id: job?.id }),
  ),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, async () => {
    await worker.close();
    await db.$disconnect();
    process.exit(0);
  });
