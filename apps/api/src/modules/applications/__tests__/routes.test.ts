import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../../index.js";
import type { FastifyInstance } from "fastify";
import type { ApplicationResponse } from "../types.js";

const mockApp: ApplicationResponse = {
  id: "app-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  applicantResidentId: "a0000000-0000-0000-0000-000000000001",
  status: "submitted",
  isDraft: false,
  wizardStep: null,
  applicationType: "new_stand",
  requestedLocationDescription: "Near the river, north of village",
  requestedSizeSquareMetres: null,
  reason: "Currently sharing with parents",
  provinceId: null,
  authorityId: null,
  authorityType: null,
  villageId: null,
  villageName: null,
  applicantFirstName: null,
  applicantLastName: null,
  applicantPhone: null,
  householdSize: 4,
  landPurpose: null,
  hasExistingLand: null,
  existingLandDescription: null,
  hasPreviousApplication: null,
  previousApplicationRef: null,
  hasDispute: null,
  disputeDescription: null,
  gpsLatitude: null,
  gpsLongitude: null,
  siteDescription: null,
  consentTerms: null,
  consentPopia: null,
  submittedAt: "2026-01-01T00:00:00.000Z",
  reviewedAt: null,
  decidedAt: null,
  decisionNotes: null,
  decidedByUserId: null,
  allocatedStandId: null,
  ptoId: null,
  potentialDuplicateOf: null,
  documents: [],
};

vi.mock("../service.js", () => ({
  submitApplication: vi.fn(),
  listApplications: vi.fn(),
  getApplication: vi.fn(),
  updateApplicationStatus: vi.fn(),
  withdrawApplication: vi.fn(),
  ApplicationError: class ApplicationError extends Error {
    statusCode: number;
    constructor(message: string, statusCode = 400) {
      super(message);
      this.statusCode = statusCode;
      this.name = "ApplicationError";
    }
  },
}));

import * as svc from "../service.js";
import { ApplicationError } from "../service.js";

const submitPayload = {
  applicantResidentId: "a0000000-0000-0000-0000-000000000001",
  applicationType: "new_stand",
  requestedLocationDescription: "Near the river, north of village",
  householdSize: 4,
  reason: "Currently sharing with parents",
};

describe("application routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env["JWT_SECRET"] = "test-secret-at-least-32-characters-long!!";
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  // ── POST /applications ───────────────────────────────────────────────────

  describe("POST /api/v1/applications", () => {
    it("returns 201 for any authenticated user", async () => {
      vi.mocked(svc.submitApplication).mockResolvedValueOnce(mockApp);

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "foot_soldier" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/applications",
        headers: { authorization: `Bearer ${token}` },
        payload: submitPayload,
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ id: "app-1", status: "submitted" });
    });

    it("returns 401 without token", async () => {
      const res = await app.inject({ method: "POST", url: "/api/v1/applications", payload: submitPayload });
      expect(res.statusCode).toBe(401);
    });

    it("returns 400 for missing required fields", async () => {
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "foot_soldier" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/applications",
        headers: { authorization: `Bearer ${token}` },
        payload: { applicationType: "new_stand" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 400 for invalid applicationType", async () => {
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "foot_soldier" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/applications",
        headers: { authorization: `Bearer ${token}` },
        payload: { ...submitPayload, applicationType: "not_valid" },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── GET /applications ────────────────────────────────────────────────────

  describe("GET /api/v1/applications", () => {
    it("returns 200 list for council_secretary", async () => {
      vi.mocked(svc.listApplications).mockResolvedValueOnce({
        applications: [mockApp],
        total: 1,
        page: 1,
        pageSize: 20,
      });

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/applications",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ total: 1, applications: [{ id: "app-1" }] });
    });

    it("returns 403 for foot_soldier", async () => {
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "foot_soldier" });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/applications",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 401 without token", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/applications" });
      expect(res.statusCode).toBe(401);
    });
  });

  // ── GET /applications/:id ────────────────────────────────────────────────

  describe("GET /api/v1/applications/:id", () => {
    it("returns 200 with application detail", async () => {
      vi.mocked(svc.getApplication).mockResolvedValueOnce(mockApp);

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/applications/app-1",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ id: "app-1" });
    });

    it("returns 404 when not found", async () => {
      vi.mocked(svc.getApplication).mockResolvedValueOnce(null);

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/applications/missing",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── PATCH /applications/:id/status ───────────────────────────────────────

  describe("PATCH /api/v1/applications/:id/status", () => {
    it("returns 200 for council_secretary", async () => {
      const updated: ApplicationResponse = { ...mockApp, status: "under_review", reviewedAt: "2026-01-02T00:00:00.000Z" };
      vi.mocked(svc.updateApplicationStatus).mockResolvedValueOnce(updated);

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "PATCH",
        url: "/api/v1/applications/app-1/status",
        headers: { authorization: `Bearer ${token}` },
        payload: { status: "under_review" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: "under_review" });
    });

    it("returns 403 for foot_soldier", async () => {
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "foot_soldier" });
      const res = await app.inject({
        method: "PATCH",
        url: "/api/v1/applications/app-1/status",
        headers: { authorization: `Bearer ${token}` },
        payload: { status: "under_review" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 409 for invalid transition", async () => {
      vi.mocked(svc.updateApplicationStatus).mockRejectedValueOnce(
        new ApplicationError("Cannot transition from 'approved' to 'rejected'", 409),
      );

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "PATCH",
        url: "/api/v1/applications/app-1/status",
        headers: { authorization: `Bearer ${token}` },
        payload: { status: "rejected" },
      });
      expect(res.statusCode).toBe(409);
    });

    it("returns 404 when application not found", async () => {
      vi.mocked(svc.updateApplicationStatus).mockRejectedValueOnce(
        new ApplicationError("Application not found", 404),
      );

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "PATCH",
        url: "/api/v1/applications/missing/status",
        headers: { authorization: `Bearer ${token}` },
        payload: { status: "under_review" },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── POST /applications/:id/withdraw ──────────────────────────────────────

  describe("POST /api/v1/applications/:id/withdraw", () => {
    it("returns 200 for authenticated user", async () => {
      const withdrawn: ApplicationResponse = { ...mockApp, status: "withdrawn" };
      vi.mocked(svc.withdrawApplication).mockResolvedValueOnce(withdrawn);

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "foot_soldier" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/applications/app-1/withdraw",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: "withdrawn" });
    });

    it("returns 409 when already decided", async () => {
      vi.mocked(svc.withdrawApplication).mockRejectedValueOnce(
        new ApplicationError("Cannot withdraw an application in 'approved' status", 409),
      );

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "foot_soldier" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/applications/app-1/withdraw",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(409);
    });
  });
});
