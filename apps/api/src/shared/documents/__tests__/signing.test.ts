import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signDocument, getTenantPublicKey, verifySignature } from "../signing.js";

// Generate an ephemeral Ed25519 key pair for each test run.
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privateB64 = (privateKey.export({ type: "pkcs8", format: "der" }) as Buffer).toString("base64");
const publicB64 = (publicKey.export({ type: "spki", format: "der" }) as Buffer).toString("base64");

const SLUG = "testcouncil";

describe("document signing (local backend)", () => {
  beforeEach(() => {
    process.env["SIGNING_BACKEND"] = "local";
    process.env[`TENANT_SIGNING_KEY_PRIVATE_${SLUG.toUpperCase()}`] = privateB64;
    process.env[`TENANT_SIGNING_KEY_PUBLIC_${SLUG.toUpperCase()}`] = publicB64;
  });

  afterEach(() => {
    delete process.env["SIGNING_BACKEND"];
    delete process.env[`TENANT_SIGNING_KEY_PRIVATE_${SLUG.toUpperCase()}`];
    delete process.env[`TENANT_SIGNING_KEY_PUBLIC_${SLUG.toUpperCase()}`];
  });

  it("sign → verify roundtrip succeeds", () => {
    const payload = { residentId: "r-1", standId: "s-1", issuedAt: "2026-06-01" };
    const sig = signDocument(SLUG, payload);
    expect(verifySignature(SLUG, payload, sig)).toBe(true);
  });

  it("rejects a tampered payload", () => {
    const payload = { residentId: "r-1", standId: "s-1", issuedAt: "2026-06-01" };
    const sig = signDocument(SLUG, payload);
    const tampered = { ...payload, standId: "s-TAMPERED" };
    expect(verifySignature(SLUG, tampered, sig)).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const payload = { residentId: "r-1", standId: "s-1" };
    const sig = signDocument(SLUG, payload);
    const badSig = sig.slice(0, -4) + "XXXX";
    expect(verifySignature(SLUG, payload, badSig)).toBe(false);
  });

  it("canonical serialisation is key-order-independent", () => {
    const a = { z: 1, a: 2, m: 3 };
    const b = { m: 3, z: 1, a: 2 };
    const sig = signDocument(SLUG, a);
    expect(verifySignature(SLUG, b, sig)).toBe(true);
  });

  it("different tenant slug with different keys cannot verify", () => {
    // Generate a second key pair for a different tenant
    const { privateKey: pk2, publicKey: pub2 } = generateKeyPairSync("ed25519");
    const slug2 = "othercouncil";
    process.env[`TENANT_SIGNING_KEY_PRIVATE_${slug2.toUpperCase()}`] = (
      pk2.export({ type: "pkcs8", format: "der" }) as Buffer
    ).toString("base64");
    process.env[`TENANT_SIGNING_KEY_PUBLIC_${slug2.toUpperCase()}`] = (
      pub2.export({ type: "spki", format: "der" }) as Buffer
    ).toString("base64");

    const payload = { residentId: "r-1", standId: "s-1" };
    const sigFromSlug1 = signDocument(SLUG, payload);
    // Verify with slug2's public key — should fail
    expect(verifySignature(slug2, payload, sigFromSlug1)).toBe(false);

    delete process.env[`TENANT_SIGNING_KEY_PRIVATE_${slug2.toUpperCase()}`];
    delete process.env[`TENANT_SIGNING_KEY_PUBLIC_${slug2.toUpperCase()}`];
  });

  it("getTenantPublicKey returns the base64 SPKI public key", () => {
    const returned = getTenantPublicKey(SLUG);
    expect(returned).toBe(publicB64);
  });

  it("throws when SIGNING_BACKEND is kms", () => {
    process.env["SIGNING_BACKEND"] = "kms";
    expect(() => signDocument(SLUG, { x: 1 })).toThrow("KMS signing backend is not yet implemented");
    expect(() => verifySignature(SLUG, { x: 1 }, "sig")).toThrow("KMS signing backend is not yet implemented");
    expect(() => getTenantPublicKey(SLUG)).toThrow("KMS signing backend is not yet implemented");
  });
});
