import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../../index.js";
import type { FastifyInstance } from "fastify";
import type { ListingResponse, OfferResponse, ListingDetailResponse } from "../types.js";

const mockListing: ListingResponse = {
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
  status: "draft",
  expiresAt: "2026-04-01T00:00:00.000Z",
  photos: [],
  commissionBasisPoints: 250,
  paymentLinkUrl: null,
  escrowPaymentId: null,
  paymentReceivedAt: null,
  standAddress: "Stand A-001",
  standVillage: "Hammanskraal",
  standAreaSqm: 300,
  standType: "residential",
  standReference: "A-001",
};

const mockOffer: OfferResponse = {
  id: "offer-1",
  createdAt: "2026-01-02T00:00:00.000Z",
  listingId: "listing-1",
  buyerResidentId: "d0000000-0000-0000-0000-000000000001",
  offerAmountZar: 14000000,
  status: "submitted",
  decidedAt: null,
  notes: null,
};

const mockListingDetail: ListingDetailResponse = { ...mockListing, offers: [mockOffer] };

vi.mock("../service.js", () => ({
  createListing: vi.fn(),
  submitListing: vi.fn(),
  approveListing: vi.fn(),
  rejectListing: vi.fn(),
  getListing: vi.fn(),
  listListings: vi.fn(),
  submitOffer: vi.fn(),
  acceptOffer: vi.fn(),
  rejectOffer: vi.fn(),
  initiateTransfer: vi.fn(),
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
import { ResaleError } from "../service.js";

const createPayload = {
  sellerResidentId: "a0000000-0000-0000-0000-000000000001",
  standId: "b0000000-0000-0000-0000-000000000001",
  ptoId: "c0000000-0000-0000-0000-000000000001",
  listingType: "built_property",
  askingPriceZar: 15000000,
  description: "3-room brick house near school",
  negotiable: true,
};

describe("resale routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env["JWT_SECRET"] = "test-secret-at-least-32-characters-long!!";
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── POST /resale-listings ────────────────────────────────────────────────

  describe("POST /api/v1/resale-listings", () => {
    it("returns 201 for authenticated user", async () => {
      vi.mocked(svc.createListing).mockResolvedValueOnce(mockListing);

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "foot_soldier" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/resale-listings",
        headers: { authorization: `Bearer ${token}` },
        payload: createPayload,
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ id: "listing-1", status: "draft" });
    });

    it("returns 401 without token", async () => {
      const res = await app.inject({ method: "POST", url: "/api/v1/resale-listings", payload: createPayload });
      expect(res.statusCode).toBe(401);
    });

    it("returns 409 when live listing exists for stand", async () => {
      vi.mocked(svc.createListing).mockRejectedValueOnce(
        new ResaleError("A live listing already exists for this stand", 409),
      );
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "foot_soldier" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/resale-listings",
        headers: { authorization: `Bearer ${token}` },
        payload: createPayload,
      });
      expect(res.statusCode).toBe(409);
    });
  });

  // ── GET /resale-listings ─────────────────────────────────────────────────

  describe("GET /api/v1/resale-listings", () => {
    it("returns 200 list for authenticated user", async () => {
      vi.mocked(svc.listListings).mockResolvedValueOnce({
        listings: [{ ...mockListing, status: "live" }],
        total: 1,
        page: 1,
        pageSize: 20,
      });

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "resident" });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/resale-listings",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ total: 1 });
    });
  });

  // ── POST /resale-listings/:id/submit ─────────────────────────────────────

  describe("POST /api/v1/resale-listings/:id/submit", () => {
    it("returns 200 with pending_council_approval", async () => {
      const submitted = { ...mockListing, status: "pending_council_approval" } as ListingResponse;
      vi.mocked(svc.submitListing).mockResolvedValueOnce(submitted);

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "resident" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/resale-listings/listing-1/submit",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: "pending_council_approval" });
    });

    it("returns 409 when not in draft state", async () => {
      vi.mocked(svc.submitListing).mockRejectedValueOnce(
        new ResaleError("Cannot perform this action on a 'live' listing", 409),
      );
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "resident" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/resale-listings/listing-1/submit",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(409);
    });
  });

  // ── PATCH /resale-listings/:id/approve ───────────────────────────────────

  describe("PATCH /api/v1/resale-listings/:id/approve", () => {
    it("returns 200 for council_secretary", async () => {
      const approved = { ...mockListing, status: "live" } as ListingResponse;
      vi.mocked(svc.approveListing).mockResolvedValueOnce(approved);

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "PATCH",
        url: "/api/v1/resale-listings/listing-1/approve",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: "live" });
    });

    it("returns 403 for resident", async () => {
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "resident" });
      const res = await app.inject({
        method: "PATCH",
        url: "/api/v1/resale-listings/listing-1/approve",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ── GET /resale-listings/:id ─────────────────────────────────────────────

  describe("GET /api/v1/resale-listings/:id", () => {
    it("returns 200 with listing detail and offers", async () => {
      vi.mocked(svc.getListing).mockResolvedValueOnce(mockListingDetail);

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "resident" });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/resale-listings/listing-1",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ id: "listing-1", offers: [{ id: "offer-1" }] });
    });

    it("returns 404 when not found", async () => {
      vi.mocked(svc.getListing).mockResolvedValueOnce(null);
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "resident" });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/resale-listings/missing",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── POST /resale-listings/:id/offers ─────────────────────────────────────

  describe("POST /api/v1/resale-listings/:id/offers", () => {
    it("returns 201 for authenticated buyer", async () => {
      vi.mocked(svc.submitOffer).mockResolvedValueOnce(mockOffer);

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "resident" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/resale-listings/listing-1/offers",
        headers: { authorization: `Bearer ${token}` },
        payload: { buyerResidentId: "d0000000-0000-0000-0000-000000000001", offerAmountZar: 14000000 },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ id: "offer-1", status: "submitted" });
    });

    it("returns 400 when seller tries to buy own listing", async () => {
      vi.mocked(svc.submitOffer).mockRejectedValueOnce(
        new ResaleError("Seller cannot submit an offer on their own listing", 400),
      );
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "resident" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/resale-listings/listing-1/offers",
        headers: { authorization: `Bearer ${token}` },
        payload: { buyerResidentId: "a0000000-0000-0000-0000-000000000001", offerAmountZar: 14000000 },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── PATCH /offers/:id/accept ─────────────────────────────────────────────

  describe("PATCH /api/v1/offers/:id/accept", () => {
    it("returns 200 for authenticated user", async () => {
      const accepted = { ...mockOffer, status: "accepted" } as OfferResponse;
      vi.mocked(svc.acceptOffer).mockResolvedValueOnce(accepted);

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "resident" });
      const res = await app.inject({
        method: "PATCH",
        url: "/api/v1/offers/offer-1/accept",
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: "accepted" });
    });
  });

  // ── POST /resale-listings/:id/initiate-transfer ───────────────────────────

  describe("POST /api/v1/resale-listings/:id/initiate-transfer", () => {
    it("returns 200 for council_secretary", async () => {
      const pending = { ...mockListing, status: "transfer_pending" } as ListingResponse;
      vi.mocked(svc.initiateTransfer).mockResolvedValueOnce(pending);

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/resale-listings/listing-1/initiate-transfer",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: "transfer_pending" });
    });

    it("returns 403 for resident", async () => {
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "resident" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/resale-listings/listing-1/initiate-transfer",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
