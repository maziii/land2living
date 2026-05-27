import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth, requireRole } from "../../shared/identity/middleware.js";
import { getPspAdapter } from "../../adapters/payment-psp/index.js";
import * as svc from "./service.js";
import { ResaleError } from "./service.js";
import {
  createListingSchema,
  listListingsQuerySchema,
  createOfferSchema,
  decideOfferSchema,
} from "./schemas.js";

const pspWebhookSchema = z.object({
  listingId: z.string(),
  paymentId: z.string(),
  status: z.enum(["completed", "failed"]),
});

export async function resaleRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /resale-listings — create draft
  fastify.post(
    "/resale-listings",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const body = createListingSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send(validationProblem(body.error));

      try {
        const listing = await svc.createListing(request.tenantContext, body.data, actor(request));
        return reply.code(201).send(listing);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // POST /resale-listings/:id/submit — submit for approval
  fastify.post(
    "/resale-listings/:id/submit",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const listing = await svc.submitListing(request.tenantContext, id, actor(request));
        return reply.code(200).send(listing);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // PATCH /resale-listings/:id/approve — council_secretary only
  fastify.patch(
    "/resale-listings/:id/approve",
    { preHandler: [requireAuth, requireRole("council_secretary", "founder")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const listing = await svc.approveListing(request.tenantContext, id, actor(request));
        return reply.code(200).send(listing);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // PATCH /resale-listings/:id/reject — council_secretary only
  fastify.patch(
    "/resale-listings/:id/reject",
    { preHandler: [requireAuth, requireRole("council_secretary", "founder")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const listing = await svc.rejectListing(request.tenantContext, id, actor(request));
        return reply.code(200).send(listing);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // GET /resale-listings — list (default: live only for non-council)
  fastify.get(
    "/resale-listings",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const query = listListingsQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send(validationProblem(query.error));

      const result = await svc.listListings(request.tenantContext, query.data);
      return reply.code(200).send(result);
    },
  );

  // GET /resale-listings/:id — detail
  fastify.get(
    "/resale-listings/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const listing = await svc.getListing(request.tenantContext, id);
      if (!listing) return reply.code(404).send(problem(404, "Not Found", "Listing not found"));
      return reply.code(200).send(listing);
    },
  );

  // POST /resale-listings/:id/offers — submit offer
  fastify.post(
    "/resale-listings/:id/offers",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = createOfferSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send(validationProblem(body.error));

      try {
        const offer = await svc.submitOffer(request.tenantContext, id, body.data, actor(request));
        return reply.code(201).send(offer);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // PATCH /offers/:id/accept — seller accepts
  fastify.patch(
    "/offers/:id/accept",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = decideOfferSchema.safeParse(request.body ?? {});
      if (!body.success) return reply.code(400).send(validationProblem(body.error));

      try {
        const offer = await svc.acceptOffer(request.tenantContext, id, body.data, actor(request));
        return reply.code(200).send(offer);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // PATCH /offers/:id/reject — seller rejects
  fastify.patch(
    "/offers/:id/reject",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = decideOfferSchema.safeParse(request.body ?? {});
      if (!body.success) return reply.code(400).send(validationProblem(body.error));

      try {
        const offer = await svc.rejectOffer(request.tenantContext, id, body.data, actor(request));
        return reply.code(200).send(offer);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // POST /resale-listings/:id/initiate-transfer
  fastify.post(
    "/resale-listings/:id/initiate-transfer",
    { preHandler: [requireAuth, requireRole("council_secretary", "founder")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const listing = await svc.initiateTransfer(request.tenantContext, id, actor(request));
        return reply.code(200).send(listing);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // POST /resale-listings/:id/approve-completion — council_secretary completes the transfer
  fastify.post(
    "/resale-listings/:id/approve-completion",
    { preHandler: [requireAuth, requireRole("council_secretary", "founder")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const listing = await svc.approveCompletion(request.tenantContext, id, actor(request));
        return reply.code(200).send(listing);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // POST /resale-listings/:id/refund — council rejects or seller withdraws after payment
  fastify.post(
    "/resale-listings/:id/refund",
    { preHandler: [requireAuth, requireRole("council_secretary", "founder")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const listing = await svc.refundAndWithdraw(request.tenantContext, id, actor(request));
        return reply.code(200).send(listing);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );
}

// ── PSP webhook — no JWT auth, signature verified instead ────────────────────
export async function pspWebhookRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    "/webhooks/psp/payment-completed",
    async (request: FastifyRequest, reply) => {
      const psp = getPspAdapter();
      const rawBody = JSON.stringify(request.body);
      const headers = request.headers as Record<string, string | string[] | undefined>;

      if (!psp.verifyWebhookSignature(rawBody, headers)) {
        return reply.code(401).send({ error: "Invalid webhook signature" });
      }

      const parsed = pspWebhookSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid payload" });
      }

      const { listingId, paymentId, status } = parsed.data;

      if (status === "failed") {
        fastify.log.warn({ listingId, paymentId }, "PSP payment failed");
        return reply.code(200).send({ received: true });
      }

      // status === "completed"
      const tenantSlug = (request.headers["x-tenant-slug"] as string | undefined) ?? "";
      if (!tenantSlug) {
        return reply.code(400).send({ error: "x-tenant-slug header required" });
      }

      const tenantContext = { slug: tenantSlug, schemaName: `tenant_${tenantSlug}` };
      const listing = await svc.recordPaymentReceived(tenantContext, paymentId);

      if (!listing) {
        fastify.log.warn({ paymentId }, "No listing found for payment");
      }

      return reply.code(200).send({ received: true });
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
  if (err instanceof ResaleError) {
    const title = err.statusCode === 404 ? "Not Found" : err.statusCode === 409 ? "Conflict" : err.statusCode === 403 ? "Forbidden" : "Bad Request";
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
