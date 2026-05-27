import type { BookingStatus } from "./schemas.js";
import type { ServiceCategory } from "./take-rate-config.js";

export interface BookingResponse {
  id: string;
  createdAt: string;
  updatedAt: string;
  tenantSlug: string;
  customerResidentId: string;
  providerId: string;
  category: ServiceCategory;
  description: string;
  requestedDate: string | null;
  quoteAmountZar: number | null;
  takeRateBasisPoints: number | null;
  status: BookingStatus;
  escrowPaymentId: string | null;
  customerRating: number | null;
  providerRating: number | null;
  customerConfirmedAt: string | null;
  providerConfirmedAt: string | null;
}

export interface BookingListResponse {
  bookings: BookingResponse[];
  total: number;
  page: number;
  pageSize: number;
}
