export type ListingType = "built_property" | "vacant_stand";
export type ListingStatus =
  | "draft"
  | "pending_council_approval"
  | "live"
  | "under_offer"
  | "transfer_pending"
  | "transferred"
  | "withdrawn"
  | "expired";

export type OfferStatus = "submitted" | "accepted" | "rejected" | "withdrawn";

export interface ListingSummary {
  id: string;
  createdAt: string;
  updatedAt: string;
  sellerResidentId: string;
  standId: string;
  ptoId: string;
  listingType: ListingType;
  askingPriceZar: number;
  description: string;
  negotiable: boolean;
  status: ListingStatus;
  expiresAt: string;
  photos: string[];
}

export interface OfferSummary {
  id: string;
  createdAt: string;
  listingId: string;
  buyerResidentId: string;
  offerAmountZar: number;
  status: OfferStatus;
  decidedAt: string | null;
  notes: string | null;
}

export interface ListingDetail extends ListingSummary {
  offers: OfferSummary[];
}

export interface ListingListResponse {
  listings: ListingSummary[];
  total: number;
  page: number;
  pageSize: number;
}

type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>;

export async function fetchListings(
  apiFetch: ApiFetch,
  params: { page?: number; pageSize?: number; status?: ListingStatus },
): Promise<ListingListResponse> {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params.status) qs.set("status", params.status);
  const res = await apiFetch(`/api/v1/resale-listings?${qs.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<ListingListResponse>;
}

export async function fetchListing(apiFetch: ApiFetch, id: string): Promise<ListingDetail> {
  const res = await apiFetch(`/api/v1/resale-listings/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<ListingDetail>;
}

export async function approveListing(apiFetch: ApiFetch, id: string): Promise<ListingSummary> {
  const res = await apiFetch(`/api/v1/resale-listings/${id}/approve`, { method: "PATCH" });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(data.detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<ListingSummary>;
}

export async function rejectListing(apiFetch: ApiFetch, id: string): Promise<ListingSummary> {
  const res = await apiFetch(`/api/v1/resale-listings/${id}/reject`, { method: "PATCH" });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(data.detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<ListingSummary>;
}

export async function initiateTransfer(apiFetch: ApiFetch, id: string): Promise<ListingSummary> {
  const res = await apiFetch(`/api/v1/resale-listings/${id}/initiate-transfer`, { method: "POST" });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(data.detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<ListingSummary>;
}

export async function acceptOffer(apiFetch: ApiFetch, offerId: string): Promise<OfferSummary> {
  const res = await apiFetch(`/api/v1/offers/${offerId}/accept`, {
    method: "PATCH",
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(data.detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<OfferSummary>;
}

export async function rejectOffer(apiFetch: ApiFetch, offerId: string): Promise<OfferSummary> {
  const res = await apiFetch(`/api/v1/offers/${offerId}/reject`, {
    method: "PATCH",
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(data.detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<OfferSummary>;
}
