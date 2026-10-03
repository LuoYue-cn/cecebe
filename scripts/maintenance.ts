import "dotenv/config";
import { db } from "../src/lib/db";
import { settings } from "../src/lib/settings";
async function main() {
  const config = await settings();
  const before = new Date(Date.now() - config.historyDays * 86400000);
  const old = await db.testSession.findMany({
    where: { completedAt: { lt: before } },
    select: { id: true },
  });
  await db.$transaction([
    db.generationJob.deleteMany({
      where: { id: { in: old.map((s) => s.id) } },
    }),
    db.testSession.deleteMany({ where: { id: { in: old.map((s) => s.id) } } }),
    db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
    db.passwordReset.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
    db.rateLimitRecord.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
    db.generationJob.updateMany({
      where: {
        stage: "analyzing",
        createdAt: { lt: new Date(Date.now() - 86400000) },
      },
      data: { input: {} },
    }),
  ]);
  console.info(
    JSON.stringify({
      level: "INFO",
      event: "retention_cleanup",
      deleted: old.length,
    }),
  );
}
main().finally(() => db.$disconnect());
