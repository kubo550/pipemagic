import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { env } from "@/lib/env";

/**
 * Symmetric encryption for secrets at rest (OAuth tokens). AES-256-GCM gives us
 * confidentiality + integrity (the auth tag detects tampering). PRD §8.
 *
 * Serialized form: `base64(iv).base64(authTag).base64(ciphertext)`.
 * Never log the inputs or outputs of these functions.
 */

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit nonce, the standard for GCM.

function getKey(): Buffer {
  const key = Buffer.from(env.TOKEN_ENC_KEY, "base64");
  if (key.length !== 32) {
    throw new Error(
      "TOKEN_ENC_KEY must decode to exactly 32 bytes (base64 of 32 random bytes).",
    );
  }
  return key;
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

export function decrypt(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed ciphertext payload.");
  }
  const decipher = createDecipheriv(
    ALGO,
    getKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
