import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";
export const token = () => randomBytes(32).toString("base64url");
export const hashToken = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function key() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || !/^[a-f\d]{64}$/i.test(raw))
    throw new Error("ENCRYPTION_KEY must contain 64 hex characters");
  return Buffer.from(raw, "hex");
}
export function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [
    iv.toString("hex"),
    cipher.getAuthTag().toString("hex"),
    encrypted.toString("hex"),
  ].join(":");
}
export function decrypt(value: string) {
  const [iv, tag, data] = value.split(":");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(iv, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "hex")),
    decipher.final(),
  ]).toString("utf8");
}
