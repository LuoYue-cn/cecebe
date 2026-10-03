import { Queue } from "bullmq";
import { token } from "@/security/crypto";
const url = new URL(process.env.REDIS_URL || "redis://localhost:6379");
export const queueConnection = {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  connectTimeout: 5000,
  host: url.hostname,
  port: Number(url.port || 6379),
  username: url.username || undefined,
  password: url.password || undefined,
  db: Number(url.pathname.slice(1) || 0),
  ...(url.protocol === "rediss:" ? { tls: {} } : {}),
};
export const queue = new Queue("cecebe", { connection: queueConnection });
export async function enqueue(
  id: string,
  kind: "generate" | "analysis",
  retry = false,
) {
  await queue.add(
    kind,
    { id },
    {
      jobId: `${kind}-${id}${retry ? `-${token().slice(0, 12)}` : ""}`,
      attempts: 1,
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  );
}
