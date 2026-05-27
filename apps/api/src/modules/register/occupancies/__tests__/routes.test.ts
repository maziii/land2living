import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../../../index.js";
import type { FastifyInstance } from "fastify";

const mockOccupancy = {
  id: "occ-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  endedAt: null,
  standId: "stand-1",
  residentId: "resident-1",
  relationship: "primary_occupant",
  ptoId: null,
};

const mockStandWithOccupancy = {
  ...mockOccupancy,
  stand: {
    id: "stand-1",
    addressDescription: "Plot by the mango tree",
    villageOrSection: "Section A",
    localReference: "ND-001",
  },
};

vi.mock("../service.js", () => ({
  addOccupant: vi.fn(),
  updateOccupancy: vi.fn(),
  listStandOccupants: vi.fn(),
  listResidentStands: vi.fn(),
  OccupancyError: class OccupancyError extends Error {
    statusCode: number;
    constructor(msg: string, code = 400) {
      super(msg);
      this.name = "OccupancyError";
      this.statusCode = code;
    }
  },
}));

import * as svc from "../service.js";

describe("occupancy routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env["JWT_SECRET"] = "test-secret-at-least-32-characters-long!!";
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── POST /stands/:standId/occupants ────────────────────────────────────────

  describe("POST /api/v1/stands/:standId/occupants", () => {
    it("returns 201 for foot_soldier", async () => {
      vi.mocked(svc.addOccupant).mockResolvedValueOnce(mockOccupancy);

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "foot_soldier" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/stands/stand-1/occupants",
        headers: { authorization: `Bearer ${token}` },
        payload: { residentId: "d3b07384-d9a0-4c6a-a1d5-0b8a4f5e6c7d", relationship: "primary_occupant" },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ id: "occ-1", relationship: "primary_occupant" });
    });

    it("returns 409 when stand already has a primary occupant", async () => {
      const { OccupancyError } = await import("../service.js");
      vi.mocked(svc.addOccupant).mockRejectedValueOnce(
        new OccupancyError("Stand already has an active primary occupant", 409),
      );

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "foot_soldier" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/stands/stand-1/occupants",
        headers: { authorization: `Bearer ${token}` },
        payload: { residentId: "d3b07384-d9a0-4c6a-a1d5-0b8a4f5e6c7d", relationship: "primary_occupant" },
      });

      expect(res.statusCode).toBe(409);
    });

    it("returns 404 when stand not found", async () => {
      const { OccupancyError } = await import("../service.js");
      vi.mocked(svc.addOccupant).mockRejectedValueOnce(
        new OccupancyError("Stand not found", 404),
      );

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "foot_soldier" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/stands/nonexistent/occupants",
        headers: { authorization: `Bearer ${token}` },
        payload: { residentId: "d3b07384-d9a0-4c6a-a1d5-0b8a4f5e6c7d", relationship: "primary_occupant" },
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns 403 for resident role", async () => {
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "resident" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/stands/stand-1/occupants",
        headers: { authorization: `Bearer ${token}` },
        payload: { residentId: "d3b07384-d9a0-4c6a-a1d5-0b8a4f5e6c7d", relationship: "primary_occupant" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 400 for invalid relationship", async () => {
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "foot_soldier" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/stands/stand-1/occupants",
        headers: { authorization: `Bearer ${token}` },
        payload: { residentId: "d3b07384-d9a0-4c6a-a1d5-0b8a4f5e6c7d", relationship: "owner" },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── GET /stands/:standId/occupants ─────────────────────────────────────────

  describe("GET /api/v1/stands/:standId/occupants", () => {
    it("returns 200 with occupants list", async () => {
      vi.mocked(svc.listStandOccupants).mockResolvedValueOnce([mockOccupancy]);

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "foot_soldier" });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/stands/stand-1/occupants",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ occupants: unknown[] }>();
      expect(body.occupants).toHaveLength(1);
    });

    it("returns 404 when stand not found", async () => {
      const { OccupancyError } = await import("../service.js");
      vi.mocked(svc.listStandOccupants).mockRejectedValueOnce(
        new OccupancyError("Stand not found", 404),
      );

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "foot_soldier" });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/stands/nonexistent/occupants",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── GET /residents/:residentId/stands ──────────────────────────────────────

  describe("GET /api/v1/residents/:residentId/stands", () => {
    it("returns 200 with stands list", async () => {
      vi.mocked(svc.listResidentStands).mockResolvedValueOnce([mockStandWithOccupancy]);

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "foot_soldier" });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/residents/resident-1/stands",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ stands: unknown[] }>();
      expect(body.stands).toHaveLength(1);
    });

    it("returns 404 when resident not found", async () => {
      const { OccupancyError } = await import("../service.js");
      vi.mocked(svc.listResidentStands).mockRejectedValueOnce(
        new OccupancyError("Resident not found", 404),
      );

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "foot_soldier" });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/residents/nonexistent/stands",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── PATCH /stand-occupancies/:id ───────────────────────────────────────────

  describe("PATCH /api/v1/stand-occupancies/:id", () => {
    it("returns 200 on update by council_secretary", async () => {
      vi.mocked(svc.updateOccupancy).mockResolvedValueOnce({ ...mockOccupancy, endedAt: "2026-06-01T00:00:00.000Z" });

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "PATCH",
        url: "/api/v1/stand-occupancies/occ-1",
        headers: { authorization: `Bearer ${token}` },
        payload: { endedAt: "2026-06-01T00:00:00.000Z" },
      });

      expect(res.statusCode).toBe(200);
    });

    it("returns 403 for foot_soldier", async () => {
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "foot_soldier" });
      const res = await app.inject({
        method: "PATCH",
        url: "/api/v1/stand-occupancies/occ-1",
        headers: { authorization: `Bearer ${token}` },
        payload: { endedAt: "2026-06-01T00:00:00.000Z" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 404 when occupancy not found", async () => {
      vi.mocked(svc.updateOccupancy).mockResolvedValueOnce(null);

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "PATCH",
        url: "/api/v1/stand-occupancies/nonexistent",
        headers: { authorization: `Bearer ${token}` },
        payload: { endedAt: "2026-06-01T00:00:00.000Z" },
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
