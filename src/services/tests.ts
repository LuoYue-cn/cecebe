import { db, json } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { testSchema, type TestSchema } from "@/schemas/test";
import { token } from "@/security/crypto";
import { assert } from "@/lib/errors";
export function versionData(
  schema: TestSchema,
  createdBy: string,
  version: number,
) {
  return {
    version,
    createdBy,
    schema: json(schema),
    dimensions: {
      create: schema.dimensions.map((d) => ({
        key: d.id,
        name: d.name,
        description: d.description,
      })),
    },
    questions: {
      create: schema.questions.map((q, position) => ({
        key: q.id,
        type: q.type,
        text: q.text,
        position,
        options: {
          create: q.options.map((o) => ({
            key: o.id,
            text: o.text,
            scores: json(o.scores),
          })),
        },
      })),
    },
  };
}
export async function createTest(
  schema: TestSchema,
  ownerId: string | null,
  anonymousOwner: string | null,
  jobId?: string,
) {
  const valid = testSchema.parse(schema);
  return db.$transaction(async (tx) => {
    if (jobId) {
      await tx.$queryRaw(
        PrismaSql`SELECT id FROM "GenerationJob" WHERE id = ${jobId} FOR UPDATE`,
      );
      const existing = await tx.generationJob.findUniqueOrThrow({
        where: { id: jobId },
      });
      if (existing.status === "completed" && existing.resultId)
        return tx.test.findUniqueOrThrow({
          where: { slug: existing.resultId },
        });
    }
    const test = await tx.test.create({
      data: {
        creatorId: ownerId,
        anonymousOwner,
        slug: `test-${token().slice(0, 12)}`,
        title: valid.title,
        description: valid.description,
        type: valid.type,
        sensitivity: valid.sensitivity,
        versions: {
          create: versionData(valid, ownerId ?? anonymousOwner ?? "system", 1),
        },
      },
      include: { versions: true },
    });
    const updated = await tx.test.update({
      where: { id: test.id },
      data: { currentVersionId: test.versions[0].id },
    });
    if (jobId)
      await tx.generationJob.update({
        where: { id: jobId },
        data: {
          status: "completed",
          stage: "completed",
          resultId: updated.slug,
          input: {},
        },
      });
    return updated;
  });
}
export async function addVersion(
  testId: string,
  schema: TestSchema,
  actorId: string,
  cover?: string,
  visibility?: string,
) {
  const valid = testSchema.parse(schema);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw(
      PrismaSql`SELECT id FROM "Test" WHERE id = ${testId} FOR UPDATE`,
    );
    const latest = await tx.testVersion.findFirst({
      where: { testId },
      orderBy: { version: "desc" },
    });
    const version = await tx.testVersion.create({
      data: {
        testId,
        ...versionData(valid, actorId, (latest?.version ?? 0) + 1),
      },
    });
    return tx.test.update({
      where: { id: testId },
      data: {
        currentVersionId: version.id,
        title: valid.title,
        description: valid.description,
        type: valid.type,
        sensitivity: valid.sensitivity,
        ...(cover !== undefined ? { cover } : {}),
        ...(visibility ? { visibility } : {}),
      },
    });
  });
}
import { Prisma as PrismaValue } from "@prisma/client";
const PrismaSql = PrismaValue.sql;
export async function findTest(
  slug: string,
  actor: { userId?: string | null; id: string; admin?: boolean } | null,
) {
  const test = await db.test.findUnique({
    where: { slug },
    include: { currentVersion: true },
  });
  assert(
    test && !test.deletedAt && test.status !== "removed",
    404,
    "测试不存在或已下架。",
  );
  const own =
    actor &&
    ((actor.userId && test.creatorId === actor.userId) ||
      (!test.creatorId && test.anonymousOwner === actor.id) ||
      actor.admin);
  assert(
    own || (test.status === "published" && test.visibility === "public"),
    403,
    "这个测试尚未公开。",
  );
  assert(test.currentVersion, 404, "测试版本不存在。");
  return test;
}
export async function audit(
  actorId: string,
  action: string,
  target: string,
  ip?: string,
) {
  await db.auditLog.create({ data: { actorId, action, target, ip } });
}
export type TestWithVersion = Prisma.TestGetPayload<{
  include: { currentVersion: true };
}>;
