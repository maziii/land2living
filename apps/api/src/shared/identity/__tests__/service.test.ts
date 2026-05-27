import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { disconnectAllClients } from "../../database/index.js";
import * as repo from "../repository.js";
import {
  AuthError,
  hashPassword,
  issueRefreshToken,
  rotateRefreshTokenForTenant,
  revokeToken,
  validateCredentials,
} from "../service.js";

const hasDatabase = Boolean(process.env["DATABASE_URL"]);

describe.skipIf(!hasDatabase)("identity service", () => {
  const email = `test-${Date.now()}@l2l.test`;
  const password = "correct-horse-battery-staple";
  const tenantSlug = "test_tenant";
  let userId: string;

  beforeAll(async () => {
    const passwordHash = await hashPassword(password);
    const user = await repo.createUser({ email, passwordHash });
    userId = user.id;
    await repo.createMembership({ userId, tenantSlug, role: "council_secretary" });
  });

  afterAll(async () => {
    await disconnectAllClients();
  });

  describe("validateCredentials", () => {
    it("returns JWT payload for valid credentials", async () => {
      const payload = await validateCredentials(email, password, tenantSlug);
      expect(payload.userId).toBe(userId);
      expect(payload.tenantSlug).toBe(tenantSlug);
      expect(payload.role).toBe("council_secretary");
    });

    it("throws AuthError for wrong password", async () => {
      await expect(
        validateCredentials(email, "wrong-password", tenantSlug),
      ).rejects.toThrow(AuthError);
    });

    it("throws AuthError for unknown email", async () => {
      await expect(
        validateCredentials("nobody@l2l.test", password, tenantSlug),
      ).rejects.toThrow(AuthError);
    });

    it("throws AuthError when user has no membership in the tenant", async () => {
      await expect(
        validateCredentials(email, password, "other_tenant"),
      ).rejects.toThrow(AuthError);
    });

    it("returns 401 status on AuthError", async () => {
      const err = await validateCredentials(email, "bad", tenantSlug).catch(
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(AuthError);
      expect((err as AuthError).statusCode).toBe(401);
    });
  });

  describe("refresh token lifecycle", () => {
    it("issues a raw refresh token and stores its hash", async () => {
      const raw = await issueRefreshToken(userId);
      expect(typeof raw).toBe("string");
      expect(raw.length).toBe(64); // 32 bytes as hex
    });

    it("rotates refresh token: old invalidated, new issued", async () => {
      const raw = await issueRefreshToken(userId);
      const { payload, newRefreshToken } = await rotateRefreshTokenForTenant(
        raw,
        tenantSlug,
      );

      expect(payload.userId).toBe(userId);
      expect(payload.tenantSlug).toBe(tenantSlug);
      expect(newRefreshToken).not.toBe(raw);

      // Old token should now be invalid.
      await expect(
        rotateRefreshTokenForTenant(raw, tenantSlug),
      ).rejects.toThrow(AuthError);
    });

    it("rejects an expired refresh token", async () => {
      // Insert a token that expired in the past.
      const { createHash } = await import("crypto");
      const raw = "expired-token-test";
      const hash = createHash("sha256").update(raw).digest("hex");
      const pastDate = new Date(Date.now() - 1000);
      await repo.storeRefreshToken(hash, userId, pastDate);

      await expect(
        rotateRefreshTokenForTenant(raw, tenantSlug),
      ).rejects.toThrow(AuthError);
    });

    it("revokeToken silently succeeds for unknown tokens", async () => {
      await expect(revokeToken("unknown-token")).resolves.toBeUndefined();
    });
  });
});
