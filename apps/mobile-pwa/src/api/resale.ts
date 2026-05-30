import { apiFetch } from "./client.js";

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
  standAddress: string;
  standVillage: string;
  standAreaSqm: number | null;
  standType: string | null;
  standReference: string | null;
}

export interface OfferSummary {
  id: string;
  createdAt: string;
  listingId: string;
  buyerResidentId: string;
  offerAmountZar: number;
  status: "submitted" | "accepted" | "rejected" | "withdrawn";
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

export async function fetchListings(params: {
  page?: number;
  pageSize?: number;
  status?: ListingStatus;
  listingType?: ListingType;
}): Promise<ListingListResponse> {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params.status) qs.set("status", params.status);
  if (params.listingType) qs.set("listingType", params.listingType);
  return apiFetch<ListingListResponse>(`/resale-listings?${qs.toString()}`);
}

export async function fetchListing(id: string): Promise<ListingDetail> {
  return apiFetch<ListingDetail>(`/resale-listings/${id}`);
}

export async function createListing(data: {
  sellerResidentId: string;
  standId: string;
  ptoId: string;
  listingType: ListingType;
  askingPriceZar: number;
  description: string;
  negotiable: boolean;
}): Promise<ListingSummary> {
  return apiFetch<ListingSummary>("/resale-listings", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function submitListing(id: string): Promise<ListingSummary> {
  return apiFetch<ListingSummary>(`/resale-listings/${id}/submit`, { method: "POST" });
}

export async function submitOffer(
  listingId: string,
  data: { buyerResidentId: string; offerAmountZar: number },
): Promise<OfferSummary> {
  return apiFetch<OfferSummary>(`/resale-listings/${listingId}/offers`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}
