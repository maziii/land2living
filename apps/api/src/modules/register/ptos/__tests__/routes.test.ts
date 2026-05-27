import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../../../index.js";
import type { FastifyInstance } from "fastify";
import type { PTOResponse } from "../types.js";

const mockPTO: PTOResponse = {
  id: "pto-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  supersededAt: null,
  supersededByPtoId: null,
  applicationId: "a0000000-0000-0000-0000-000000000001",
  residentId: "b0000000-0000-0000-0000-000000000001",
  standId: "c0000000-0000-0000-0000-000000000001",
  issuedByUserId: "user-1",
  signedPayloadJson: { ptoVersion: "1", allocationDate: "2026-01-01" },
  signatureBase64: "abc123==",
  pdfDocumentId: null,
  verificationUrl: "https://l2l.app/verify/pto-1",
};

vi.mock("../service.js", () => ({
  issuePTO: vi.fn(),
  getPTO: vi.fn(),
  verifyPTO: vi.fn(),
  getTenantPublicKeyForTenant: vi.fn(),
  PTOError: class PTOError extends Error {
    statusCode: number;
    constructor(message: string, statusCode = 400) {
      super(message);
      this.statusCode = statusCode;
      this.name = "PTOError";
    }
  },
}));

import * as svc from "../service.js";
import { PTOError } from "../service.js";

describe("PTO routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env["JWT_SECRET"] = "test-secret-at-least-32-characters-long!!";
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /api/v1/applications/:id/issue-pto", () => {
    it("returns 201 for council_secretary", async () => {
      vi.mocked(svc.issuePTO).mockResolvedValueOnce(mockPTO);

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/applications/a0000000-0000-0000-0000-000000000001/issue-pto",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ id: "pto-1", verificationUrl: expect.stringContaining("verify") });
    });

    it("returns 403 for foot_soldier", async () => {
      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "foot_soldier" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/applications/a0000000-0000-0000-0000-000000000001/issue-pto",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 409 when already issued", async () => {
      vi.mocked(svc.issuePTO).mockRejectedValueOnce(
        new PTOError("A PTO has already been issued for this application", 409),
      );

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/applications/a0000000-0000-0000-0000-000000000001/issue-pto",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(409);
    });

    it("returns 404 when application not found", async () => {
      vi.mocked(svc.issuePTO).mockRejectedValueOnce(
        new PTOError("Application not found", 404),
      );

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_secretary" });
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/applications/missing/issue-pto",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("GET /api/v1/ptos/:id", () => {
    it("returns 200 for authed user", async () => {
      vi.mocked(svc.getPTO).mockResolvedValueOnce(mockPTO);

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_member" });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/ptos/pto-1",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ id: "pto-1" });
    });

    it("returns 404 when not found", async () => {
      vi.mocked(svc.getPTO).mockResolvedValueOnce(null);

      const token = app.jwt.sign({ userId: "user-1", tenantSlug: "ndebele", role: "council_member" });
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/ptos/missing",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("POST /api/v1/ptos/verify", () => {
    it("returns valid result without auth", async () => {
      vi.mocked(svc.verifyPTO).mockReturnValueOnce({ valid: true, ptoId: "app-1", residentId: "res-1" });

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/ptos/verify",
        payload: {
          signedPayloadJson: { ptoVersion: "1", allocationDate: "2026-01-01" },
          signatureBase64: "abc123==",
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ valid: true });
    });

    it("returns 400 for missing body", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/ptos/verify",
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
