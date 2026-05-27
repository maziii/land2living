import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

function getKey(): Buffer {
  const hex = process.env["RESIDENT_ID_ENCRYPTION_KEY"];
  if (!hex) throw new Error("RESIDENT_ID_ENCRYPTION_KEY is not set");
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32)
    throw new Error("RESIDENT_ID_ENCRYPTION_KEY must be a 32-byte hex string (64 chars)");
  return key;
}

// Stores ciphertext as <iv_b64>:<authTag_b64>:<ciphertext_b64>
export function encryptIdNumber(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12); // 96-bit nonce for AES-256-GCM
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptIdNumber(encrypted: string): string {
  const key = getKey();
  const parts = encrypted.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted ID number format");
  const [ivB64, tagB64, cipherB64] = parts as [string, string, string];
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(cipherB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

// SA IDs are 13 digits — expose last 6, mask the rest.
export function maskIdNumber(plaintext: string): string {
  if (plaintext.length <= 6) return "*".repeat(plaintext.length);
  return "*".repeat(plaintext.length - 6) + plaintext.slice(-6);
}
