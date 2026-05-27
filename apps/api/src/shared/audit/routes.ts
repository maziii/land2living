import type { FastifyInstance } from "fastify";
import { requireAuth, requireRole } from "../identity/index.js";
import { auditQuerySchema } from "./schemas.js";
import { getAuditEvents } from "./service.js";

export async function auditRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    "/",
    { preHandler: [requireAuth, requireRole("council_secretary", "founder")] },
    async (request, reply) => {
      const parsed = auditQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({
          type: "about:blank",
          title: "Bad Request",
          status: 400,
          detail: "Invalid query parameters",
          errors: parsed.error.errors,
        });
      }

      const result = await getAuditEvents(request.tenantContext, parsed.data);
      return reply.send(result);
    },
  );
}
