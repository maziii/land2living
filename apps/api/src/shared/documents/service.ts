import { createHash, randomUUID } from "node:crypto";
import type { Document } from "../../generated/tenant-client/index.js";
import { getPrismaClient } from "../database/index.js";
import type { TenantContext } from "../database/tenant-context.js";
import { getPresignedUrl, uploadToS3 } from "./s3.js";
import type { DocumentType } from "./types.js";

export type { Document };

export class DocumentNotFoundError extends Error {
  constructor(id: string) {
    super(`Document ${id} not found`);
    this.name = "DocumentNotFoundError";
  }
}

export async function uploadDocument(
  ctx: TenantContext,
  createdByUserId: string,
  fileBuffer: Buffer,
  filename: string,
  mimeType: string,
  type: DocumentType,
): Promise<Document> {
  const id = randomUUID();
  const contentHash = createHash("sha256").update(fileBuffer).digest("hex");
  const ext = filename.includes(".") ? filename.split(".").at(-1) ?? "bin" : "bin";
  const s3Key = `${ctx.slug}/${type}/${id}.${ext}`;

  await uploadToS3(s3Key, fileBuffer, mimeType);

  return getPrismaClient(ctx).document.create({
    data: { id, type, s3Key, contentHash, createdByUserId },
  });
}

export async function getDocumentWithUrl(
  ctx: TenantContext,
  id: string,
): Promise<{ document: Document; url: string }> {
  const document = await getPrismaClient(ctx).document.findUnique({ where: { id } });
  if (!document) throw new DocumentNotFoundError(id);
  const url = await getPresignedUrl(document.s3Key);
  return { document, url };
}
