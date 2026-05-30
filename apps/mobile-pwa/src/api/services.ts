import { apiFetch } from "./client.js";

export const SERVICE_CATEGORIES = [
  "gardening", "cleaning", "security",
  "plumbing", "electrical", "repairs",
  "bricklaying", "fencing", "borehole",
  "architecture", "building",
] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  gardening:    "Gardening",
  cleaning:     "Cleaning",
  security:     "Security",
  plumbing:     "Plumbing",
  electrical:   "Electrical",
  repairs:      "Repairs",
  bricklaying:  "Bricklaying",
  fencing:      "Fencing",
  borehole:     "Borehole",
  architecture: "Architecture",
  building:     "Building",
};

export const CATEGORY_EMOJI: Record<ServiceCategory, string> = {
  gardening:    "🌿",
  cleaning:     "🧹",
  security:     "🔒",
  plumbing:     "🔧",
  electrical:   "⚡",
  repairs:      "🔨",
  bricklaying:  "🧱",
  fencing:      "🪵",
  borehole:     "💧",
  architecture: "📐",
  building:     "🏗️",
};

export type BookingStatus =
  | "quote_requested"
  | "quoted"
  | "accepted"
  | "in_progress"
  | "completed"
  | "disputed"
  | "cancelled";

export interface Provider {
  id: string;
  businessName: string;
  cipcNumber: string | null;
  vatNumber: string | null;
  categories: ServiceCategory[];
  geographicCoverage: string[];
  verificationStatus: "unverified" | "documents_submitted" | "verified" | "suspended";
}

export interface Booking {
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
  status: BookingStatus;
  customerRating: number | null;
  providerRating: number | null;
  disputeReason: string | null;
}

export interface BookingListResponse {
  bookings: Booking[];
  total: number;
}

export async function fetchProviders(): Promise<{ providers: Provider[]; total: number }> {
  const qs = new URLSearchParams({ pageSize: "100", verificationStatus: "verified" });
  return apiFetch<{ providers: Provider[]; total: number }>(`/providers?${qs.toString()}`);
}

export async function fetchProvider(id: string): Promise<Provider> {
  return apiFetch<Provider>(`/providers/${id}`);
}

export async function createBooking(data: {
  providerId: string;
  category: ServiceCategory;
  description: string;
  requestedDate?: string;
}): Promise<Booking> {
  return apiFetch<Booking>("/services/bookings", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function fetchMyBookings(customerResidentId: string): Promise<BookingListResponse> {
  const qs = new URLSearchParams({ customerResidentId, pageSize: "50" });
  return apiFetch<BookingListResponse>(`/services/bookings?${qs.toString()}`);
}

export async function acceptQuote(bookingId: string): Promise<Booking> {
  return apiFetch<Booking>(`/services/bookings/${bookingId}/accept-quote`, { method: "PATCH" });
}
