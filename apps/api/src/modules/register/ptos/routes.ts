import type { FastifyInstance, FastifyReply } from "fastify";
import { requireAuth, requireRole } from "../../../shared/identity/middleware.js";
import * as svc from "./service.js";
import { PTOError } from "./service.js";
import { verifyPTOSchema, listPTOsQuerySchema, revokePTOSchema } from "./schemas.js";

export async function ptoRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /ptos — list / search all PTOs (any authed council staff)
  fastify.get(
    "/ptos",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const query = listPTOsQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send(validationProblem(query.error));
      const result = await svc.listPTOs(request.tenantContext, query.data);
      return reply.code(200).send(result);
    },
  );

  // POST /applications/:id/issue-pto — council_secretary only
  fastify.post(
    "/applications/:id/issue-pto",
    { preHandler: [requireAuth, requireRole("council_secretary", "founder")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const pto = await svc.issuePTO(request.tenantContext, id, {
          userId: request.jwtPayload.userId,
          role: request.jwtPayload.role,
          ip: request.ip,
          ...(request.headers["user-agent"] !== undefined && { userAgent: request.headers["user-agent"] }),
        });
        return reply.code(201).send(pto);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // GET /ptos/:id — any authed
  fastify.get(
    "/ptos/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const pto = await svc.getPTO(request.tenantContext, id);
      if (!pto) return reply.code(404).send(problem(404, "Not Found", "PTO not found"));
      return reply.code(200).send(pto);
    },
  );

  // GET /ptos/:id/history — occupancy chain for a PTO (any authed)
  fastify.get(
    "/ptos/:id/history",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const history = await svc.getPTOHistory(request.tenantContext, id);
      return reply.code(200).send(history);
    },
  );

  // GET /ptos/:id/pdf — generate and return PDF (any authed)
  fastify.get(
    "/ptos/:id/pdf",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const pdf = await svc.getPTOPDF(request.tenantContext, id);
        if (!pdf) return reply.code(404).send(problem(404, "Not Found", "PTO not found"));
        return reply
          .code(200)
          .header("Content-Type", "application/pdf")
          .header("Content-Disposition", `attachment; filename="PTO-${id.slice(0, 8).toUpperCase()}.pdf"`)
          .send(pdf);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // POST /ptos/:id/revoke — founder or council_secretary
  fastify.post(
    "/ptos/:id/revoke",
    { preHandler: [requireAuth, requireRole("council_secretary", "founder")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = revokePTOSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send(validationProblem(body.error));
      try {
        const pto = await svc.revokePTO(request.tenantContext, id, body.data.reason, {
          userId: request.jwtPayload.userId,
          role: request.jwtPayload.role,
          ip: request.ip,
          ...(request.headers["user-agent"] !== undefined && { userAgent: request.headers["user-agent"] }),
        });
        return reply.code(200).send(pto);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // POST /ptos/verify — public, no auth required
  fastify.post(
    "/ptos/verify",
    async (request, reply) => {
      const body = verifyPTOSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send(validationProblem(body.error));
      const result = svc.verifyPTO(request.tenantContext, body.data.signedPayloadJson, body.data.signatureBase64);
      return reply.code(200).send(result);
    },
  );
}

function handleError(err: unknown, reply: FastifyReply) {
  if (err instanceof PTOError) {
    const title = err.statusCode === 404 ? "Not Found" : err.statusCode === 409 ? "Conflict" : "Bad Request";
    return reply.code(err.statusCode).send(problem(err.statusCode, title, err.message));
  }
  throw err;
}

function validationProblem(error: { errors: unknown[] }) {
  return { type: "about:blank", title: "Bad Request", status: 400, detail: "Validation failed", errors: error.errors };
}

function problem(status: number, title: string, detail: string) {
  return { type: "about:blank", title, status, detail };
}
