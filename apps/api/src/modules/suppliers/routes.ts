import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { requireAuth, requireRole } from "../../shared/identity/middleware.js";
import * as svc from "./service.js";
import { SuppliersError } from "./service.js";
import * as commissionSvc from "./commission-service.js";
import {
  createQuoteRequestSchema,
  submitManualResponseSchema,
  selectSupplierSchema,
  listQuoteRequestsQuerySchema,
} from "./schemas.js";
import {
  recordSaleSchema,
  recordPaymentSchema,
  listSalesQuerySchema,
} from "./commission-schemas.js";

export async function supplierRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /suppliers/quote-requests — council staff creates and dispatches a quote request
  fastify.post(
    "/suppliers/quote-requests",
    { preHandler: [requireAuth, requireRole("council_secretary", "founder")] },
    async (request, reply) => {
      const body = createQuoteRequestSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send(validationProblem(body.error));

      try {
        const result = await svc.createAndDispatchQuoteRequest(
          request.tenantContext.slug,
          request.jwtPayload.userId,
          body.data,
          actor(request),
        );
        return reply.code(201).send(result);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // GET /suppliers/quote-requests — list quote requests
  fastify.get(
    "/suppliers/quote-requests",
    { preHandler: [requireAuth, requireRole("council_secretary", "founder")] },
    async (request, reply) => {
      const query = listQuoteRequestsQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send(validationProblem(query.error));

      const result = await svc.listQuoteRequests(query.data);
      return reply.code(200).send(result);
    },
  );

  // GET /suppliers/quote-requests/:id — get a single request with response count
  fastify.get(
    "/suppliers/quote-requests/:id",
    { preHandler: [requireAuth, requireRole("council_secretary", "founder")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = await svc.getQuoteRequest(id);
      if (!result) return reply.code(404).send(problem(404, "Not Found", "Quote request not found"));
      return reply.code(200).send(result);
    },
  );

  // GET /suppliers/quote-requests/:id/responses — compare all quotes received
  fastify.get(
    "/suppliers/quote-requests/:id/responses",
    { preHandler: [requireAuth, requireRole("council_secretary", "founder")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const result = await svc.listResponses(id);
        return reply.code(200).send(result);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // POST /suppliers/quote-requests/:id/responses — council staff enters manual response
  fastify.post(
    "/suppliers/quote-requests/:id/responses",
    { preHandler: [requireAuth, requireRole("council_secretary", "founder")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = submitManualResponseSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send(validationProblem(body.error));

      try {
        const result = await svc.submitManualResponse(id, body.data, actor(request));
        return reply.code(201).send(result);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // POST /suppliers/quote-requests/:id/select — select winning supplier
  fastify.post(
    "/suppliers/quote-requests/:id/select",
    { preHandler: [requireAuth, requireRole("council_secretary", "founder")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = selectSupplierSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send(validationProblem(body.error));

      try {
        const result = await svc.selectSupplier(id, body.data, actor(request));
        return reply.code(200).send(result);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // ── Commission / Sales ──────────────────────────────────────────────────────

  // POST /suppliers/sales — record a fulfilled sale
  fastify.post(
    "/suppliers/sales",
    { preHandler: [requireAuth, requireRole("council_secretary", "founder")] },
    async (request, reply) => {
      const body = recordSaleSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send(validationProblem(body.error));

      try {
        const result = await commissionSvc.recordSale(body.data, actor(request));
        return reply.code(201).send(result);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // GET /suppliers/sales — list sales with commission summary
  fastify.get(
    "/suppliers/sales",
    { preHandler: [requireAuth, requireRole("council_secretary", "founder")] },
    async (request, reply) => {
      const query = listSalesQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send(validationProblem(query.error));

      const result = await commissionSvc.listSales(query.data);
      return reply.code(200).send(result);
    },
  );

  // GET /suppliers/sales/:id — get single sale
  fastify.get(
    "/suppliers/sales/:id",
    { preHandler: [requireAuth, requireRole("council_secretary", "founder")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = await commissionSvc.getSale(id);
      if (!result) return reply.code(404).send(problem(404, "Not Found", "Sale not found"));
      return reply.code(200).send(result);
    },
  );

  // POST /suppliers/sales/:id/invoice — mark sale as invoiced
  fastify.post(
    "/suppliers/sales/:id/invoice",
    { preHandler: [requireAuth, requireRole("council_secretary", "founder")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const result = await commissionSvc.generateInvoice(id, actor(request));
        return reply.code(200).send(result);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // POST /suppliers/sales/:id/payment — mark commission payment received
  fastify.post(
    "/suppliers/sales/:id/payment",
    { preHandler: [requireAuth, requireRole("council_secretary", "founder")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = recordPaymentSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send(validationProblem(body.error));

      try {
        const result = await commissionSvc.recordPayment(id, body.data, actor(request));
        return reply.code(200).send(result);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );
}

// ── Webhook routes (no auth — verified by supplier-side secrets or IP allowlist in production) ──

export async function supplierWebhookRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /webhooks/supplier-adapter/whatsapp — inbound WhatsApp reply from supplier
  fastify.post("/webhooks/supplier-adapter/whatsapp", async (request, reply) => {
    const payload = request.body as Record<string, unknown>;

    // Extract supplierId and requestId from the webhook payload
    const supplierId = payload["supplierId"] as string | undefined;
    const requestId = payload["requestId"] as string | undefined;

    if (!supplierId || !requestId) {
      // WhatsApp webhooks also send verification challenges
      const challenge = (payload["hub.challenge"]) as string | undefined;
      if (challenge) return reply.code(200).send(challenge);
      return reply.code(200).send({ received: true });
    }

    await svc.recordIncomingResponse(supplierId, requestId, "whatsapp_template", payload);
    return reply.code(200).send({ received: true });
  });

  // GET /webhooks/supplier-adapter/whatsapp — WhatsApp webhook verification challenge
  fastify.get("/webhooks/supplier-adapter/whatsapp", async (request, reply) => {
    const query = request.query as Record<string, string>;
    const verifyToken = process.env["WHATSAPP_WEBHOOK_VERIFY_TOKEN"] ?? "l2l-verify";
    if (query["hub.verify_token"] === verifyToken) {
      return reply.code(200).send(query["hub.challenge"]);
    }
    return reply.code(403).send({ error: "Invalid verify token" });
  });

  // POST /webhooks/supplier-adapter/email — inbound email reply from supplier (via SendGrid/Mailgun inbound parse)
  fastify.post("/webhooks/supplier-adapter/email", async (request, reply) => {
    const payload = request.body as Record<string, unknown>;

    const supplierId = payload["supplierId"] as string | undefined;
    const requestId = payload["requestId"] as string | undefined;

    if (!supplierId || !requestId) {
      return reply.code(200).send({ received: true });
    }

    await svc.recordIncomingResponse(supplierId, requestId, "email_template", payload);
    return reply.code(200).send({ received: true });
  });
}

function actor(request: { jwtPayload: { userId: string; role: string }; ip: string; headers: Record<string, string | string[] | undefined> }) {
  return { userId: request.jwtPayload.userId, role: request.jwtPayload.role };
}

function handleError(err: unknown, reply: FastifyReply) {
  if (err instanceof SuppliersError) {
    const title =
      err.statusCode === 404 ? "Not Found"
      : err.statusCode === 409 ? "Conflict"
      : err.statusCode === 403 ? "Forbidden"
      : "Bad Request";
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
