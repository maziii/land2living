import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  forgotPasswordSchema,
  loginRequestSchema,
  logoutRequestSchema,
  mfaChallengeSchema,
  mfaDisableSchema,
  mfaVerifySchema,
  refreshRequestSchema,
  resetPasswordSchema,
  selfRegisterSchema,
} from "./schemas.js";
import { TenantContext } from "../database/tenant-context.js";
import * as svc from "./service.js";
import { handleAuthError, requireAuth, requireRole } from "./middleware.js";
import type { JwtPayload } from "./types.js";

const JWT_EXPIRY = process.env["JWT_EXPIRY"] ?? "1h";
const MFA_CHALLENGE_EXPIRY = "5m";

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // ── POST /login ────────────────────────────────────────────────────────────
  fastify.post("/login", async (request, reply) => {
    const body = loginRequestSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send(validationProblem(body.error));

    try {
      const result = await svc.validateCredentials(
        body.data.email,
        body.data.password,
        body.data.tenantSlug,
      );

      if (result.mfaEnabled) {
        const challengeToken = await reply.jwtSign(
          {
            userId: result.userId,
            tenantSlug: result.tenantSlug,
            role: result.role,
            isMfaChallenge: true as const,
          },
          { expiresIn: MFA_CHALLENGE_EXPIRY },
        );
        return reply.code(200).send({ mfaRequired: true, challengeToken });
      }

      const accessToken = await reply.jwtSign(
        { userId: result.userId, tenantSlug: result.tenantSlug, role: result.role },
        { expiresIn: JWT_EXPIRY },
      );
      const refreshToken = await svc.issueRefreshToken(result.userId);
      return reply.code(200).send({ accessToken, refreshToken });
    } catch (err) {
      return handleAuthError(err, reply);
    }
  });

  // ── POST /refresh ──────────────────────────────────────────────────────────
  fastify.post("/refresh", async (request, reply) => {
    const body = refreshRequestSchema
      .extend({ tenantSlug: z.string().regex(/^[a-z][a-z0-9_]*$/) })
      .safeParse(request.body);

    if (!body.success) return reply.code(400).send(validationProblem(body.error));

    try {
      const { payload, newRefreshToken } = await svc.rotateRefreshTokenForTenant(
        body.data.refreshToken,
        body.data.tenantSlug,
      );
      const accessToken = await reply.jwtSign(payload, { expiresIn: JWT_EXPIRY });
      return reply.code(200).send({ accessToken, refreshToken: newRefreshToken });
    } catch (err) {
      return handleAuthError(err, reply);
    }
  });

  // ── POST /logout ───────────────────────────────────────────────────────────
  fastify.post("/logout", async (request, reply) => {
    const body = logoutRequestSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send(validationProblem(body.error));
    await svc.revokeToken(body.data.refreshToken);
    return reply.code(200).send({ success: true });
  });

  // ── POST /mfa/challenge ────────────────────────────────────────────────────
  // Second step of login when MFA is enabled. Accepts either a TOTP code or
  // a recovery code alongside the short-lived challenge token.
  fastify.post("/mfa/challenge", async (request, reply) => {
    const body = mfaChallengeSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send(validationProblem(body.error));

    try {
      // Verify the challenge token — it must be a valid JWT with isMfaChallenge.
      const decoded = fastify.jwt.verify<JwtPayload>(body.data.challengeToken);
      if (decoded.isMfaChallenge !== true) throw new svc.AuthError("Invalid challenge token");

      const valid = await svc.completeMfaChallenge(
        decoded.userId,
        body.data.code ?? null,
        body.data.recoveryCode ?? null,
      );
      if (!valid) throw new svc.AuthError("Invalid MFA code");

      const fullPayload: JwtPayload = {
        userId: decoded.userId,
        tenantSlug: decoded.tenantSlug,
        role: decoded.role,
      };
      const accessToken = await reply.jwtSign(fullPayload, { expiresIn: JWT_EXPIRY });
      const refreshToken = await svc.issueRefreshToken(decoded.userId);
      return reply.code(200).send({ accessToken, refreshToken });
    } catch (err) {
      return handleAuthError(err, reply);
    }
  });

  // ── POST /mfa/setup ────────────────────────────────────────────────────────
  // Generates a TOTP secret and 8 recovery codes. The secret is pending until
  // verified via /mfa/verify. Recovery codes are displayed exactly once.
  fastify.post(
    "/mfa/setup",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      try {
        const result = await svc.setupMfa(request.jwtPayload.userId);
        return reply.code(200).send(result);
      } catch (err) {
        return handleAuthError(err, reply);
      }
    },
  );

  // ── POST /mfa/verify ───────────────────────────────────────────────────────
  // Confirms the TOTP setup by accepting a live code, then enables MFA.
  fastify.post(
    "/mfa/verify",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const body = mfaVerifySchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send(validationProblem(body.error));

      try {
        await svc.verifyMfaSetup(request.jwtPayload.userId, body.data.code);
        return reply.code(200).send({ success: true });
      } catch (err) {
        return handleAuthError(err, reply);
      }
    },
  );

  // ── POST /mfa/disable ──────────────────────────────────────────────────────
  // Requires current password + valid TOTP. Restricted to privileged roles.
  fastify.post(
    "/mfa/disable",
    { preHandler: [requireAuth, requireRole("council_secretary", "founder")] },
    async (request, reply) => {
      const body = mfaDisableSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send(validationProblem(body.error));

      try {
        await svc.disableMfa(request.jwtPayload.userId, body.data.password, body.data.code);
        return reply.code(200).send({ success: true });
      } catch (err) {
        return handleAuthError(err, reply);
      }
    },
  );

  // ── POST /register ─────────────────────────────────────────────────────────
  // Public self-service resident registration. Creates user account + resident
  // record and returns a JWT so the resident is logged in immediately.
  fastify.post("/register", async (request, reply) => {
    const body = selfRegisterSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send(validationProblem(body.error));

    try {
      const ctx = new TenantContext(body.data.tenantSlug);
      const result = await svc.selfRegister(ctx, {
        email:              body.data.email,
        password:           body.data.password,
        firstName:          body.data.firstName,
        lastName:           body.data.lastName,
        phoneNumber:        body.data.phoneNumber,
        languagePreference: body.data.languagePreference,
        ...(body.data.idNumber !== undefined && { idNumber: body.data.idNumber }),
      });

      const payload: JwtPayload = {
        userId:     result.userId,
        tenantSlug: result.tenantSlug,
        role:       "resident",
      };
      const accessToken  = await reply.jwtSign(payload, { expiresIn: JWT_EXPIRY });
      const refreshToken = await svc.issueRefreshToken(result.userId);
      return reply.code(201).send({ accessToken, refreshToken, residentId: result.residentId });
    } catch (err) {
      return handleAuthError(err, reply);
    }
  });

  // ── POST /forgot-password ──────────────────────────────────────────────────
  // Always returns 200 — never reveals whether the email exists.
  fastify.post("/forgot-password", async (request, reply) => {
    const body = forgotPasswordSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send(validationProblem(body.error));
    await svc.requestPasswordReset(body.data.email, body.data.tenantSlug);
    return reply.code(200).send({ success: true });
  });

  // ── POST /reset-password ───────────────────────────────────────────────────
  fastify.post("/reset-password", async (request, reply) => {
    const body = resetPasswordSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send(validationProblem(body.error));
    try {
      await svc.resetPassword(body.data.token, body.data.newPassword);
      return reply.code(200).send({ success: true });
    } catch (err) {
      return handleAuthError(err, reply);
    }
  });
}

function validationProblem(error: z.ZodError) {
  return {
    type: "about:blank",
    title: "Bad Request",
    status: 400,
    detail: "Validation failed",
    errors: error.errors,
  };
}
