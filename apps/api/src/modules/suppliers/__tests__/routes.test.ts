import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../../index.js";
import type { FastifyInstance } from "fastify";
import type { QuoteRequestResponse, QuoteResponseListResponse, QuoteResponseItem } from "../types.js";

const mockRequest = (overrides: Partial<QuoteRequestResponse> = {}): QuoteRequestResponse => ({
  id: "req-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  tenantSlug: "ndebele",
  requestedByUserId: "user-1",
  basket: [{ description: "Cement bags 50kg", quantity: 20, unit: "bags" }],
  dispatchedToSupplierIds: ["sup-1", "sup-2"],
  status: "pending",
  responseCount: 0,
  ...overrides,
});

const mockResponseItem = (overrides: Partial<QuoteResponseItem> = {}): QuoteResponseItem => ({
  id: "resp-1",
  createdAt: "2026-01-02T00:00:00.000Z",
  requestId: "req-1",
  supplierId: "sup-1",
  supplierName: "Ndebele Hardware",
  receivedVia: "manual",
  quoteAmountZar: 14500,
  availability: "in_stock",
  leadTimeDays: 3,
  rawResponseText: "We can supply",
  ...overrides,
});

vi.mock("../service.js", () => ({
  createAndDispatchQuoteRequest: vi.fn(),
  getQuoteRequest: vi.fn(),
  listQuoteRequests: vi.fn(),
  listResponses: vi.fn(),
  submitManualResponse: vi.fn(),
  selectSupplier: vi.fn(),
  recordIncomingResponse: vi.fn(),
  startSupplierDispatchWorker: vi.fn(),
  SuppliersError: class SuppliersError extends Error {
    statusCode: number;
    constructor(message: string, statusCode = 400) {
      super(message);
      this.statusCode = statusCode;
      this.name = "SuppliersError";
    }
  },
}));

import * as svc from "../service.js";

const createPayload = {
  supplierIds: ["a0000000-0000-0000-0000-000000000001", "a0000000-0000-0000-0000-000000000002"],
  basket: [{ description: "Cement bags 50kg", quantity: 20, unit: "bags" }],
  responseDeadlineDays: 7,
};

