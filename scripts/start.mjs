import "dotenv/config";
import { cpSync, mkdirSync, existsSync, symlinkSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
const target = ".next/standalone";
if (!existsSync(`${target}/server.js`))
  throw new Error("Run npm run build first.");
cpSync(".next/static", `${target}/.next/static`, { recursive: true });
cpSync("public", `${target}/public`, {
  recursive: true,
  filter: (source) => !source.endsWith("/uploads"),
});
mkdirSync("public/uploads", { recursive: true });
const uploadTarget = `${target}/public/uploads`;
if (existsSync(uploadTarget))
  rmSync(uploadTarget, { recursive: true, force: true });
symlinkSync(resolve("public/uploads"), uploadTarget, "dir");
const child = spawn(process.execPath, [`${target}/server.js`], {
  stdio: "inherit",
  env: { ...process.env, HOSTNAME: "0.0.0.0" },
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
