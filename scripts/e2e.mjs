import "dotenv/config";
import Redis from "ioredis";
import { spawn } from "node:child_process";
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error(
    "Set TEST_DATABASE_URL to a dedicated database ending in _test. It will be reset.",
  );
const env = {
  ...process.env,
  DATABASE_URL: url,
  REDIS_URL: process.env.TEST_REDIS_URL || "redis://localhost:6379/1",
  APP_URL: "http://localhost:3000",
  ALLOW_PRIVATE_AI: "true",
  NEXT_TELEMETRY_DISABLED: "1",
};
const children = [];
function run(command, args, wait = false) {
  const child = spawn(command, args, {
    env,
    stdio: "inherit",
    detached: !wait,
  });
  if (wait)
    return new Promise((resolve, reject) =>
      child.on("exit", (code) =>
        code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)),
      ),
    );
  children.push(child);
  return child;
}
const stop = () => {
  for (const child of children)
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
};
process.on("SIGINT", () => {
  stop();
  process.exit(130);
});
process.on("SIGTERM", () => {
  stop();
  process.exit(143);
});
try {
  if (Number(new URL(env.REDIS_URL).pathname.slice(1)) < 1)
    throw new Error(
      "TEST_REDIS_URL must use a dedicated nonzero Redis database; it will be cleared.",
    );
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1 });
  try {
    await redis.flushdb();
  } finally {
    redis.disconnect();
  }
  await run(
    "npx",
    ["prisma", "migrate", "reset", "--force", "--skip-seed"],
    true,
  );
  run("npx", ["tsx", "tests/mock-ai.ts"]);
  run("npm", ["run", "worker"]);
  run("npm", ["run", process.env.E2E_DEV === "true" ? "dev" : "start"]);
  let ready = false;
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch("http://localhost:3000/api/health");
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!ready) throw new Error("Application failed to start within 90 seconds");
  await run("npx", ["playwright", "test"], true);
} finally {
  stop();
}
