import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../../index.js";
import type { FastifyInstance } from "fastify";
import type { BookingResponse } from "../types.js";

const mockBooking = (overrides: Partial<BookingResponse> = {}): BookingResponse => ({
  id: "booking-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  tenantSlug: "ndebele",
  customerResidentId: "a0000000-0000-0000-0000-000000000001",
  providerId: "b0000000-0000-0000-0000-000000000001",
  category: "plumbing",
  description: "Fix leaking pipe in kitchen",
  requestedDate: null,
  quoteAmountZar: null,
  takeRateBasisPoints: null,
  status: "quote_requested",
  escrowPaymentId: null,
  customerRating: null,
  providerRating: null,
  customerConfirmedAt: null,
  providerConfirmedAt: null,
  ...overrides,
});

vi.mock("../service.js", () => ({
  createBooking: vi.fn(),
  submitQuote: vi.fn(),
  acceptQuote: vi.fn(),
  markStarted: vi.fn(),
  confirmCompletion: vi.fn(),
  disputeBooking: vi.fn(),
  getBooking: vi.fn(),
  listBookings: vi.fn(),
  ServicesError: class ServicesError extends Error {
    statusCode: number;
    constructor(message: string, statusCode = 400) {
      super(message);
      this.statusCode = statusCode;
      this.name = "ServicesError";
    }
  },
}));

import * as svc from "../service.js";

const createPayload = {
  providerId: "b0000000-0000-0000-0000-000000000001",
  category: "plumbing",
  description: "Fix leaking pipe in kitchen",
};

describe("services booking routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env["JWT_SECRET"] = "test-secret-at-least-32-characters-long!!";
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => { await app.close(); });
  beforeEach(() => { vi.clearAllMocks(); });

  // ── POST /services/bookings ──────────────────────────────────────────────

  describe("POST /api/v1/services/bookings", () => {
    it("returns 201 for authenticated resident", async () => {
      vi.mocked(svc.createBooking).mockResolvedValueOnce(mockBooking());
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "resident" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/services/bookings",
        headers: { authorization: `Bearer ${token}` },
        payload: createPayload,
      });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ id: "booking-1", status: "quote_requested" });
    });

    it("returns 401 without token", async () => {
      const res = await app.inject({ method: "POST", url: "/api/v1/services/bookings", payload: createPayload });
      expect(res.statusCode).toBe(401);
    });

    it("returns 400 for invalid category", async () => {
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "resident" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/services/bookings",
        headers: { authorization: `Bearer ${token}` },
        payload: { ...createPayload, category: "quantum_tunneling" },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── GET /services/bookings ───────────────────────────────────────────────

  describe("GET /api/v1/services/bookings", () => {
    it("returns 200 list for authenticated user", async () => {
      vi.mocked(svc.listBookings).mockResolvedValueOnce({
        bookings: [mockBooking()], total: 1, page: 1, pageSize: 20,
      });
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "resident" });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/services/bookings",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ total: 1 });
    });
  });

  // ── POST /services/bookings/:id/quote ────────────────────────────────────

  describe("POST /api/v1/services/bookings/:id/quote", () => {
    it("returns 200 for provider role", async () => {
      const quoted = mockBooking({ status: "quoted", quoteAmountZar: 3500, takeRateBasisPoints: 700 });
      vi.mocked(svc.submitQuote).mockResolvedValueOnce(quoted);
      const token = app.jwt.sign({ userId: "provider-1", tenantSlug: "ndebele", role: "provider" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/services/bookings/booking-1/quote",
        headers: { authorization: `Bearer ${token}` },
        payload: { quoteAmountZar: 3500 },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: "quoted", quoteAmountZar: 3500, takeRateBasisPoints: 700 });
    });

    it("returns 403 for resident role", async () => {
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "resident" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/services/bookings/booking-1/quote",
        headers: { authorization: `Bearer ${token}` },
        payload: { quoteAmountZar: 3500 },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ── PATCH /services/bookings/:id/accept-quote ────────────────────────────

  describe("PATCH /api/v1/services/bookings/:id/accept-quote", () => {
    it("returns 200 for authenticated user", async () => {
      const accepted = mockBooking({ status: "accepted", quoteAmountZar: 3500 });
      vi.mocked(svc.acceptQuote).mockResolvedValueOnce(accepted);
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "resident" });
      const res = await app.inject({
        method: "PATCH",
        url: "/api/v1/services/bookings/booking-1/accept-quote",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: "accepted" });
    });
  });

  // ── POST /services/bookings/:id/start ────────────────────────────────────

  describe("POST /api/v1/services/bookings/:id/start", () => {
    it("returns 200 for provider role", async () => {
      vi.mocked(svc.markStarted).mockResolvedValueOnce(mockBooking({ status: "in_progress" }));
      const token = app.jwt.sign({ userId: "provider-1", tenantSlug: "ndebele", role: "provider" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/services/bookings/booking-1/start",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: "in_progress" });
    });
  });

  // ── POST /services/bookings/:id/complete ─────────────────────────────────

  describe("POST /api/v1/services/bookings/:id/complete", () => {
    it("returns 200 for customer confirmation", async () => {
      const now = new Date().toISOString();
      vi.mocked(svc.confirmCompletion).mockResolvedValueOnce(
        mockBooking({ status: "in_progress", customerConfirmedAt: now }),
      );
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "resident" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/services/bookings/booking-1/complete",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it("returns 200 marking completed when both parties confirm", async () => {
      const now = new Date().toISOString();
      vi.mocked(svc.confirmCompletion).mockResolvedValueOnce(
        mockBooking({ status: "completed", customerConfirmedAt: now, providerConfirmedAt: now }),
      );
      const token = app.jwt.sign({ userId: "provider-1", tenantSlug: "ndebele", role: "provider" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/services/bookings/booking-1/complete",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: "completed" });
    });
  });

  // ── POST /services/bookings/:id/dispute ──────────────────────────────────

  describe("POST /api/v1/services/bookings/:id/dispute", () => {
    it("returns 200 with disputed status", async () => {
      vi.mocked(svc.disputeBooking).mockResolvedValueOnce(mockBooking({ status: "disputed" }));
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "resident" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/services/bookings/booking-1/dispute",
        headers: { authorization: `Bearer ${token}` },
        payload: { reason: "Work was not completed as agreed in the quote" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: "disputed" });
    });

    it("returns 409 when booking in wrong state", async () => {
      vi.mocked(svc.disputeBooking).mockRejectedValueOnce(
        new (vi.mocked(svc).ServicesError as unknown as new (msg: string, code: number) => Error)(
          "Cannot perform this action on a 'completed' booking", 409,
        ),
      );
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "resident" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/services/bookings/booking-1/dispute",
        headers: { authorization: `Bearer ${token}` },
        payload: { reason: "Work was not completed as agreed in the quote" },
      });
      expect(res.statusCode).toBe(409);
    });
  });
});
