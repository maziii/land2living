import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth, requireRole } from "../../../shared/identity/middleware.js";
import * as svc from "./service.js";
import { createStandSchema, updateStandSchema, listStandQuerySchema } from "./schemas.js";

export async function standRoutes(fastify: FastifyInstance): Promise<void> {
  // ── POST /stands ───────────────────────────────────────────────────────────
  fastify.post(
    "/",
    { preHandler: [requireAuth, requireRole("foot_soldier", "council_secretary", "land_officer", "founder")] },
    async (request, reply) => {
      const body = createStandSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send(validationProblem(body.error));

      const stand = await svc.createStand(request.tenantContext, body.data, {
        userId: request.jwtPayload.userId,
        role: request.jwtPayload.role,
        ip: request.ip,
        ...(request.headers["user-agent"] !== undefined && { userAgent: request.headers["user-agent"] }),
      });
      return reply.code(201).send(stand);
    },
  );

  // ── GET /stands/villages ──────────────────────────────────────────────────
  fastify.get(
    "/villages",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const villages = await svc.listVillages(request.tenantContext);
      return reply.code(200).send({ villages });
    },
  );

  // ── GET /stands ────────────────────────────────────────────────────────────
  fastify.get(
    "/",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const query = listStandQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send(validationProblem(query.error));

      const result = await svc.listStands(request.tenantContext, query.data, {
        userId: request.jwtPayload.userId,
        role: request.jwtPayload.role,
      });
      return reply.code(200).send(result);
    },
  );

  // ── GET /stands/:id ────────────────────────────────────────────────────────
  fastify.get(
    "/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const stand = await svc.getStand(request.tenantContext, id);
      if (!stand) return reply.code(404).send(problem(404, "Not Found", "Stand not found"));
      return reply.code(200).send(stand);
    },
  );

  // ── PATCH /stands/:id ──────────────────────────────────────────────────────
  fastify.patch(
    "/:id",
    { preHandler: [requireAuth, requireRole("council_secretary", "founder")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = updateStandSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send(validationProblem(body.error));

      const stand = await svc.updateStand(request.tenantContext, id, body.data, {
        userId: request.jwtPayload.userId,
        role: request.jwtPayload.role,
        ip: request.ip,
        ...(request.headers["user-agent"] !== undefined && { userAgent: request.headers["user-agent"] }),
      });

      if (!stand) return reply.code(404).send(problem(404, "Not Found", "Stand not found"));
      return reply.code(200).send(stand);
    },
  );

  // ── DELETE /stands/:id ─────────────────────────────────────────────────────
  fastify.delete(
    "/:id",
    { preHandler: [requireAuth, requireRole("council_secretary", "founder")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const deleted = await svc.deleteStand(request.tenantContext, id, {
        userId: request.jwtPayload.userId,
        role: request.jwtPayload.role,
        ip: request.ip,
        ...(request.headers["user-agent"] !== undefined && { userAgent: request.headers["user-agent"] }),
      });

      if (!deleted) return reply.code(404).send(problem(404, "Not Found", "Stand not found"));
      return reply.code(200).send({ success: true });
    },
  );
}

function validationProblem(error: z.ZodError) {
  return { type: "about:blank", title: "Bad Request", status: 400, detail: "Validation failed", errors: error.errors };
}

function problem(status: number, title: string, detail: string) {
  return { type: "about:blank", title, status, detail };
}
