import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../../../index.js";
import type { FastifyInstance } from "fastify";

// Valid SA ID: 8001015009087 (1980-01-01, male, SA citizen, Luhn-valid)
const VALID_SA_ID = "8001015009087";

const mockResident = {
  id: "resident-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  idNumber: "*************",
  firstName: "Themba",
  lastName: "Dlamini",
  otherNames: null,
  dateOfBirth: null,
  gender: "M",
  phoneNumber: "+27821234567",
  whatsappNumber: null,
  languagePreference: "nde",
  consentDataCapture: true,
  consentMarketing: false,
  notes: null,
  capturedByUserId: "user-1",
  verificationStatus: "unverified",
};

vi.mock("../service.js", () => ({
  createResident: vi.fn(),
  listResidents: vi.fn(),
  getResident: vi.fn(),
  updateResident: vi.fn(),
  deleteResident: vi.fn(),
}));

import * as svc from "../service.js";

const createPayload = {
  idNumber: VALID_SA_ID,
  firstName: "Themba",
  lastName: "Dlamini",
  phoneNumber: "+27821234567",
  languagePreference: "nde",
  consentDataCapture: true,
};

describe("resident routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env["JWT_SECRET"] = "test-secret-at-least-32-characters-long!!";
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── POST /residents ──────────────────────────────────────────────────────

  describe("POST /api/v1/residents", () => {
    it("returns 201 and the created resident for foot_soldier", async () => {
      vi.mocked(svc.createResident).mockResolvedValueOnce(mockResident);

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "foot_soldier" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/residents",
        headers: { authorization: `Bearer ${token}` },
        payload: createPayload,
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ id: "resident-1", firstName: "Themba" });
    });

    it("returns 201 for council_secretary", async () => {
      vi.mocked(svc.createResident).mockResolvedValueOnce(mockResident);

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/residents",
        headers: { authorization: `Bearer ${token}` },
        payload: createPayload,
      });

      expect(res.statusCode).toBe(201);
    });

    it("returns 403 for resident role", async () => {
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "resident" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/residents",
        headers: { authorization: `Bearer ${token}` },
        payload: createPayload,
      });

      expect(res.statusCode).toBe(403);
    });

    it("returns 401 with no auth", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/residents",
        payload: createPayload,
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 400 for invalid SA ID (bad Luhn)", async () => {
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "foot_soldier" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/residents",
        headers: { authorization: `Bearer ${token}` },
        payload: { ...createPayload, idNumber: "1234567890123" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 for invalid SA ID (not 13 digits)", async () => {
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "foot_soldier" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/residents",
        headers: { authorization: `Bearer ${token}` },
        payload: { ...createPayload, idNumber: "123456" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 for invalid E.164 phone", async () => {
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "foot_soldier" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/residents",
        headers: { authorization: `Bearer ${token}` },
        payload: { ...createPayload, phoneNumber: "0821234567" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 for missing required fields", async () => {
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "foot_soldier" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/residents",
        headers: { authorization: `Bearer ${token}` },
        payload: { firstName: "Themba" },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // ── GET /residents ───────────────────────────────────────────────────────

  describe("GET /api/v1/residents", () => {
    it("returns 200 with paginated list", async () => {
      vi.mocked(svc.listResidents).mockResolvedValueOnce({
        residents: [mockResident],
        total: 1,
        page: 1,
        pageSize: 20,
      });

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/residents",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ residents: unknown[]; total: number }>();
      expect(body.total).toBe(1);
      expect(body.residents).toHaveLength(1);
    });

    it("passes search and verificationStatus filters", async () => {
      vi.mocked(svc.listResidents).mockResolvedValueOnce({
        residents: [],
        total: 0,
        page: 1,
        pageSize: 20,
      });

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "foot_soldier" });
      await app.inject({
        method: "GET",
        url: "/api/v1/residents?search=Themba&verificationStatus=unverified",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(svc.listResidents).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ search: "Themba", verificationStatus: "unverified" }),
        expect.anything(),
      );
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/residents" });
      expect(res.statusCode).toBe(401);
    });

    it("returns 400 for invalid query params", async () => {
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "foot_soldier" });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/residents?pageSize=999",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── GET /residents/:id ───────────────────────────────────────────────────

  describe("GET /api/v1/residents/:id", () => {
    it("returns 200 with masked ID by default", async () => {
      vi.mocked(svc.getResident).mockResolvedValueOnce(mockResident);

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "foot_soldier" });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/residents/resident-1",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(svc.getResident).toHaveBeenCalledWith(
        expect.anything(),
        "resident-1",
        false,
        expect.anything(),
      );
    });

    it("returns 200 with unmasked ID for council_secretary with ?unmask_id=true", async () => {
      const unmaskedResident = { ...mockResident, idNumber: VALID_SA_ID };
      vi.mocked(svc.getResident).mockResolvedValueOnce(unmaskedResident);

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/residents/resident-1?unmask_id=true",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(svc.getResident).toHaveBeenCalledWith(
        expect.anything(),
        "resident-1",
        true,
        expect.anything(),
      );
    });

    it("returns 403 when foot_soldier attempts unmask", async () => {
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "foot_soldier" });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/residents/resident-1?unmask_id=true",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it("returns 404 when resident does not exist", async () => {
      vi.mocked(svc.getResident).mockResolvedValueOnce(null);

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/residents/nonexistent",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/residents/resident-1" });
      expect(res.statusCode).toBe(401);
    });
  });

  // ── PATCH /residents/:id ─────────────────────────────────────────────────

  describe("PATCH /api/v1/residents/:id", () => {
    it("returns 200 with updated resident for council_secretary", async () => {
      const updated = { ...mockResident, firstName: "Sipho" };
      vi.mocked(svc.updateResident).mockResolvedValueOnce(updated);

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "PATCH",
        url: "/api/v1/residents/resident-1",
        headers: { authorization: `Bearer ${token}` },
        payload: { firstName: "Sipho" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ firstName: "Sipho" });
    });

    it("returns 403 for foot_soldier", async () => {
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "foot_soldier" });
      const res = await app.inject({
        method: "PATCH",
        url: "/api/v1/residents/resident-1",
        headers: { authorization: `Bearer ${token}` },
        payload: { firstName: "Sipho" },
      });

      expect(res.statusCode).toBe(403);
    });

    it("returns 404 when resident does not exist", async () => {
      vi.mocked(svc.updateResident).mockResolvedValueOnce(null);

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "PATCH",
        url: "/api/v1/residents/nonexistent",
        headers: { authorization: `Bearer ${token}` },
        payload: { firstName: "Sipho" },
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns 400 for invalid phone in update", async () => {
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "PATCH",
        url: "/api/v1/residents/resident-1",
        headers: { authorization: `Bearer ${token}` },
        payload: { phoneNumber: "not-a-phone" },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // ── DELETE /residents/:id ────────────────────────────────────────────────

  describe("DELETE /api/v1/residents/:id", () => {
    it("returns 200 on successful soft delete by council_secretary", async () => {
      vi.mocked(svc.deleteResident).mockResolvedValueOnce(true);

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "DELETE",
        url: "/api/v1/residents/resident-1",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ success: true });
    });

    it("returns 403 for foot_soldier", async () => {
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "foot_soldier" });
      const res = await app.inject({
        method: "DELETE",
        url: "/api/v1/residents/resident-1",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it("returns 404 when resident does not exist", async () => {
      vi.mocked(svc.deleteResident).mockResolvedValueOnce(false);

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "DELETE",
        url: "/api/v1/residents/nonexistent",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns 401 without auth", async () => {
      const res = await app.inject({ method: "DELETE", url: "/api/v1/residents/resident-1" });
      expect(res.statusCode).toBe(401);
    });
  });
});
