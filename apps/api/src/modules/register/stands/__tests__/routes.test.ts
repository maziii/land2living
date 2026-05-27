import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../../../index.js";
import type { FastifyInstance } from "fastify";

const mockStand = {
  id: "stand-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  localReference: "ND-001",
  gpsLatitude: -25.746111,
  gpsLongitude: 28.188056,
  boundaryGeojson: null,
  areaSquareMetres: 450,
  addressDescription: "Plot next to the mango tree",
  villageOrSection: "Section A",
  standType: null,
  photoS3Keys: [],
  photoUrls: [],
  priceZar: null,
  notes: null,
};

const mockStandDetail = {
  ...mockStand,
  occupants: [
    {
      occupancyId: "occ-1",
      residentId: "resident-1",
      firstName: "Themba",
      lastName: "Dlamini",
      relationship: "primary_occupant",
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: null,
      ptoId: null,
    },
  ],
};

vi.mock("../service.js", () => ({
  createStand: vi.fn(),
  listStands: vi.fn(),
  getStand: vi.fn(),
  updateStand: vi.fn(),
  deleteStand: vi.fn(),
}));

import * as svc from "../service.js";

const createPayload = {
  gpsLatitude: -25.746111,
  gpsLongitude: 28.188056,
  addressDescription: "Plot next to the mango tree",
  villageOrSection: "Section A",
};

describe("stand routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env["JWT_SECRET"] = "test-secret-at-least-32-characters-long!!";
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── POST /stands ─────────────────────────────────────────────────────────

  describe("POST /api/v1/stands", () => {
    it("returns 201 for foot_soldier", async () => {
      vi.mocked(svc.createStand).mockResolvedValueOnce(mockStand);

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "foot_soldier" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/stands",
        headers: { authorization: `Bearer ${token}` },
        payload: createPayload,
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ id: "stand-1", villageOrSection: "Section A" });
    });

    it("returns 403 for resident role", async () => {
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "resident" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/stands",
        headers: { authorization: `Bearer ${token}` },
        payload: createPayload,
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 401 with no auth", async () => {
      const res = await app.inject({ method: "POST", url: "/api/v1/stands", payload: createPayload });
      expect(res.statusCode).toBe(401);
    });

    it("returns 400 for invalid GPS latitude", async () => {
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "foot_soldier" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/stands",
        headers: { authorization: `Bearer ${token}` },
        payload: { ...createPayload, gpsLatitude: 95 },
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 400 for invalid GPS longitude", async () => {
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "foot_soldier" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/stands",
        headers: { authorization: `Bearer ${token}` },
        payload: { ...createPayload, gpsLongitude: 200 },
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 400 when required fields are missing", async () => {
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "foot_soldier" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/stands",
        headers: { authorization: `Bearer ${token}` },
        payload: { gpsLatitude: -25.7 },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── GET /stands ──────────────────────────────────────────────────────────

  describe("GET /api/v1/stands", () => {
    it("returns 200 with paginated list", async () => {
      vi.mocked(svc.listStands).mockResolvedValueOnce({
        stands: [mockStand],
        total: 1,
        page: 1,
        pageSize: 20,
      });

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/stands",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ stands: unknown[]; total: number }>();
      expect(body.total).toBe(1);
      expect(body.stands).toHaveLength(1);
    });

    it("passes villageOrSection filter", async () => {
      vi.mocked(svc.listStands).mockResolvedValueOnce({ stands: [], total: 0, page: 1, pageSize: 20 });

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "foot_soldier" });
      await app.inject({
        method: "GET",
        url: "/api/v1/stands?villageOrSection=Section+A",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(svc.listStands).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ villageOrSection: "Section A" }),
        expect.anything(),
      );
    });

    it("passes bbox filter", async () => {
      vi.mocked(svc.listStands).mockResolvedValueOnce({ stands: [], total: 0, page: 1, pageSize: 20 });

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "foot_soldier" });
      await app.inject({
        method: "GET",
        url: "/api/v1/stands?bbox=-26,27,-25,29",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(svc.listStands).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ bbox: "-26,27,-25,29" }),
        expect.anything(),
      );
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/stands" });
      expect(res.statusCode).toBe(401);
    });
  });

  // ── GET /stands/:id ──────────────────────────────────────────────────────

  describe("GET /api/v1/stands/:id", () => {
    it("returns 200 with occupants", async () => {
      vi.mocked(svc.getStand).mockResolvedValueOnce(mockStandDetail);

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "foot_soldier" });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/stands/stand-1",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ occupants: unknown[] }>();
      expect(body.occupants).toHaveLength(1);
    });

    it("returns 404 when stand not found", async () => {
      vi.mocked(svc.getStand).mockResolvedValueOnce(null);

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/stands/nonexistent",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── PATCH /stands/:id ────────────────────────────────────────────────────

  describe("PATCH /api/v1/stands/:id", () => {
    it("returns 200 for council_secretary", async () => {
      vi.mocked(svc.updateStand).mockResolvedValueOnce({ ...mockStand, notes: "Updated" });

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "PATCH",
        url: "/api/v1/stands/stand-1",
        headers: { authorization: `Bearer ${token}` },
        payload: { notes: "Updated" },
      });

      expect(res.statusCode).toBe(200);
    });

    it("returns 403 for foot_soldier", async () => {
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "foot_soldier" });
      const res = await app.inject({
        method: "PATCH",
        url: "/api/v1/stands/stand-1",
        headers: { authorization: `Bearer ${token}` },
        payload: { notes: "Updated" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 404 when stand not found", async () => {
      vi.mocked(svc.updateStand).mockResolvedValueOnce(null);

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "PATCH",
        url: "/api/v1/stands/nonexistent",
        headers: { authorization: `Bearer ${token}` },
        payload: { notes: "Updated" },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── DELETE /stands/:id ───────────────────────────────────────────────────

  describe("DELETE /api/v1/stands/:id", () => {
    it("returns 200 for council_secretary", async () => {
      vi.mocked(svc.deleteStand).mockResolvedValueOnce(true);

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "DELETE",
        url: "/api/v1/stands/stand-1",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ success: true });
    });

    it("returns 403 for foot_soldier", async () => {
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "foot_soldier" });
      const res = await app.inject({
        method: "DELETE",
        url: "/api/v1/stands/stand-1",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 404 when stand not found", async () => {
      vi.mocked(svc.deleteStand).mockResolvedValueOnce(false);

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "DELETE",
        url: "/api/v1/stands/nonexistent",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
