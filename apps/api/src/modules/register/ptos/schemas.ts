import { z } from "zod";

export const verifyPTOSchema = z.object({
  signedPayloadJson: z.record(z.unknown()),
  signatureBase64: z.string(),
});

export type VerifyPTORequest = z.infer<typeof verifyPTOSchema>;
