import type { FastifyInstance } from "fastify";
import { requireAuth } from "../identity/index.js";
import { documentParamsSchema, tenantPubkeyParamsSchema, uploadDocumentSchema } from "./schemas.js";
import { DocumentNotFoundError, getDocumentWithUrl, uploadDocument } from "./service.js";
import { getTenantPublicKey } from "./signing.js";
import type { DocumentType } from "./types.js";

export async function documentRoutes(fastify: FastifyInstance): Promise<void> {
  // ── Upload a document ──────────────────────────────────────────────────────
  fastify.post(
    "/documents",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parts = request.parts();
      let fileBuffer: Buffer | undefined;
      let filename = "upload";
      let mimeType = "application/octet-stream";
      let typeField: string | undefined;

      for await (const part of parts) {
        if (part.type === "file") {
          fileBuffer = await part.toBuffer();
          filename = part.filename;
          mimeType = part.mimetype;
        } else if (part.fieldname === "type") {
          typeField = String(part.value);
        }
      }

      if (!fileBuffer || fileBuffer.length === 0) {
        return reply.code(400).send({
          type: "about:blank",
          title: "Bad Request",
          status: 400,
          detail: "A file part is required",
        });
      }

      const parsed = uploadDocumentSchema.safeParse({ type: typeField });
      if (!parsed.success) {
        return reply.code(400).send({
          type: "about:blank",
          title: "Bad Request",
          status: 400,
          detail: "Invalid document type",
          errors: parsed.error.errors,
        });
      }

      const document = await uploadDocument(
        request.tenantContext,
        request.jwtPayload.userId,
        fileBuffer,
        filename,
        mimeType,
        parsed.data.type as DocumentType,
      );

      return reply.code(201).send(document);
    },
  );

  // ── Get document + presigned URL ───────────────────────────────────────────
  fastify.get(
    "/documents/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const parsed = documentParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        return reply.code(400).send({
          type: "about:blank",
          title: "Bad Request",
          status: 400,
          detail: "Invalid document id",
        });
      }

      try {
        const result = await getDocumentWithUrl(request.tenantContext, parsed.data.id);
        return reply.send(result);
      } catch (err) {
        if (err instanceof DocumentNotFoundError) {
          return reply.code(404).send({
            type: "about:blank",
            title: "Not Found",
            status: 404,
            detail: err.message,
          });
        }
        throw err;
      }
    },
  );

  // ── Tenant PTO public key (no auth — anyone can verify a PTO) ─────────────
  fastify.get("/tenants/:slug/pto-pubkey", async (request, reply) => {
    const parsed = tenantPubkeyParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({
        type: "about:blank",
        title: "Bad Request",
        status: 400,
        detail: "Invalid tenant slug",
      });
    }

    try {
      const publicKey = getTenantPublicKey(parsed.data.slug);
      return reply.send({ algorithm: "Ed25519", publicKey });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return reply.code(404).send({
        type: "about:blank",
        title: "Not Found",
        status: 404,
        detail: message,
      });
    }
  });
}
