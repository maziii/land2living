import type { ProviderVerificationStatus } from "./schemas.js";
import type { ServiceCategory } from "../services/take-rate-config.js";

export interface ProviderResponse {
  id: string;
  createdAt: string;
  updatedAt: string;
  businessName: string;
  cipcNumber: string | null;
  vatNumber: string | null;
  primaryContactUserId: string;
  categories: ServiceCategory[];
  geographicCoverage: string[];
  verificationStatus: ProviderVerificationStatus;
  createdByUserId: string;
}

export interface ProviderListResponse {
  providers: ProviderResponse[];
  total: number;
  page: number;
  pageSize: number;
}
