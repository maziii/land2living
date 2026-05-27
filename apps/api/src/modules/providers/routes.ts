import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { requireAuth, requireRole } from "../../shared/identity/middleware.js";
import * as svc from "./service.js";
import { ProvidersError } from "./service.js";
import {
  registerProviderSchema,
  updateVerificationSchema,
  listProvidersQuerySchema,
} from "./schemas.js";

export async function providerRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /providers — register a new service provider
  fastify.post(
    "/providers",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const body = registerProviderSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send(validationProblem(body.error));

      try {
        const provider = await svc.registerProvider(body.data, actor(request));
        return reply.code(201).send(provider);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // GET /providers — list providers
  fastify.get(
    "/providers",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const query = listProvidersQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send(validationProblem(query.error));

      const result = await svc.listProviders(query.data);
      return reply.code(200).send(result);
    },
  );

  // GET /providers/:id — detail
  fastify.get(
    "/providers/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const provider = await svc.getProvider(id);
      if (!provider) return reply.code(404).send(problem(404, "Not Found", "Provider not found"));
      return reply.code(200).send(provider);
    },
  );

  // PATCH /providers/:id/verification — founder only
  fastify.patch(
    "/providers/:id/verification",
    { preHandler: [requireAuth, requireRole("founder")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = updateVerificationSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send(validationProblem(body.error));

      try {
        const provider = await svc.updateVerification(id, body.data, actor(request));
        return reply.code(200).send(provider);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );
}

function actor(request: { jwtPayload: { userId: string; role: string }; ip: string; headers: Record<string, string | string[] | undefined> }) {
  return {
    userId: request.jwtPayload.userId,
    role: request.jwtPayload.role,
    ip: request.ip,
    ...(request.headers["user-agent"] !== undefined && { userAgent: request.headers["user-agent"] as string }),
  };
}

function handleError(err: unknown, reply: FastifyReply) {
  if (err instanceof ProvidersError) {
    const title = err.statusCode === 404 ? "Not Found" : err.statusCode === 403 ? "Forbidden" : "Bad Request";
    return reply.code(err.statusCode).send(problem(err.statusCode, title, err.message));
  }
  throw err;
}

function validationProblem(error: z.ZodError) {
  return { type: "about:blank", title: "Bad Request", status: 400, detail: "Validation failed", errors: error.errors };
}

function problem(status: number, title: string, detail: string) {
  return { type: "about:blank", title, status, detail };
}
