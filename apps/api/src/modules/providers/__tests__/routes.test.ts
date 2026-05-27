import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../../index.js";
import type { FastifyInstance } from "fastify";
import type { ProviderResponse } from "../types.js";

const mockProvider = (overrides: Partial<ProviderResponse> = {}): ProviderResponse => ({
  id: "provider-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  businessName: "Ndebele Plumbing Services",
  cipcNumber: null,
  vatNumber: null,
  primaryContactUserId: "user-1",
  categories: ["plumbing"],
  geographicCoverage: ["ndebele"],
  verificationStatus: "unverified",
  createdByUserId: "user-1",
  ...overrides,
});

vi.mock("../service.js", () => ({
  registerProvider: vi.fn(),
  updateVerification: vi.fn(),
  getProvider: vi.fn(),
  listProviders: vi.fn(),
  ProvidersError: class ProvidersError extends Error {
    statusCode: number;
    constructor(message: string, statusCode = 400) {
      super(message);
      this.statusCode = statusCode;
      this.name = "ProvidersError";
    }
  },
}));

import * as svc from "../service.js";

const registerPayload = {
  businessName: "Ndebele Plumbing Services",
  categories: ["plumbing"],
  geographicCoverage: ["ndebele"],
};

describe("provider routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env["JWT_SECRET"] = "test-secret-at-least-32-characters-long!!";
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => { await app.close(); });
  beforeEach(() => { vi.clearAllMocks(); });

  // ── POST /providers ──────────────────────────────────────────────────────

  describe("POST /api/v1/providers", () => {
    it("returns 201 for authenticated user", async () => {
      vi.mocked(svc.registerProvider).mockResolvedValueOnce(mockProvider());
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "provider" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/providers",
        headers: { authorization: `Bearer ${token}` },
        payload: registerPayload,
      });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ id: "provider-1", verificationStatus: "unverified" });
    });

    it("returns 401 without token", async () => {
      const res = await app.inject({ method: "POST", url: "/api/v1/providers", payload: registerPayload });
      expect(res.statusCode).toBe(401);
    });

    it("returns 400 for missing required fields", async () => {
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "provider" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/providers",
        headers: { authorization: `Bearer ${token}` },
        payload: { businessName: "Test" },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── GET /providers ───────────────────────────────────────────────────────

  describe("GET /api/v1/providers", () => {
    it("returns 200 list", async () => {
      vi.mocked(svc.listProviders).mockResolvedValueOnce({
        providers: [mockProvider({ verificationStatus: "verified" })],
        total: 1, page: 1, pageSize: 20,
      });
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "resident" });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/providers",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ total: 1 });
    });
  });

  // ── GET /providers/:id ───────────────────────────────────────────────────

  describe("GET /api/v1/providers/:id", () => {
    it("returns 200 for existing provider", async () => {
      vi.mocked(svc.getProvider).mockResolvedValueOnce(mockProvider());
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "resident" });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/providers/provider-1",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ id: "provider-1" });
    });

    it("returns 404 when not found", async () => {
      vi.mocked(svc.getProvider).mockResolvedValueOnce(null);
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "resident" });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/providers/missing",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── PATCH /providers/:id/verification ───────────────────────────────────

  describe("PATCH /api/v1/providers/:id/verification", () => {
    it("returns 200 for founder role", async () => {
      vi.mocked(svc.updateVerification).mockResolvedValueOnce(mockProvider({ verificationStatus: "verified" }));
      const token = app.jwt.sign({ userId: "founder-1", tenantSlug: "ndebele", role: "founder" });
      const res = await app.inject({
        method: "PATCH",
        url: "/api/v1/providers/provider-1/verification",
        headers: { authorization: `Bearer ${token}` },
        payload: { status: "verified" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ verificationStatus: "verified" });
    });

    it("returns 403 for non-founder", async () => {
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "PATCH",
        url: "/api/v1/providers/provider-1/verification",
        headers: { authorization: `Bearer ${token}` },
        payload: { status: "verified" },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
