import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pipeline } from "stream/promises";
import { requireAuth, requireRole } from "../../../shared/identity/middleware.js";
import * as svc from "./service.js";
import {
  createResidentSchema,
  updateResidentSchema,
  listResidentQuerySchema,
} from "./schemas.js";

export async function residentRoutes(fastify: FastifyInstance): Promise<void> {
  // ── POST /residents ────────────────────────────────────────────────────────
  fastify.post(
    "/",
    { preHandler: [requireAuth, requireRole("foot_soldier", "council_secretary", "founder")] },
    async (request, reply) => {
      const body = createResidentSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send(validationProblem(body.error));

      const resident = await svc.createResident(request.tenantContext, body.data, {
        userId: request.jwtPayload.userId,
        role: request.jwtPayload.role,
        ip: request.ip,
        ...(request.headers["user-agent"] !== undefined && { userAgent: request.headers["user-agent"] }),
      });
      return reply.code(201).send(resident);
    },
  );

  // ── GET /residents/me ──────────────────────────────────────────────────────
  // Returns the resident profile linked to the currently logged-in user.
  // Only usable by self-registered residents (role: resident).
  fastify.get(
    "/me",
    { preHandler: [requireAuth, requireRole("resident")] },
    async (request, reply) => {
      const resident = await svc.getResidentForUser(
        request.tenantContext,
        request.jwtPayload.userId,
      );
      if (!resident) return reply.code(404).send(problem(404, "Not Found", "No resident profile found for this account"));
      return reply.code(200).send(resident);
    },
  );

  // ── GET /residents ─────────────────────────────────────────────────────────
  fastify.get(
    "/",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const query = listResidentQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send(validationProblem(query.error));

      const result = await svc.listResidents(request.tenantContext, query.data, {
        userId: request.jwtPayload.userId,
        role: request.jwtPayload.role,
      });
      return reply.code(200).send(result);
    },
  );

  // ── POST /residents/bulk-import ────────────────────────────────────────────
  fastify.post(
    "/bulk-import",
    { preHandler: [requireAuth, requireRole("council_secretary", "founder")] },
    async (request, reply) => {
      const data = await request.file();
      if (!data) {
        return reply.code(400).send(problem(400, "Bad Request", "No file uploaded"));
      }
      if (!data.mimetype.includes("csv") && !data.filename.endsWith(".csv")) {
        data.file.resume();
        return reply.code(400).send(problem(400, "Bad Request", "File must be a CSV"));
      }

      const chunks: Buffer[] = [];
      for await (const chunk of data.file) {
        chunks.push(chunk as Buffer);
      }
      const csvText = Buffer.concat(chunks).toString("utf-8");

      const result = await svc.bulkImportResidents(request.tenantContext, csvText, {
        userId: request.jwtPayload.userId,
        role: request.jwtPayload.role,
      });

      if (result.errors.length > 0) {
        return reply.code(422).send({ type: "about:blank", title: "Unprocessable Entity", status: 422, detail: "Validation errors in CSV", errors: result.errors });
      }
      return reply.code(200).send({ importedCount: result.importedCount });
    },
  );

  // ── GET /residents/:id ─────────────────────────────────────────────────────
  fastify.get(
    "/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { unmask_id } = request.query as { unmask_id?: string };
      const unmaskId = unmask_id === "true";

      if (unmaskId) {
        const role = request.jwtPayload.role;
        if (role !== "council_secretary" && role !== "founder") {
          return reply.code(403).send(problem(403, "Forbidden", "Insufficient permissions to unmask ID number"));
        }
      }

      const resident = await svc.getResident(request.tenantContext, id, unmaskId, {
        userId: request.jwtPayload.userId,
        role: request.jwtPayload.role,
        ip: request.ip,
        ...(request.headers["user-agent"] !== undefined && { userAgent: request.headers["user-agent"] }),
      });

      if (!resident) return reply.code(404).send(problem(404, "Not Found", "Resident not found"));
      return reply.code(200).send(resident);
    },
  );

  // ── PATCH /residents/:id ───────────────────────────────────────────────────
  fastify.patch(
    "/:id",
    { preHandler: [requireAuth, requireRole("council_secretary", "founder")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = updateResidentSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send(validationProblem(body.error));

      const resident = await svc.updateResident(request.tenantContext, id, body.data, {
        userId: request.jwtPayload.userId,
        role: request.jwtPayload.role,
        ip: request.ip,
        ...(request.headers["user-agent"] !== undefined && { userAgent: request.headers["user-agent"] }),
      });

      if (!resident) return reply.code(404).send(problem(404, "Not Found", "Resident not found"));
      return reply.code(200).send(resident);
    },
  );

  // ── DELETE /residents/:id (soft delete) ────────────────────────────────────
  fastify.delete(
    "/:id",
    { preHandler: [requireAuth, requireRole("council_secretary", "founder")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const deleted = await svc.deleteResident(request.tenantContext, id, {
        userId: request.jwtPayload.userId,
        role: request.jwtPayload.role,
        ip: request.ip,
        ...(request.headers["user-agent"] !== undefined && { userAgent: request.headers["user-agent"] }),
      });

      if (!deleted) return reply.code(404).send(problem(404, "Not Found", "Resident not found"));
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
