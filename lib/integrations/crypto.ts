import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM encrypt/decrypt for OAuth tokens stored in Firestore.
 *
 * Key comes from the ENCRYPTION_KEY env var — must be 64 hex chars (32 bytes).
 * Generate one with: openssl rand -hex 32   or   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Wire format (base64): [12-byte IV][16-byte auth tag][ciphertext]
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      "ENCRYPTION_KEY is not set. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\" and add it to your env vars."
    );
  }
  if (hex.length !== 64) {
    throw new Error(
      `ENCRYPTION_KEY must be 64 hex characters (32 bytes), got ${hex.length}.`
    );
  }
  return Buffer.from(hex, "hex");
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
    "utf8"
  );
}
