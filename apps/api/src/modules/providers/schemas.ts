import { z } from "zod";
import { SERVICE_CATEGORIES } from "../services/take-rate-config.js";

export const PROVIDER_VERIFICATION_STATUSES = [
  "unverified",
  "documents_submitted",
  "verified",
  "suspended",
] as const;

export type ProviderVerificationStatus = (typeof PROVIDER_VERIFICATION_STATUSES)[number];

export const registerProviderSchema = z.object({
  businessName: z.string().min(2).max(200),
  cipcNumber: z.string().max(20).optional(),
  vatNumber: z.string().max(20).optional(),
  categories: z.array(z.enum(SERVICE_CATEGORIES)).min(1),
  geographicCoverage: z.array(z.string().min(1)).min(1),
  bankDetails: z.object({
    accountHolder: z.string(),
    bankName: z.string(),
    accountNumber: z.string(),
    branchCode: z.string(),
  }).optional(),
});

export const updateVerificationSchema = z.object({
  status: z.enum(PROVIDER_VERIFICATION_STATUSES),
});

export const listProvidersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  category: z.enum(SERVICE_CATEGORIES).optional(),
  tenantSlug: z.string().optional(),
  verificationStatus: z.enum(PROVIDER_VERIFICATION_STATUSES).optional(),
});

export type RegisterProviderRequest = z.infer<typeof registerProviderSchema>;
export type UpdateVerificationRequest = z.infer<typeof updateVerificationSchema>;
export type ListProvidersQuery = z.infer<typeof listProvidersQuerySchema>;
