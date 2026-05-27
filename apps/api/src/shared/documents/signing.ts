import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";

function getBackend(): "local" | "kms" {
  const b = process.env["SIGNING_BACKEND"] ?? "local";
  if (b !== "local" && b !== "kms") throw new Error(`Unknown SIGNING_BACKEND: ${b}`);
  return b;
}

// Deterministic JSON serialisation: sorts object keys recursively so the same
// logical payload always produces the same byte sequence regardless of key order.
function sortKeys(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    sorted[key] = sortKeys(record[key]);
  }
  return sorted;
}

function canonicalise(payload: Record<string, unknown>): Buffer {
  return Buffer.from(JSON.stringify(sortKeys(payload)));
}

function envPrivateKey(tenantSlug: string) {
  const name = `TENANT_SIGNING_KEY_PRIVATE_${tenantSlug.toUpperCase()}`;
  const raw = process.env[name];
  if (!raw) throw new Error(`${name} is not set — generate a key pair and add it to .env`);
  return createPrivateKey({ key: Buffer.from(raw, "base64"), format: "der", type: "pkcs8" });
}

function envPublicKey(tenantSlug: string) {
  const name = `TENANT_SIGNING_KEY_PUBLIC_${tenantSlug.toUpperCase()}`;
  const raw = process.env[name];
  if (!raw) throw new Error(`${name} is not set — generate a key pair and add it to .env`);
  return createPublicKey({ key: Buffer.from(raw, "base64"), format: "der", type: "spki" });
}

export function signDocument(tenantSlug: string, payload: Record<string, unknown>): string {
  if (getBackend() === "kms") throw new Error("KMS signing backend is not yet implemented");
  const sig = sign(null, canonicalise(payload), envPrivateKey(tenantSlug));
  return sig.toString("base64url");
}

export function verifySignature(
  tenantSlug: string,
  payload: Record<string, unknown>,
  signature: string,
): boolean {
  if (getBackend() === "kms") throw new Error("KMS signing backend is not yet implemented");
  try {
    return verify(
      null,
      canonicalise(payload),
      envPublicKey(tenantSlug),
      Buffer.from(signature, "base64url"),
    );
  } catch {
    return false;
  }
}

// Returns the tenant's Ed25519 public key as a base64-encoded DER (SPKI) blob.
// Published at GET /api/v1/tenants/:slug/pto-pubkey so anyone can verify a PTO.
export function getTenantPublicKey(tenantSlug: string): string {
  if (getBackend() === "kms") throw new Error("KMS signing backend is not yet implemented");
  const pubKey = envPublicKey(tenantSlug);
  return (pubKey.export({ type: "spki", format: "der" }) as Buffer).toString("base64");
}
