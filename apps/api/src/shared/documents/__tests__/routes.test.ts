import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../../index.js";
import type { FastifyInstance } from "fastify";
import type { Role } from "@prisma/client";

vi.mock("../service.js", () => ({
  uploadDocument: vi.fn(),
  getDocumentWithUrl: vi.fn(),
  DocumentNotFoundError: class DocumentNotFoundError extends Error {
    constructor(id: string) {
      super(`Document ${id} not found`);
      this.name = "DocumentNotFoundError";
    }
  },
}));

vi.mock("../signing.js", () => ({
  getTenantPublicKey: vi.fn(),
  signDocument: vi.fn(),
  verifySignature: vi.fn(),
}));

import * as svc from "../service.js";
import * as signing from "../signing.js";

describe("document routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env["JWT_SECRET"] = "test-secret-at-least-32-characters-long!!";
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  function makeToken(role: Role = "council_secretary", tenantSlug = "ndebele"): string {
    return app.jwt.sign({ userId: "user-1", tenantSlug, role });
  }

  // ── POST /api/v1/documents ─────────────────────────────────────────────────

  describe("POST /api/v1/documents", () => {
    it("returns 401 with no token", async () => {
      const res = await app.inject({ method: "POST", url: "/api/v1/documents" });
      expect(res.statusCode).toBe(401);
    });

    it("returns 400 when no file part is sent", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/documents",
        headers: {
          authorization: `Bearer ${makeToken()}`,
          "content-type": "multipart/form-data; boundary=----boundary",
        },
        payload: "------boundary--\r\n",
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 201 with document metadata on success", async () => {
      const doc = {
        id: "doc-1",
        createdAt: new Date().toISOString(),
        type: "pto",
        s3Key: "ndebele/pto/doc-1.pdf",
        contentHash: "abc123",
        signature: null,
        signedByTenant: false,
        createdByUserId: "user-1",
      };
      vi.mocked(svc.uploadDocument).mockResolvedValueOnce(doc as never);

      const boundary = "----testboundary";
      const body = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="type"',
        "",
        "pto",
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="test.pdf"',
        "Content-Type: application/pdf",
        "",
        "PDF-CONTENT",
        `--${boundary}--`,
      ].join("\r\n");

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/documents",
        headers: {
          authorization: `Bearer ${makeToken()}`,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });

      expect(res.statusCode).toBe(201);
      expect(res.json<{ id: string }>().id).toBe("doc-1");
    });

    it("returns 400 for invalid document type", async () => {
      const boundary = "----testboundary2";
      const body = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="type"',
        "",
        "invalid_type",
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="test.pdf"',
        "Content-Type: application/pdf",
        "",
        "PDF-CONTENT",
        `--${boundary}--`,
      ].join("\r\n");

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/documents",
        headers: {
          authorization: `Bearer ${makeToken()}`,
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // ── GET /api/v1/documents/:id ──────────────────────────────────────────────

  describe("GET /api/v1/documents/:id", () => {
    it("returns 401 with no token", async () => {
      const res = await app.inject({ method: "GET", url: "/api/v1/documents/doc-1" });
      expect(res.statusCode).toBe(401);
    });

    it("returns 200 with document and presigned url", async () => {
      const doc = { id: "doc-1", type: "pto", s3Key: "ndebele/pto/doc-1.pdf" };
      vi.mocked(svc.getDocumentWithUrl).mockResolvedValueOnce({
        document: doc as never,
        url: "https://s3.example.com/presigned",
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/documents/doc-1",
        headers: { authorization: `Bearer ${makeToken()}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ url: string }>();
      expect(body.url).toBe("https://s3.example.com/presigned");
    });

    it("returns 404 when document not found", async () => {
      const { DocumentNotFoundError } = await import("../service.js");
      vi.mocked(svc.getDocumentWithUrl).mockRejectedValueOnce(
        new DocumentNotFoundError("missing-id"),
      );

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/documents/missing-id",
        headers: { authorization: `Bearer ${makeToken()}` },
      });

      expect(res.statusCode).toBe(404);
      const body = res.json<{ status: number }>();
      expect(body.status).toBe(404);
    });
  });

  // ── GET /api/v1/tenants/:slug/pto-pubkey ──────────────────────────────────

  describe("GET /api/v1/tenants/:slug/pto-pubkey", () => {
    it("returns 200 with public key — no auth required", async () => {
      vi.mocked(signing.getTenantPublicKey).mockReturnValueOnce("base64pubkey==");

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/tenants/ndebele/pto-pubkey",
      });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ algorithm: string; publicKey: string }>();
      expect(body.algorithm).toBe("Ed25519");
      expect(body.publicKey).toBe("base64pubkey==");
    });

    it("returns 404 when tenant signing key is not configured", async () => {
      vi.mocked(signing.getTenantPublicKey).mockImplementationOnce(() => {
        throw new Error("TENANT_SIGNING_KEY_PUBLIC_UNKNOWN is not set");
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/tenants/unknown/pto-pubkey",
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
