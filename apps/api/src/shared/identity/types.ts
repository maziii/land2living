import type { Role } from "@prisma/client";
import type { TenantContext } from "../database/index.js";

export type { Role };

export interface JwtPayload {
  userId: string;
  tenantSlug: string;
  role: Role;
  // Present only in short-lived MFA challenge tokens. requireAuth rejects these.
  isMfaChallenge?: true;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// Augment Fastify request so middleware can attach resolved context.
declare module "fastify" {
  interface FastifyRequest {
    tenantContext: TenantContext;
    jwtPayload: JwtPayload;
  }
}

// Augment @fastify/jwt so jwtSign / jwtVerify use our payload shape.
declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}
