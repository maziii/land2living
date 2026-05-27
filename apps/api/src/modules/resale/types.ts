import type { ListingStatus, ListingType, OfferStatus } from "./schemas.js";

export interface OfferResponse {
  id: string;
  createdAt: string;
  listingId: string;
  buyerResidentId: string;
  offerAmountZar: number;
  status: OfferStatus;
  decidedAt: string | null;
  notes: string | null;
}

export interface ListingResponse {
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
  commissionBasisPoints: number;
  paymentLinkUrl: string | null;
  escrowPaymentId: string | null;
  paymentReceivedAt: string | null;
}

export interface ListingDetailResponse extends ListingResponse {
  offers: OfferResponse[];
}

export interface ListingListResponse {
  listings: ListingResponse[];
  total: number;
  page: number;
  pageSize: number;
}
