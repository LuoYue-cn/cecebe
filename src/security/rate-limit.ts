import { redis } from "@/lib/redis";
import { AppError } from "@/lib/errors";
import { createHash } from "node:crypto";
export async function rateLimit(key: string, limit: number, seconds: number) {
  const digest = createHash("sha256").update(key).digest("hex");
  const count = await redis.eval(
    "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",
    1,
    `rate:minute:${digest}`,
    seconds,
  );
  if (Number(count) > limit)
    throw new AppError(429, `请求过于频繁，${seconds / 60} 分钟内最多 ${limit} 次，请稍后再试。`, "RATE_LIMIT");
}
