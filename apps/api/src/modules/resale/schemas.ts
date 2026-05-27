import { z } from "zod";

export const LISTING_TYPES = ["vacant_stand", "built_property"] as const;
export const LISTING_STATUSES = [
  "draft",
  "pending_council_approval",
  "live",
  "under_offer",
  "transfer_pending",
  "payment_received",
  "transferred",
  "withdrawn",
  "expired",
] as const;
export const OFFER_STATUSES = ["submitted", "accepted", "rejected", "withdrawn"] as const;

export type ListingType = (typeof LISTING_TYPES)[number];
export type ListingStatus = (typeof LISTING_STATUSES)[number];
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const LISTING_EXPIRY_DAYS = 90;
export const DEFAULT_COMMISSION_BASIS_POINTS = 250;

export const createListingSchema = z.object({
  sellerResidentId: z.string().uuid(),
  standId: z.string().uuid(),
  ptoId: z.string().uuid(),
  listingType: z.enum(LISTING_TYPES),
  askingPriceZar: z.number().int().positive(),
  description: z.string().min(1).max(2000),
  negotiable: z.boolean().default(false),
});

export const listListingsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(LISTING_STATUSES).optional(),
  listingType: z.enum(LISTING_TYPES).optional(),
});

export const createOfferSchema = z.object({
  buyerResidentId: z.string().uuid(),
  offerAmountZar: z.number().int().positive(),
});

export const decideOfferSchema = z.object({
  notes: z.string().max(1000).optional(),
});

export type CreateListingRequest = z.infer<typeof createListingSchema>;
export type ListListingsQuery = z.infer<typeof listListingsQuerySchema>;
export type CreateOfferRequest = z.infer<typeof createOfferSchema>;
export type DecideOfferRequest = z.infer<typeof decideOfferSchema>;