describe("supplier quote routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env["JWT_SECRET"] = "test-secret-at-least-32-characters-long!!";
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => { await app.close(); });
  beforeEach(() => { vi.clearAllMocks(); });

  // ── POST /suppliers/quote-requests ────────────────────────────────────────

  describe("POST /api/v1/suppliers/quote-requests", () => {
    it("returns 201 for council_secretary", async () => {
      vi.mocked(svc.createAndDispatchQuoteRequest).mockResolvedValueOnce(mockRequest({ responseCount: 0 }));
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/suppliers/quote-requests",
        headers: { authorization: `Bearer ${token}` },
        payload: createPayload,
      });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ id: "req-1", status: "pending" });
    });

    it("returns 403 for resident role", async () => {
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "resident" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/suppliers/quote-requests",
        headers: { authorization: `Bearer ${token}` },
        payload: createPayload,
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 401 without token", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/suppliers/quote-requests",
        payload: createPayload,
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 400 for empty basket", async () => {
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/suppliers/quote-requests",
        headers: { authorization: `Bearer ${token}` },
        payload: { ...createPayload, basket: [] },
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 404 when supplier not found", async () => {
      vi.mocked(svc.createAndDispatchQuoteRequest).mockRejectedValueOnce(
        new (vi.mocked(svc).SuppliersError as unknown as new (msg: string, code: number) => Error)(
          "Supplier(s) not found: a0000000-0000-0000-0000-000000000001", 404,
        ),
      );
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/suppliers/quote-requests",
        headers: { authorization: `Bearer ${token}` },
        payload: createPayload,
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── GET /suppliers/quote-requests ─────────────────────────────────────────

  describe("GET /api/v1/suppliers/quote-requests", () => {
    it("returns 200 list", async () => {
      vi.mocked(svc.listQuoteRequests).mockResolvedValueOnce({
        requests: [mockRequest()], total: 1, page: 1, pageSize: 20,
      });
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/suppliers/quote-requests",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ total: 1 });
    });
  });

  // ── GET /suppliers/quote-requests/:id/responses ───────────────────────────

  describe("GET /api/v1/suppliers/quote-requests/:id/responses", () => {
    it("returns comparison list with responses", async () => {
      const listResult: QuoteResponseListResponse = {
        requestId: "req-1",
        status: "receiving",
        responses: [
          mockResponseItem({ supplierId: "sup-1", quoteAmountZar: 14500 }),
          mockResponseItem({ id: "resp-2", supplierId: "sup-2", quoteAmountZar: 12000, supplierName: "Zulu Builders" }),
        ],
      };
      vi.mocked(svc.listResponses).mockResolvedValueOnce(listResult);
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/suppliers/quote-requests/req-1/responses",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().responses).toHaveLength(2);
    });
  });

  // ── POST /suppliers/quote-requests/:id/responses ─────────────────────────

  describe("POST /api/v1/suppliers/quote-requests/:id/responses", () => {
    it("returns 201 for manual entry", async () => {
      vi.mocked(svc.submitManualResponse).mockResolvedValueOnce(mockResponseItem());
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/suppliers/quote-requests/req-1/responses",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          supplierId: "a0000000-0000-0000-0000-000000000001",
          quoteAmountZar: 14500,
          availability: "in_stock",
          leadTimeDays: 3,
          notes: "Spoke to supplier via phone",
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ quoteAmountZar: 14500 });
    });
  });

  // ── POST /suppliers/quote-requests/:id/select ─────────────────────────────

  describe("POST /api/v1/suppliers/quote-requests/:id/select", () => {
    it("returns 200 with selected status", async () => {
      vi.mocked(svc.selectSupplier).mockResolvedValueOnce({
        requestId: "req-1",
        status: "selected",
        responses: [mockResponseItem()],
      });
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/suppliers/quote-requests/req-1/select",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          supplierId: "a0000000-0000-0000-0000-000000000001",
          responseId: "b0000000-0000-0000-0000-000000000001",
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: "selected" });
    });

    it("returns 409 when supplier already selected", async () => {
      vi.mocked(svc.selectSupplier).mockRejectedValueOnce(
        new (vi.mocked(svc).SuppliersError as unknown as new (msg: string, code: number) => Error)(
          "A supplier has already been selected for this request", 409,
        ),
      );
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/suppliers/quote-requests/req-1/select",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          supplierId: "a0000000-0000-0000-0000-000000000001",
          responseId: "b0000000-0000-0000-0000-000000000001",
        },
      });
      expect(res.statusCode).toBe(409);
    });
  });

  // ── POST /webhooks/supplier-adapter/whatsapp ─────────────────────────────

  describe("POST /api/v1/webhooks/supplier-adapter/whatsapp", () => {
    it("returns 200 for valid webhook payload", async () => {
      vi.mocked(svc.recordIncomingResponse).mockResolvedValueOnce(undefined);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/supplier-adapter/whatsapp",
        payload: { supplierId: "sup-1", requestId: "req-1", entry: [] },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ received: true });
      expect(vi.mocked(svc.recordIncomingResponse)).toHaveBeenCalledWith(
        "sup-1", "req-1", "whatsapp_template", expect.any(Object),
      );
    });

    it("returns 200 for verification challenge (no supplierId/requestId)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/supplier-adapter/whatsapp",
        payload: { "hub.challenge": "12345" },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  // ── POST /webhooks/supplier-adapter/email ────────────────────────────────

  describe("POST /api/v1/webhooks/supplier-adapter/email", () => {
    it("returns 200 and records response", async () => {
      vi.mocked(svc.recordIncomingResponse).mockResolvedValueOnce(undefined);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/supplier-adapter/email",
        payload: {
          supplierId: "sup-1",
          requestId: "req-1",
          text: "Our quote for Request ID: req-1 is R 14 500",
        },
      });
      expect(res.statusCode).toBe(200);
      expect(vi.mocked(svc.recordIncomingResponse)).toHaveBeenCalledWith(
        "sup-1", "req-1", "email_template", expect.any(Object),
      );
    });
  });
});
