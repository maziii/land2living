import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../../index.js";
import type { FastifyInstance } from "fastify";

vi.mock("../service.js", () => ({
  validateCredentials: vi.fn(),
  issueRefreshToken: vi.fn(),
  rotateRefreshTokenForTenant: vi.fn(),
  revokeToken: vi.fn(),
  hashPassword: vi.fn(),
  setupMfa: vi.fn(),
  verifyMfaSetup: vi.fn(),
  completeMfaChallenge: vi.fn(),
  disableMfa: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  AuthError: class AuthError extends Error {
    statusCode: number;
    constructor(msg: string, code = 401) {
      super(msg);
      this.name = "AuthError";
      this.statusCode = code;
    }
  },
}));

import * as svc from "../service.js";

describe("auth routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env["JWT_SECRET"] = "test-secret-at-least-32-characters-long!!";
    app = buildApp();

    app.get(
      "/api/v1/test-protected",
      {
        preHandler: [
          async (req, reply) => {
            try {
              await req.jwtVerify();
            } catch {
              return reply.code(401).send({ status: 401, title: "Unauthorized" });
            }
          },
        ],
      },
      async () => ({ ok: true }),
    );

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Login ──────────────────────────────────────────────────────────────────

  describe("POST /api/v1/auth/login", () => {
    it("returns 200 with tokens when MFA is disabled", async () => {
      vi.mocked(svc.validateCredentials).mockResolvedValueOnce({
        userId: "user-1",
        tenantSlug: "ndebele",
        role: "council_secretary",
        mfaEnabled: false,
      });
      vi.mocked(svc.issueRefreshToken).mockResolvedValueOnce("raw-refresh-token");

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "sec@council.za", password: "secret", tenantSlug: "ndebele" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ accessToken: string; refreshToken: string }>();
      expect(body.accessToken).toBeTruthy();
      expect(body.refreshToken).toBe("raw-refresh-token");
    });

    it("returns mfaRequired + challengeToken when MFA is enabled", async () => {
      vi.mocked(svc.validateCredentials).mockResolvedValueOnce({
        userId: "user-1",
        tenantSlug: "ndebele",
        role: "council_secretary",
        mfaEnabled: true,
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "sec@council.za", password: "secret", tenantSlug: "ndebele" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ mfaRequired: boolean; challengeToken: string }>();
      expect(body.mfaRequired).toBe(true);
      expect(body.challengeToken).toBeTruthy();
      // Challenge token must not work as a regular access token
    });

    it("returns 401 when credentials invalid", async () => {
      const { AuthError } = await import("../service.js");
      vi.mocked(svc.validateCredentials).mockRejectedValueOnce(
        new AuthError("Invalid credentials"),
      );

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "sec@council.za", password: "wrong", tenantSlug: "ndebele" },
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns 400 when request body is invalid", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "not-an-email" },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── MFA challenge ──────────────────────────────────────────────────────────

  describe("POST /api/v1/auth/mfa/challenge", () => {
    it("returns 200 with full tokens when TOTP code is valid", async () => {
      // Get a real challenge token from login
      vi.mocked(svc.validateCredentials).mockResolvedValueOnce({
        userId: "user-1",
        tenantSlug: "ndebele",
        role: "council_secretary",
        mfaEnabled: true,
      });
      const loginRes = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "sec@council.za", password: "secret", tenantSlug: "ndebele" },
      });
      const { challengeToken } = loginRes.json<{ challengeToken: string }>();

      vi.mocked(svc.completeMfaChallenge).mockResolvedValueOnce(true);
      vi.mocked(svc.issueRefreshToken).mockResolvedValueOnce("full-refresh-token");

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/mfa/challenge",
        payload: { challengeToken, code: "123456" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ accessToken: string; refreshToken: string }>();
      expect(body.accessToken).toBeTruthy();
      expect(body.refreshToken).toBe("full-refresh-token");
    });

    it("returns 401 when TOTP code is wrong", async () => {
      vi.mocked(svc.validateCredentials).mockResolvedValueOnce({
        userId: "user-1",
        tenantSlug: "ndebele",
        role: "council_secretary",
        mfaEnabled: true,
      });
      const loginRes = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "sec@council.za", password: "secret", tenantSlug: "ndebele" },
      });
      const { challengeToken } = loginRes.json<{ challengeToken: string }>();

      vi.mocked(svc.completeMfaChallenge).mockResolvedValueOnce(false);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/mfa/challenge",
        payload: { challengeToken, code: "000000" },
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns 200 with recovery code", async () => {
      vi.mocked(svc.validateCredentials).mockResolvedValueOnce({
        userId: "user-1",
        tenantSlug: "ndebele",
        role: "council_secretary",
        mfaEnabled: true,
      });
      const loginRes = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: { email: "sec@council.za", password: "secret", tenantSlug: "ndebele" },
      });
      const { challengeToken } = loginRes.json<{ challengeToken: string }>();

      vi.mocked(svc.completeMfaChallenge).mockResolvedValueOnce(true);
      vi.mocked(svc.issueRefreshToken).mockResolvedValueOnce("full-refresh-token");

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/mfa/challenge",
        payload: { challengeToken, recoveryCode: "abcdef1234567890" },
      });

      expect(res.statusCode).toBe(200);
    });

    it("returns 401 when a non-challenge JWT is passed", async () => {
      // Sign a normal access token (no isMfaChallenge)
      const regularToken = app.jwt.sign({ userId: "u", tenantSlug: "ndebele", role: "resident" });

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/mfa/challenge",
        payload: { challengeToken: regularToken, code: "123456" },
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns 400 when neither code nor recoveryCode is provided", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/mfa/challenge",
        payload: { challengeToken: "some-token" },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── MFA setup ──────────────────────────────────────────────────────────────

  describe("POST /api/v1/auth/mfa/setup", () => {
    it("returns 401 without auth", async () => {
      const res = await app.inject({ method: "POST", url: "/api/v1/auth/mfa/setup" });
      expect(res.statusCode).toBe(401);
    });

    it("returns 200 with QR code and recovery codes", async () => {
      vi.mocked(svc.setupMfa).mockResolvedValueOnce({
        totpUri: "otpauth://totp/...",
        qrCodeDataUri: "data:image/png;base64,abc",
        recoveryCodes: Array.from({ length: 8 }, (_, i) => `code-${i}`),
      });

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/mfa/setup",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ recoveryCodes: string[] }>();
      expect(body.recoveryCodes).toHaveLength(8);
    });
  });

  // ── MFA verify ─────────────────────────────────────────────────────────────

  describe("POST /api/v1/auth/mfa/verify", () => {
    it("returns 401 without auth", async () => {
      const res = await app.inject({ method: "POST", url: "/api/v1/auth/mfa/verify" });
      expect(res.statusCode).toBe(401);
    });

    it("returns 200 when TOTP code is valid", async () => {
      vi.mocked(svc.verifyMfaSetup).mockResolvedValueOnce(undefined);

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/mfa/verify",
        headers: { authorization: `Bearer ${token}` },
        payload: { code: "123456" },
      });

      expect(res.statusCode).toBe(200);
    });

    it("returns 400 for non-numeric code", async () => {
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/mfa/verify",
        headers: { authorization: `Bearer ${token}` },
        payload: { code: "abcdef" },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── MFA disable ────────────────────────────────────────────────────────────

  describe("POST /api/v1/auth/mfa/disable", () => {
    it("returns 401 without auth", async () => {
      const res = await app.inject({ method: "POST", url: "/api/v1/auth/mfa/disable" });
      expect(res.statusCode).toBe(401);
    });

    it("returns 403 for resident role", async () => {
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "resident" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/mfa/disable",
        headers: { authorization: `Bearer ${token}` },
        payload: { password: "pass", code: "123456" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 200 for council_secretary with valid credentials", async () => {
      vi.mocked(svc.disableMfa).mockResolvedValueOnce(undefined);

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/mfa/disable",
        headers: { authorization: `Bearer ${token}` },
        payload: { password: "secret", code: "123456" },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  // ── Refresh ────────────────────────────────────────────────────────────────

  describe("POST /api/v1/auth/refresh", () => {
    it("returns 200 with new tokens on valid refresh token", async () => {
      vi.mocked(svc.rotateRefreshTokenForTenant).mockResolvedValueOnce({
        payload: { userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" },
        newRefreshToken: "new-refresh-token",
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/refresh",
        payload: { refreshToken: "old-token", tenantSlug: "ndebele" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ refreshToken: string }>();
      expect(body.refreshToken).toBe("new-refresh-token");
    });

    it("returns 401 when refresh token is invalid", async () => {
      const { AuthError } = await import("../service.js");
      vi.mocked(svc.rotateRefreshTokenForTenant).mockRejectedValueOnce(
        new AuthError("Invalid or expired refresh token"),
      );

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/refresh",
        payload: { refreshToken: "expired", tenantSlug: "ndebele" },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ── Logout ─────────────────────────────────────────────────────────────────

  describe("POST /api/v1/auth/logout", () => {
    it("returns 200 and revokes the token", async () => {
      vi.mocked(svc.revokeToken).mockResolvedValueOnce(undefined);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/logout",
        payload: { refreshToken: "some-token" },
      });

      expect(res.statusCode).toBe(200);
      expect(svc.revokeToken).toHaveBeenCalledWith("some-token");
    });
  });

  // ── Forgot password ────────────────────────────────────────────────────────

  describe("POST /api/v1/auth/forgot-password", () => {
    it("returns 200 regardless of whether email exists", async () => {
      vi.mocked(svc.requestPasswordReset).mockResolvedValueOnce(undefined);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/forgot-password",
        payload: { email: "any@example.com", tenantSlug: "ndebele" },
      });

      expect(res.statusCode).toBe(200);
      expect(svc.requestPasswordReset).toHaveBeenCalledWith("any@example.com", "ndebele");
    });

    it("returns 400 for invalid email", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/forgot-password",
        payload: { email: "not-an-email", tenantSlug: "ndebele" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 400 when tenantSlug is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/forgot-password",
        payload: { email: "any@example.com" },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── Reset password ─────────────────────────────────────────────────────────

  describe("POST /api/v1/auth/reset-password", () => {
    it("returns 200 with valid token and password", async () => {
      vi.mocked(svc.resetPassword).mockResolvedValueOnce(undefined);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/reset-password",
        payload: { token: "a".repeat(64), newPassword: "newpassword1" },
      });

      expect(res.statusCode).toBe(200);
    });

    it("returns 401 when token is invalid or expired", async () => {
      const { AuthError } = await import("../service.js");
      vi.mocked(svc.resetPassword).mockRejectedValueOnce(
        new AuthError("Invalid or expired password reset token"),
      );

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/reset-password",
        payload: { token: "expired-token", newPassword: "newpassword1" },
      });

      expect(res.statusCode).toBe(401);
    });

    it("returns 400 when newPassword is too short", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/reset-password",
        payload: { token: "some-token", newPassword: "short" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 400 when token is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/reset-password",
        payload: { newPassword: "newpassword1" },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── requireAuth middleware ─────────────────────────────────────────────────

  describe("requireAuth middleware", () => {
    it("returns 401 when no token provided", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/test-protected" });
      expect(res.statusCode).toBe(401);
    });

    it("returns 401 when a challenge token is used on a requireAuth-protected route", async () => {
      const challengeToken = app.jwt.sign({
        userId: "user-1",
        tenantSlug: "ndebele",
        role: "council_secretary",
        isMfaChallenge: true,
      });
      // /api/v1/auth/mfa/setup uses requireAuth — challenge tokens must be rejected there.
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/auth/mfa/setup",
        headers: { authorization: `Bearer ${challengeToken}` },
      });
      expect(res.statusCode).toBe(401);
    });
  });
});
