import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { requireAuth, requireRole } from "../../../shared/identity/middleware.js";
import * as svc from "./service.js";
import { OccupancyError } from "./service.js";
import { createOccupancySchema, updateOccupancySchema } from "./schemas.js";

export async function occupancyRoutes(fastify: FastifyInstance): Promise<void> {
  // ── POST /stands/:standId/occupants ────────────────────────────────────────
  fastify.post(
    "/stands/:standId/occupants",
    { preHandler: [requireAuth, requireRole("foot_soldier", "council_secretary", "founder")] },
    async (request, reply) => {
      const { standId } = request.params as { standId: string };
      const body = createOccupancySchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send(validationProblem(body.error));

      try {
        const occupancy = await svc.addOccupant(request.tenantContext, standId, body.data, {
          userId: request.jwtPayload.userId,
          role: request.jwtPayload.role,
          ip: request.ip,
          ...(request.headers["user-agent"] !== undefined && { userAgent: request.headers["user-agent"] }),
        });
        return reply.code(201).send(occupancy);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // ── GET /stands/:standId/occupants ─────────────────────────────────────────
  fastify.get(
    "/stands/:standId/occupants",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { standId } = request.params as { standId: string };
      try {
        const occupants = await svc.listStandOccupants(request.tenantContext, standId);
        return reply.code(200).send({ occupants });
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // ── GET /residents/:residentId/stands ──────────────────────────────────────
  fastify.get(
    "/residents/:residentId/stands",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { residentId } = request.params as { residentId: string };
      try {
        const stands = await svc.listResidentStands(request.tenantContext, residentId);
        return reply.code(200).send({ stands });
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // ── PATCH /stand-occupancies/:id ───────────────────────────────────────────
  fastify.patch(
    "/stand-occupancies/:id",
    { preHandler: [requireAuth, requireRole("council_secretary", "founder")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = updateOccupancySchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send(validationProblem(body.error));

      const occupancy = await svc.updateOccupancy(request.tenantContext, id, body.data, {
        userId: request.jwtPayload.userId,
        role: request.jwtPayload.role,
        ip: request.ip,
        ...(request.headers["user-agent"] !== undefined && { userAgent: request.headers["user-agent"] }),
      });

      if (!occupancy)
        return reply.code(404).send({ type: "about:blank", title: "Not Found", status: 404, detail: "Occupancy not found" });
      return reply.code(200).send(occupancy);
    },
  );
}

function handleError(err: unknown, reply: FastifyReply): FastifyReply {
  if (err instanceof OccupancyError) {
    const titles: Record<number, string> = { 400: "Bad Request", 404: "Not Found", 409: "Conflict" };
    return reply.code(err.statusCode).send({
      type: "about:blank",
      title: titles[err.statusCode] ?? "Error",
      status: err.statusCode,
      detail: err.message,
    });
  }
  throw err;
}

function validationProblem(error: z.ZodError) {
  return { type: "about:blank", title: "Bad Request", status: 400, detail: "Validation failed", errors: error.errors };
}
