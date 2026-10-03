import { z } from "zod";
import { db, json } from "@/lib/db";
import { assert, AppError } from "@/lib/errors";
import { settings } from "@/lib/settings";
import { type auth } from "@/security/auth";
import {
  isAdmin,
  canOwn,
  canShare,
  resultSensitivity,
} from "@/security/permissions";
import { rateLimit } from "@/security/rate-limit";
import { enforceContent, schemaModerationText } from "@/security/content";
import { token } from "@/security/crypto";
import {
  testSchema,
  answersSchema,
  type Answers,
  publicSchema,
} from "@/schemas/test";
import { ScoringEngine } from "@/scoring/engine";
import { findTest, addVersion, createTest, audit } from "../tests";
import { enqueue } from "../queue";
type Actor = NonNullable<Awaited<ReturnType<typeof auth>>>;
export async function testAction(
  parts: string[],
  body: unknown,
  actor: Actor,
  ip: string,
) {
  const config = await settings();
  const userId = actor.userId;
  if (parts[0] === "generate") {
    assert(userId || config.anonymousCreate, 401, "请登录后创建测试。");
    const input = z
      .object({
        topic: z.string().trim().min(3).max(config.maxInputLength),
        count: z.number().int().min(1).max(config.maxQuestions),
        language: z.enum(["zh-CN", "en", "ja", "zh-TW"]),
        mode: z
          .enum([
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
          ])
          .default("auto"),
      })
      .parse(body);
    enforceContent(input.topic, config);
    await rateLimit(`generate-ip:${ip}`, config.generationPerMinute, 60);
    if (!userId)
      await rateLimit(`anonymous-ip:${ip}`, config.anonymousPerMinute, 60);
    await rateLimit(
      `generate:${userId ?? actor.id}`,
      userId ? config.generationPerMinute : config.anonymousPerMinute,
      60,
    );
    const active = await db.generationJob.count({
      where: {
        ...(userId ? { ownerId: userId } : { anonymousOwner: actor.id }),
        status: { in: ["queued", "generating", "validating"] },
      },
    });
    assert(active < 2, 429, "请等待当前测试生成完毕。");
    const job = await db.generationJob.create({
      data: {
        ownerId: userId,
        anonymousOwner: userId ? null : actor.id,
        input: json(input),
      },
    });
    try {
      await enqueue(job.id, "generate");
    } catch {
      await db.generationJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          stage: "failed",
          error: "任务队列不可用，请重试。",
        },
      });
      throw new AppError(503, "任务队列不可用。");
    }
    return { jobId: job.id };
  }
  if (parts[0] === "sessions") {
    const id = parts[1];
    const session = await db.testSession.findUnique({
      where: { id },
      include: {
        testVersion: { include: { test: true } },
        score: true,
        analysis: true,
      },
    });
    assert(
      session &&
        (userId
          ? session.userId === userId
          : !session.userId && session.anonymousSessionId === actor.id),
      403,
      "你没有访问该记录的权限。",
    );
    if (parts[2] === "delete") {
      await db.$transaction([
        db.generationJob.deleteMany({ where: { id } }),
        db.testSession.delete({ where: { id } }),
      ]);
      return { ok: true };
    }
    if (parts[2] === "retry") {
      assert(session.status === "analysis_failed", 409, "该结果无需重试。");
      await rateLimit(`analysis:${actor.id}`, 1, 60);
      await db.generationJob.update({
        where: { id },
        data: { status: "queued", stage: "analyzing", error: null, input: {} },
      });
      await db.testSession.update({
        where: { id },
        data: { status: "analyzing" },
      });
      try {
        // BullMQ keeps failed jobs for inspection, so a retry needs a fresh
        // queue ID even though it processes the same result record.
        await enqueue(id, "analysis", true);
      } catch {
        await db.$transaction([
          db.generationJob.update({
            where: { id },
            data: {
              status: "failed",
              stage: "failed",
              error: "任务队列不可用。",
            },
          }),
          db.testSession.update({
            where: { id },
            data: { status: "analysis_failed" },
          }),
        ]);
        throw new AppError(503, "任务队列不可用。");
      }
      return { ok: true };
    }
    if (parts[2] === "share") {
      assert(
        session.status === "completed" && session.analysis,
        409,
        "结果分析尚未完成。",
      );
      const input = z
        .object({ confirmed: z.boolean().default(false) })
        .parse(body);
      const test = session.testVersion.test;
      assert(
        canShare(
          resultSensitivity(
            test.sensitivity,
            testSchema.parse(session.testVersion.schema).sensitivity,
          ),
          config,
          input.confirmed,
        ),
        403,
        test.sensitivity === "high_risk"
          ? "高风险结果不允许公开分享。"
          : "请确认敏感结果分享提醒，或联系管理员检查分享设置。",
      );
      assert(
        test.status === "published" &&
          test.visibility === "public" &&
          !test.deletedAt,
        400,
        "请先公开发布原测试。",
      );
      const share = await db.share.create({
        data: {
          testId: test.id,
          sessionId: id,
          creatorId: userId,
          anonymousOwner: userId ? null : actor.id,
          type: "result",
          shareCode: token(),
        },
      });
      return {
        url: `${config.siteUrl}/s/${share.shareCode}`,
        code: share.shareCode,
      };
    }
    throw new AppError(404, "接口不存在。");
  }
  if (parts[0] === "shares") {
    const share = await db.share.findUnique({ where: { shareCode: parts[1] } });
    assert(
      share && canOwn(share, { userId, sessionId: actor.id }),
      403,
      "你没有修改该分享的权限。",
    );
    await db.share.update({
      where: { id: share.id },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }
  const slug = parts[0];
  const test = await findTest(slug, {
    userId,
    id: actor.id,
    admin: isAdmin(actor.user?.role),
  });
  const owner = canOwn(test, { userId, sessionId: actor.id });
  const schema = testSchema.parse(test.currentVersion!.schema);
  if (parts[1] === "start") {
    assert(userId || config.anonymousTest, 401, "请登录后参加测试。");
    await rateLimit(`start:${actor.id}`, 1, 60);
    const session = await db.testSession.create({
      data: {
        testVersionId: test.currentVersionId!,
        userId,
        anonymousSessionId: userId ? null : actor.id,
      },
    });
    return { sessionId: session.id };
  }
  if (parts[1] === "submit") {
    assert(userId || config.anonymousTest, 401, "请登录后参加测试。");
    const input = z
      .object({ sessionId: z.string().uuid(), answers: answersSchema })
      .parse(body);
    const session = await db.testSession.findUnique({
      where: { id: input.sessionId },
      include: { testVersion: true },
    });
    assert(
      session &&
        session.testVersion.testId === test.id &&
        (userId
          ? session.userId === userId
          : !session.userId && session.anonymousSessionId === actor.id),
      403,
      "答题会话无效。",
    );
    assert(session.status === "started", 409, "该答卷已提交。");
    const version = testSchema.parse(session.testVersion.schema);
    let score;
    try {
      score = ScoringEngine.calculate(version, input.answers);
    } catch (error) {
      throw new AppError(
        400,
        error instanceof Error ? error.message : "答案不合法。",
      );
    }
    const openAnswers: Answers = {};
    for (const q of version.questions.filter((q) => q.type === "text"))
      if (input.answers[q.id]) openAnswers[q.id] = input.answers[q.id];
    await db.$transaction(async (tx) => {
      const changed = await tx.testSession.updateMany({
        where: { id: session.id, status: "started" },
        data: {
          status: "analyzing",
          completedAt: new Date(),
          consistencyScore: score.consistencyScore,
        },
      });
      assert(changed.count === 1, 409, "该答卷已提交。");
      await tx.scoreResult.create({
        data: {
          sessionId: session.id,
          totalScore: score.totalScore,
          dimensionScores: json(score.dimensions),
          metadata: json({
            ...score.metadata,
            review: config.saveAnswers
              ? score.metadata.review
              : score.metadata.review.map(({ selected, ...item }) => ({
                  ...item,
                  selected: [],
                  selectedNotStored: !!selected.length,
                })),
          }),
        },
      });
      if (config.saveAnswers)
        await tx.answer.createMany({
          data: Object.entries(input.answers).map(([questionId, answer]) => ({
            sessionId: session.id,
            questionId,
            answer: json(answer),
          })),
        });
      await tx.generationJob.create({
        data: {
          id: session.id,
          ownerId: userId,
          anonymousOwner: userId ? null : actor.id,
          status: "queued",
          stage: "analyzing",
          input: json({ openAnswers, language: "zh-CN" }),
        },
      });
    });
    try {
      await enqueue(session.id, "analysis");
    } catch {
      await db.testSession.update({
        where: { id: session.id },
        data: { status: "analysis_failed" },
      });
      await db.generationJob.update({
        where: { id: session.id },
        data: { status: "failed", input: {}, error: "任务队列不可用。" },
      });
    }
    return { resultId: session.id };
  }
  if (parts[1] === "share") {
    assert(
      test.status === "published" && test.visibility === "public",
      400,
      "请先公开发布测试。",
    );
    const share = await db.share.create({
      data: {
        testId: test.id,
        creatorId: userId,
        anonymousOwner: userId ? null : actor.id,
        type: "test",
        shareCode: token(),
      },
    });
    return {
      url: `${config.siteUrl}/t/${slug}?ref=${share.shareCode}`,
      code: share.shareCode,
    };
  }
  assert(owner, 403, "只有创建者可以编辑测试。");
  if (parts[1] === "edit") {
    const input = z
      .object({
        schema: testSchema,
        cover: z.string().max(500).optional(),
        visibility: z.enum(["private", "public"]).optional(),
      })
      .parse(body);
    enforceContent(
      schemaModerationText(input.schema),
      config,
      input.schema.sensitivity,
    );
    assert(
      config.allowedTypes.includes(input.schema.type) &&
        input.schema.questions.length <= config.maxQuestions,
      400,
      "测试超出站点限制。",
    );
    const result = await addVersion(
      test.id,
      input.schema,
      userId ?? actor.id,
      input.cover,
      input.visibility,
    );
    return { slug: result.slug };
  }
  if (parts[1] === "publish") {
    await db.test.update({
      where: { id: test.id },
      data: { status: "published", visibility: "public" },
    });
    return { ok: true };
  }
  if (parts[1] === "unpublish") {
    await db.test.update({
      where: { id: test.id },
      data: { status: "draft", visibility: "private" },
    });
    return { ok: true };
  }
  if (parts[1] === "delete") {
    await db.test.update({
      where: { id: test.id },
      data: { status: "removed", deletedAt: new Date() },
    });
    await audit(userId ?? actor.id, "delete_own_test", test.id);
    return { ok: true };
  }
  if (parts[1] === "copy") {
    const copy = await createTest(
      { ...schema, title: `${schema.title}（副本）` },
      userId,
      userId ? null : actor.id,
    );
    return { slug: copy.slug };
  }
  throw new AppError(404, "接口不存在。");
}
export async function testRead(parts: string[], actor: Actor | null) {
  const userId = actor?.userId;
  if (parts[0] === "jobs") {
    const job = await db.generationJob.findUnique({ where: { id: parts[1] } });
    assert(
      job &&
        actor &&
        (userId
          ? job.ownerId === userId
          : !job.ownerId && job.anonymousOwner === actor.id),
      403,
      "你没有查看此任务的权限。",
    );
    return {
      id: job.id,
      status: job.status,
      stage: job.stage,
      resultId: job.resultId,
      error: job.error,
    };
  }
  const test = await findTest(
    parts[0],
    actor ? { userId, id: actor.id, admin: isAdmin(actor.user?.role) } : null,
  );
  if (parts[1] === "edit") {
    assert(
      actor && canOwn(test, { userId, sessionId: actor.id }),
      403,
      "你没有编辑该测试的权限。",
    );
    return { test, schema: testSchema.parse(test.currentVersion!.schema) };
  }
  if (parts[1] === "stats") {
    assert(
      actor && canOwn(test, { userId, sessionId: actor.id }),
      403,
      "你没有访问统计的权限。",
    );
    const sessions = await db.testSession.findMany({
      where: { testVersion: { testId: test.id } },
      include: { score: true, analysis: true },
    });
    const completed = sessions.filter((s) => s.completedAt);
    const distribution: Record<string, number> = {},
      dimensions: Record<string, { sum: number; count: number }> = {};
    for (const s of completed) {
      if (s.analysis)
        distribution[s.analysis.resultLabel] =
          (distribution[s.analysis.resultLabel] ?? 0) + 1;
      if (s.score)
        for (const [k, v] of Object.entries(
          s.score.dimensionScores as Record<string, number>,
        )) {
          dimensions[k] ??= { sum: 0, count: 0 };
          dimensions[k].sum += v;
          dimensions[k].count++;
        }
    }
    return {
      started: sessions.length,
      completed: completed.length,
      averageSeconds: completed.length
        ? Math.round(
            completed.reduce(
              (sum, s) =>
                sum + (s.completedAt!.getTime() - s.startedAt.getTime()) / 1000,
              0,
            ) / completed.length,
          )
        : 0,
      dropoutRate: sessions.length
        ? Math.round(
            ((sessions.length - completed.length) / sessions.length) * 100,
          )
        : 0,
      distribution,
      dimensions: Object.fromEntries(
        Object.entries(dimensions).map(([k, v]) => [
          k,
          Math.round(v.sum / v.count),
        ]),
      ),
      shareVisits:
        (
          await db.share.aggregate({
            where: { testId: test.id },
            _sum: { clickCount: true },
          })
        )._sum.clickCount ?? 0,
    };
  }
  return {
    id: test.id,
    slug: test.slug,
    status: test.status,
    versionId: test.currentVersionId,
    version: test.currentVersion!.version,
    schema: publicSchema(testSchema.parse(test.currentVersion!.schema)),
    owner: !!actor && canOwn(test, { userId, sessionId: actor.id }),
  };
}
