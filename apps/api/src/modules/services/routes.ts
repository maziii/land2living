import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { requireAuth, requireRole } from "../../shared/identity/middleware.js";
import * as svc from "./service.js";
import { ServicesError } from "./service.js";
import {
  createBookingSchema,
  submitQuoteSchema,
  disputeBookingSchema,
  listBookingsQuerySchema,
} from "./schemas.js";

export async function servicesRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /services/bookings — customer creates booking request
  fastify.post(
    "/services/bookings",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const body = createBookingSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send(validationProblem(body.error));

      const customerResidentId = request.jwtPayload.userId;

      try {
        const booking = await svc.createBooking(
          request.tenantContext.slug,
          customerResidentId,
          body.data,
          actor(request),
        );
        return reply.code(201).send(booking);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // GET /services/bookings — list bookings
  fastify.get(
    "/services/bookings",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const query = listBookingsQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send(validationProblem(query.error));

      const result = await svc.listBookings(query.data);
      return reply.code(200).send(result);
    },
  );

  // GET /services/bookings/:id
  fastify.get(
    "/services/bookings/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const booking = await svc.getBooking(id);
      if (!booking) return reply.code(404).send(problem(404, "Not Found", "Booking not found"));
      return reply.code(200).send(booking);
    },
  );

  // POST /services/bookings/:id/quote — provider submits quote
  fastify.post(
    "/services/bookings/:id/quote",
    { preHandler: [requireAuth, requireRole("provider", "founder")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = submitQuoteSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send(validationProblem(body.error));

      try {
        const booking = await svc.submitQuote(id, body.data, actor(request));
        return reply.code(200).send(booking);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // PATCH /services/bookings/:id/accept-quote — customer accepts a quote
  fastify.patch(
    "/services/bookings/:id/accept-quote",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const booking = await svc.acceptQuote(id, actor(request));
        return reply.code(200).send(booking);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // POST /services/bookings/:id/start — provider marks work started
  fastify.post(
    "/services/bookings/:id/start",
    { preHandler: [requireAuth, requireRole("provider", "founder")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const booking = await svc.markStarted(id, actor(request));
        return reply.code(200).send(booking);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // POST /services/bookings/:id/complete — confirm completion (customer or provider)
  fastify.post(
    "/services/bookings/:id/complete",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { role } = request.jwtPayload;
      const confirmRole: "customer" | "provider" = role === "provider" ? "provider" : "customer";
      try {
        const booking = await svc.confirmCompletion(id, confirmRole, actor(request));
        return reply.code(200).send(booking);
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  // POST /services/bookings/:id/dispute
  fastify.post(
    "/services/bookings/:id/dispute",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = disputeBookingSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send(validationProblem(body.error));

      try {
        const booking = await svc.disputeBooking(id, body.data, actor(request));
        return reply.code(200).send(booking);
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
  if (err instanceof ServicesError) {
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
