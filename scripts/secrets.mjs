import { randomBytes } from "node:crypto";
import { writeFileSync, existsSync } from "node:fs";
if (existsSync(".env"))
  throw new Error(".env already exists; preserve it and edit manually.");
const postgresPassword = randomBytes(24).toString("hex");
writeFileSync(
  ".env",
  `DATABASE_URL=postgresql://cecebe:${postgresPassword}@localhost:5432/cecebe?schema=public\nPOSTGRES_PASSWORD=${postgresPassword}\nREDIS_URL=redis://localhost:6379\nAPP_URL=http://localhost:3000\nAUTH_SECRET=${randomBytes(32).toString("hex")}\nENCRYPTION_KEY=${randomBytes(32).toString("hex")}\nALLOW_PRIVATE_AI=false\nTRUST_PROXY=false\nSMTP_HOST=\nSMTP_FROM=\n`,
  { mode: 0o600 },
);
console.log(
  "Created .env; set APP_URL and use Docker Compose. Keep this file private.",
);
