import { z } from "zod";
import { DocumentType } from "./types.js";

const documentTypeValues = Object.values(DocumentType) as [string, ...string[]];

export const uploadDocumentSchema = z.object({
  type: z.enum(documentTypeValues),
});

export const documentParamsSchema = z.object({
  id: z.string().min(1),
});

export const tenantPubkeyParamsSchema = z.object({
  slug: z.string().min(1),
});

export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>;
