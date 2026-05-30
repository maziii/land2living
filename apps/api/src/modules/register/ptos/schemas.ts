import { z } from "zod";

export const verifyPTOSchema = z.object({
  signedPayloadJson: z.record(z.unknown()),
  signatureBase64: z.string(),
});

export const listPTOsQuerySchema = z.object({
  page:       z.coerce.number().int().min(1).default(1),
  pageSize:   z.coerce.number().int().min(1).max(100).default(20),
  search:     z.string().min(1).optional(),
  status:     z.enum(["active", "superseded", "all"]).default("all"),
  residentId: z.string().uuid().optional(),
  standId:    z.string().uuid().optional(),
  village:    z.string().optional(),
});

export const revokePTOSchema = z.object({
  reason: z.string().min(5).max(500),
});

export type VerifyPTORequest  = z.infer<typeof verifyPTOSchema>;
export type ListPTOsQuery     = z.infer<typeof listPTOsQuerySchema>;
export type RevokePTORequest  = z.infer<typeof revokePTOSchema>;
