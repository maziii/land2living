import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../../index.js";
import type { FastifyInstance } from "fastify";
import type { ListingResponse } from "../types.js";

const mockListing = (overrides: Partial<ListingResponse> = {}): ListingResponse => ({
  id: "listing-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  sellerResidentId: "a0000000-0000-0000-0000-000000000001",
  standId: "b0000000-0000-0000-0000-000000000001",
  ptoId: "c0000000-0000-0000-0000-000000000001",
  listingType: "built_property",
  askingPriceZar: 15000000,
  description: "3-room brick house near school",
  negotiable: true,
  status: "transfer_pending",
  expiresAt: "2026-04-01T00:00:00.000Z",
  photos: [],
  commissionBasisPoints: 250,
  paymentLinkUrl: "https://pay.mock.local/checkout/mock_pay_listing-1",
  escrowPaymentId: "mock_pay_listing-1_123",
  paymentReceivedAt: null,
  ...overrides,
});

vi.mock("../service.js", () => ({
  initiateTransfer: vi.fn(),
  recordPaymentReceived: vi.fn(),
  approveCompletion: vi.fn(),
  refundAndWithdraw: vi.fn(),
  createListing: vi.fn(),
  submitListing: vi.fn(),
  approveListing: vi.fn(),
  rejectListing: vi.fn(),
  getListing: vi.fn(),
  listListings: vi.fn(),
  submitOffer: vi.fn(),
  acceptOffer: vi.fn(),
  rejectOffer: vi.fn(),
  ResaleError: class ResaleError extends Error {
    statusCode: number;
    constructor(message: string, statusCode = 400) {
      super(message);
      this.statusCode = statusCode;
      this.name = "ResaleError";
    }
  },
}));

import * as svc from "../service.js";

describe("escrow & transfer routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env["JWT_SECRET"] = "test-secret-at-least-32-characters-long!!";
    process.env["PSP_PROVIDER"] = "mock";
    app = buildApp();
    await app.ready();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── POST /resale-listings/:id/approve-completion ──────────────────────────

  describe("POST /api/v1/resale-listings/:id/approve-completion", () => {
    it("returns 200 for council_secretary", async () => {
      const transferred = mockListing({ status: "transferred" });
      vi.mocked(svc.approveCompletion).mockResolvedValueOnce(transferred);

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/resale-listings/listing-1/approve-completion",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: "transferred" });
    });

    it("returns 403 for resident", async () => {
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "resident" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/resale-listings/listing-1/approve-completion",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 409 when listing not in payment_received state", async () => {
      vi.mocked(svc.approveCompletion).mockRejectedValueOnce(
        new (vi.mocked(svc).ResaleError as unknown as new (msg: string, code: number) => Error)(
          "Cannot perform this action on a 'transfer_pending' listing", 409,
        ),
      );
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/resale-listings/listing-1/approve-completion",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(409);
    });
  });

  // ── POST /resale-listings/:id/refund ──────────────────────────────────────

  describe("POST /api/v1/resale-listings/:id/refund", () => {
    it("returns 200 for council_secretary", async () => {
      const withdrawn = mockListing({ status: "withdrawn" });
      vi.mocked(svc.refundAndWithdraw).mockResolvedValueOnce(withdrawn);

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/resale-listings/listing-1/refund",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: "withdrawn" });
    });

    it("returns 403 for resident", async () => {
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "resident" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/resale-listings/listing-1/refund",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ── POST /webhooks/psp/payment-completed ─────────────────────────────────

  describe("POST /api/v1/webhooks/psp/payment-completed", () => {
    it("returns 200 and records payment for completed event", async () => {
      const received = mockListing({ status: "payment_received", paymentReceivedAt: "2026-01-10T00:00:00.000Z" });
      vi.mocked(svc.recordPaymentReceived).mockResolvedValueOnce(received);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/psp/payment-completed",
        headers: { "x-tenant-slug": "ndebele" },
        payload: {
          listingId: "listing-1",
          paymentId: "mock_pay_listing-1_123",
          status: "completed",
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ received: true });
      expect(svc.recordPaymentReceived).toHaveBeenCalledWith(
        expect.objectContaining({ slug: "ndebele" }),
        "mock_pay_listing-1_123",
      );
    });

    it("returns 200 without calling service for failed event", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/psp/payment-completed",
        headers: { "x-tenant-slug": "ndebele" },
        payload: {
          listingId: "listing-1",
          paymentId: "mock_pay_listing-1_456",
          status: "failed",
        },
      });

      expect(res.statusCode).toBe(200);
      expect(svc.recordPaymentReceived).not.toHaveBeenCalled();
    });

    it("returns 400 when x-tenant-slug header is missing for completed event", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/psp/payment-completed",
        payload: {
          listingId: "listing-1",
          paymentId: "mock_pay_listing-1_789",
          status: "completed",
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 for malformed payload", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/psp/payment-completed",
        headers: { "x-tenant-slug": "ndebele" },
        payload: { listingId: "listing-1" },
      });

      expect(res.statusCode).toBe(400);
    });
  });
});
