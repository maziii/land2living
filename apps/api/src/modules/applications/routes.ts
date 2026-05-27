import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { requireAuth, requireRole } from "../../shared/identity/middleware.js";
import * as svc from "./service.js";
import * as repo from "./repository.js";
import { ApplicationError } from "./service.js";
import {
  createApplicationSchema,
  updateApplicationStatusSchema,
  updateWizardSchema,
  addDocumentSchema,
  flagDuplicateSchema,
  listApplicationQuerySchema,
} from "./schemas.js";

export async function applicationRoutes(fastify: FastifyInstance): Promise<void> {
  // ── Legacy field-portal submit ─────────────────────────────────────────────
  // POST /applications
  fastify.post(
    "/",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const body = createApplicationSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send(validationProblem(body.error));

      const app = await svc.submitApplication(request.tenantContext, body.data, actor(request));
      return reply.code(201).send(app);
    },
  );

  // ── Wizard-first: create draft ─────────────────────────────────────────────
  // POST /applications/draft
  fastify.post(
    "/draft",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const app = await svc.createDraft(request.tenantContext, actor(request));
      return reply.code(201).send(app);
    },
  );

  // ── Wizard-first: save step ────────────────────────────────────────────────
  // PATCH /applications/:id/wizard
  fastify.patch(
    "/:id/wizard",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = updateWizardSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send(validationProblem(body.error));

      try {
        const app = await svc.updateWizardStep(request.tenantContext, id, body.data, actor(request));
        return reply.code(200).send(app);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // ── Wizard-first: submit draft ─────────────────────────────────────────────
  // POST /applications/:id/submit
  fastify.post(
    "/:id/submit",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const app = await svc.submitDraftApplication(request.tenantContext, id, actor(request));
        return reply.code(200).send(app);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // ── Document upload link ───────────────────────────────────────────────────
  // POST /applications/:id/documents
  fastify.post(
    "/:id/documents",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = addDocumentSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send(validationProblem(body.error));

      const doc = await repo.createApplicationDocument(request.tenantContext, {
        applicationId: id,
        s3Key:         body.data.s3Key,
        documentType:  body.data.documentType,
      });
      return reply.code(201).send(doc);
    },
  );

  // ── Flag duplicate (council only) ──────────────────────────────────────────
  // POST /applications/:id/flag-duplicate
  fastify.post(
    "/:id/flag-duplicate",
    { preHandler: [requireAuth, requireRole("council_secretary", "land_officer", "founder")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = flagDuplicateSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send(validationProblem(body.error));

      try {
        const app = await svc.flagDuplicate(request.tenantContext, id, body.data.duplicateOfId, actor(request));
        return reply.code(200).send(app);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // ── List ───────────────────────────────────────────────────────────────────
  // GET /applications
  // Council roles see all; residents see only their own (forced by userId).
  fastify.get(
    "/",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { role, userId } = request.jwtPayload;
      const COUNCIL_ROLES = ["council_secretary", "council_member", "land_officer", "founder", "foot_soldier"];

      if (!COUNCIL_ROLES.includes(role) && role !== "resident") {
        return reply.code(403).send(problem(403, "Forbidden", "Insufficient permissions"));
      }

      const query = listApplicationQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send(validationProblem(query.error));

      const effectiveQuery = role === "resident"
        ? { ...query.data, applicantResidentId: userId }
        : query.data;

      const result = await svc.listApplications(request.tenantContext, effectiveQuery);
      return reply.code(200).send(result);
    },
  );

  // ── Get one ────────────────────────────────────────────────────────────────
  // GET /applications/:id
  fastify.get(
    "/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const app = await svc.getApplication(request.tenantContext, id);
      if (!app) return reply.code(404).send(problem(404, "Not Found", "Application not found"));
      return reply.code(200).send(app);
    },
  );

  // ── Council status update ──────────────────────────────────────────────────
  // PATCH /applications/:id/status
  fastify.patch(
    "/:id/status",
    { preHandler: [requireAuth, requireRole("council_secretary", "land_officer", "founder")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = updateApplicationStatusSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send(validationProblem(body.error));

      try {
        const app = await svc.updateApplicationStatus(request.tenantContext, id, body.data, actor(request));
        return reply.code(200).send(app);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // ── Resident stand-offer actions ───────────────────────────────────────────
  // POST /applications/:id/accept-offer
  fastify.post(
    "/:id/accept-offer",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const app = await svc.acceptStandOffer(request.tenantContext, id, actor(request));
        return reply.code(200).send(app);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // POST /applications/:id/request-viewing
  fastify.post(
    "/:id/request-viewing",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const app = await svc.requestStandViewing(request.tenantContext, id, actor(request));
        return reply.code(200).send(app);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // POST /applications/:id/reject-offer
  fastify.post(
    "/:id/reject-offer",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const app = await svc.rejectStandOffer(request.tenantContext, id, actor(request));
        return reply.code(200).send(app);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // ── Withdraw ───────────────────────────────────────────────────────────────
  // POST /applications/:id/withdraw
  fastify.post(
    "/:id/withdraw",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const app = await svc.withdrawApplication(request.tenantContext, id, actor(request));
        return reply.code(200).send(app);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );
}

function actor(request: { jwtPayload: { userId: string; role: string }; ip: string; headers: Record<string, string | string[] | undefined> }) {
  return {
    userId: request.jwtPayload.userId,
    role:   request.jwtPayload.role,
    ip:     request.ip,
    ...(request.headers["user-agent"] !== undefined && { userAgent: request.headers["user-agent"] as string }),
  };
}

function handleError(err: unknown, reply: FastifyReply) {
  if (err instanceof ApplicationError) {
    return reply.code(err.statusCode).send(problem(err.statusCode, statusTitle(err.statusCode), err.message));
  }
  throw err;
}

function statusTitle(code: number): string {
  if (code === 404) return "Not Found";
  if (code === 403) return "Forbidden";
  if (code === 409) return "Conflict";
  return "Bad Request";
}

function validationProblem(error: z.ZodError) {
  return { type: "about:blank", title: "Bad Request", status: 400, detail: "Validation failed", errors: error.errors };
}

function problem(status: number, title: string, detail: string) {
  return { type: "about:blank", title, status, detail };
}
