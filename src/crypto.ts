import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const IV_BYTES = 12;
const TAG_BYTES = 16;

function key(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

// AES-256-GCM: a changed or forged value fails to open instead of decrypting to garbage.
export function seal(value: unknown, secret: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}

export function unseal<T>(sealed: string, secret: string): T | null {
  try {
    const raw = Buffer.from(sealed, "base64url");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(secret),
      raw.subarray(0, IV_BYTES),
    );
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    const data = Buffer.concat([
      decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]);
    return JSON.parse(data.toString("utf8")) as T;
  } catch {
    return null;
  }
}
