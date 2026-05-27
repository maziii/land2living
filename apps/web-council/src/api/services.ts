export type BookingStatus =
  | "quote_requested"
  | "quoted"
  | "accepted"
  | "in_progress"
  | "completed"
  | "disputed"
  | "cancelled";

export interface BookingSummary {
  id: string;
  createdAt: string;
  updatedAt: string;
  tenantSlug: string;
  customerResidentId: string;
  providerId: string;
  category: string;
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
  bookings: BookingSummary[];
  total: number;
  page: number;
  pageSize: number;
}

type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>;

export async function fetchBookings(
  apiFetch: ApiFetch,
  params: { page?: number; pageSize?: number; status?: BookingStatus; providerId?: string },
): Promise<BookingListResponse> {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params.status) qs.set("status", params.status);
  if (params.providerId) qs.set("providerId", params.providerId);
  const res = await apiFetch(`/api/v1/services/bookings?${qs.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<BookingListResponse>;
}

export async function fetchBooking(apiFetch: ApiFetch, id: string): Promise<BookingSummary> {
  const res = await apiFetch(`/api/v1/services/bookings/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<BookingSummary>;
}
