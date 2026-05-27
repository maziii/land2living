import type { FastifyReply, FastifyRequest } from "fastify";
import { TenantContext } from "../database/index.js";
import { AuthError } from "./service.js";
import type { JwtPayload, Role } from "./types.js";

/**
 * Fastify preHandler: verifies the Bearer JWT, attaches jwtPayload and
 * tenantContext to the request. Must be applied to every protected route.
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify();
    const payload = request.user as JwtPayload;
    // MFA challenge tokens must not be used as regular access tokens.
    if (payload.isMfaChallenge === true) {
      return problem(reply, 401, "Unauthorized", "MFA challenge is required to complete login");
    }
    request.jwtPayload = payload;
    request.tenantContext = new TenantContext(payload.tenantSlug);
    // Attach tenantSlug to the request-scoped logger so all downstream log lines carry it.
    request.log = request.log.child({ tenantSlug: payload.tenantSlug });
  } catch {
    return problem(reply, 401, "Unauthorized", "Missing or invalid token");
  }
}

/**
 * Returns a Fastify preHandler that enforces one of the allowed roles.
 * Must be used AFTER requireAuth in the preHandler chain.
 */
export function requireRole(
  ...allowed: Role[]
): (req: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request, reply) => {
    const role = request.jwtPayload?.role;
    if (!role || !allowed.includes(role)) {
      return problem(reply, 403, "Forbidden", "Insufficient permissions");
    }
  };
}

/**
 * Translates an AuthError (thrown by service layer) to an HTTP response.
 * Call this in route catch blocks.
 */
export function handleAuthError(
  error: unknown,
  reply: FastifyReply,
): FastifyReply {
  if (error instanceof AuthError) {
    return problem(reply, error.statusCode, httpTitle(error.statusCode), error.message);
  }
  throw error;
}

// ── RFC 7807 helper ───────────────────────────────────────────────────────────

function problem(
  reply: FastifyReply,
  status: number,
  title: string,
  detail: string,
): FastifyReply {
  return reply.code(status).send({ type: "about:blank", title, status, detail });
}

function httpTitle(status: 401 | 403): string {
  return status === 401 ? "Unauthorized" : "Forbidden";
}
