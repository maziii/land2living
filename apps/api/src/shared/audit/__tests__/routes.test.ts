import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../../index.js";
import type { FastifyInstance } from "fastify";
import type { Role } from "@prisma/client";

vi.mock("../service.js", () => ({
  getAuditEvents: vi.fn(),
  recordAuditEvent: vi.fn(),
  recordPiiAccess: vi.fn(),
}));

import * as auditSvc from "../service.js";

describe("audit routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env["JWT_SECRET"] = "test-secret-at-least-32-characters-long!!";
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  function makeToken(role: Role, tenantSlug = "ndebele"): string {
    return app.jwt.sign({ userId: "user-1", tenantSlug, role });
  }

  describe("GET /api/v1/audit-events", () => {
    it("returns 401 when no auth token provided", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/audit-events" });
      expect(res.statusCode).toBe(401);
    });

    it("returns 403 for resident role", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/audit-events",
        headers: { authorization: `Bearer ${makeToken("resident")}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 403 for council_member role", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/audit-events",
        headers: { authorization: `Bearer ${makeToken("council_member")}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 200 for council_secretary role", async () => {
      vi.mocked(auditSvc.getAuditEvents).mockResolvedValueOnce({
        events: [],
        total: 0,
        page: 1,
        pageSize: 50,
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/audit-events",
        headers: { authorization: `Bearer ${makeToken("council_secretary")}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ total: number; page: number }>();
      expect(body.total).toBe(0);
      expect(body.page).toBe(1);
    });

    it("returns 200 for founder role", async () => {
      vi.mocked(auditSvc.getAuditEvents).mockResolvedValueOnce({
        events: [],
        total: 0,
        page: 1,
        pageSize: 50,
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/audit-events",
        headers: { authorization: `Bearer ${makeToken("founder")}` },
      });

      expect(res.statusCode).toBe(200);
    });

    it("returns 400 for invalid fromDate query parameter", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/audit-events?fromDate=not-a-date",
        headers: { authorization: `Bearer ${makeToken("council_secretary")}` },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json<{ status: number; detail: string }>();
      expect(body.status).toBe(400);
    });

    it("returns 400 for pageSize exceeding 100", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/audit-events?pageSize=200",
        headers: { authorization: `Bearer ${makeToken("council_secretary")}` },
      });

      expect(res.statusCode).toBe(400);
    });

    it("passes parsed filter params to getAuditEvents", async () => {
      vi.mocked(auditSvc.getAuditEvents).mockResolvedValueOnce({
        events: [],
        total: 0,
        page: 2,
        pageSize: 10,
      });

      const token = makeToken("council_secretary");
      await app.inject({
        method: "GET",
        url: "/api/v1/audit-events?eventType=user.login&entityType=user&page=2&pageSize=10",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(auditSvc.getAuditEvents).toHaveBeenCalledWith(
        expect.objectContaining({ slug: "ndebele" }),
        expect.objectContaining({ eventType: "user.login", entityType: "user", page: 2, pageSize: 10 }),
      );
    });
  });
});
