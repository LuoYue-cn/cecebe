import Redis from "ioredis";
const shared = globalThis as unknown as { redis?: Redis };
export const redis =
  shared.redis ??
  new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
    lazyConnect: true,
  });
if (process.env.NODE_ENV !== "production") shared.redis = redis;
