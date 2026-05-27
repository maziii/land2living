import { recordAuditEvent } from "../../shared/audit/service.js";
import { enqueueNotification } from "../../shared/notifications/queue.js";
import { getPrismaClient } from "../../shared/database/index.js";
import type { TenantContext } from "../../shared/database/tenant-context.js";
import { getPspAdapter } from "../../adapters/payment-psp/index.js";
import { transferPTO } from "../register/ptos/service.js";
import * as repo from "./repository.js";
import type { ResaleListing, ResaleOffer } from "./repository.js";
import type {
  CreateListingRequest,
  CreateOfferRequest,
  DecideOfferRequest,
  ListListingsQuery,
} from "./schemas.js";
import { LISTING_EXPIRY_DAYS } from "./schemas.js";
import type { ListingResponse, ListingDetailResponse, ListingListResponse, OfferResponse } from "./types.js";

const ENTITY_LISTING = "resale_listing";
const ENTITY_OFFER = "resale_offer";

export class ResaleError extends Error {
  constructor(message: string, readonly statusCode: 400 | 403 | 404 | 409 = 400) {
    super(message);
    this.name = "ResaleError";
  }
}

function toListingResponse(l: ResaleListing): ListingResponse {
  return {
    id: l.id,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
    sellerResidentId: l.sellerResidentId,
    standId: l.standId,
    ptoId: l.ptoId,
    listingType: l.listingType as ListingResponse["listingType"],
    askingPriceZar: l.askingPriceZar,
    description: l.description,
    negotiable: l.negotiable,
    status: l.status as ListingResponse["status"],
    expiresAt: l.expiresAt.toISOString(),
    photos: l.photos,
    commissionBasisPoints: l.commissionBasisPoints,
    paymentLinkUrl: l.paymentLinkUrl,
    escrowPaymentId: l.escrowPaymentId,
    paymentReceivedAt: l.paymentReceivedAt ? l.paymentReceivedAt.toISOString() : null,
  };
}

function toOfferResponse(o: ResaleOffer): OfferResponse {
  return {
    id: o.id,
    createdAt: o.createdAt.toISOString(),
    listingId: o.listingId,
    buyerResidentId: o.buyerResidentId,
    offerAmountZar: o.offerAmountZar,
    status: o.status as OfferResponse["status"],
    decidedAt: o.decidedAt ? o.decidedAt.toISOString() : null,
    notes: o.notes,
  };
}

export async function createListing(
  ctx: TenantContext,
  data: CreateListingRequest,
  actor: { userId: string; role: string; ip?: string; userAgent?: string },
): Promise<ListingResponse> {
  const prisma = getPrismaClient(ctx);

  // Validate: seller must currently occupy the stand with the given PTO
  const occupancy = await prisma.standOccupancy.findFirst({
    where: {
      standId: data.standId,
      residentId: data.sellerResidentId,
      ptoId: data.ptoId,
      endedAt: null,
    },
  });
  if (!occupancy) {
    throw new ResaleError("Seller does not currently occupy this stand with the specified PTO", 400);
  }

  // Validate: no other live listing for this stand
  const liveCount = await repo.countLiveListingsForStand(ctx, data.standId);
  if (liveCount > 0) {
    throw new ResaleError("A live listing already exists for this stand", 409);
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + LISTING_EXPIRY_DAYS);

  const listing = await repo.createListing(ctx, {
    sellerResidentId: data.sellerResidentId,
    standId: data.standId,
    ptoId: data.ptoId,
    listingType: data.listingType,
    askingPriceZar: data.askingPriceZar,
    description: data.description,
    negotiable: data.negotiable,
    expiresAt,
  });

  await recordAuditEvent(ctx, {
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventType: "resale.listing_created",
    entityType: ENTITY_LISTING,
    entityId: listing.id,
    ...(actor.ip !== undefined && { ipAddress: actor.ip }),
    ...(actor.userAgent !== undefined && { userAgent: actor.userAgent }),
  });

  return toListingResponse(listing);
}

export async function submitListing(
  ctx: TenantContext,
  id: string,
  actor: { userId: string; role: string; ip?: string; userAgent?: string },
): Promise<ListingResponse> {
  const listing = await assertListingState(ctx, id, ["draft"]);

  const updated = await repo.updateListingStatus(ctx, id, "pending_council_approval");
  if (!updated) throw new ResaleError("Listing not found", 404);

  await recordAndNotify(ctx, "resale.listing_submitted", ENTITY_LISTING, id, actor, listing.sellerResidentId, "listing.submitted");

  return toListingResponse(updated);
}

export async function approveListing(
  ctx: TenantContext,
  id: string,
  actor: { userId: string; role: string; ip?: string; userAgent?: string },
): Promise<ListingResponse> {
  await assertListingState(ctx, id, ["pending_council_approval"]);

  const updated = await repo.updateListingStatus(ctx, id, "live");
  if (!updated) throw new ResaleError("Listing not found", 404);

  await recordAndNotify(ctx, "resale.listing_approved", ENTITY_LISTING, id, actor, updated.sellerResidentId, "listing.approved");

  return toListingResponse(updated);
}

export async function rejectListing(
  ctx: TenantContext,
  id: string,
  actor: { userId: string; role: string; ip?: string; userAgent?: string },
): Promise<ListingResponse> {
  await assertListingState(ctx, id, ["pending_council_approval"]);

  const updated = await repo.updateListingStatus(ctx, id, "draft");
  if (!updated) throw new ResaleError("Listing not found", 404);

  await recordAuditEvent(ctx, {
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventType: "resale.listing_rejected",
    entityType: ENTITY_LISTING,
    entityId: id,
    ...(actor.ip !== undefined && { ipAddress: actor.ip }),
    ...(actor.userAgent !== undefined && { userAgent: actor.userAgent }),
  });

  return toListingResponse(updated);
}

export async function getListing(
  ctx: TenantContext,
  id: string,
): Promise<ListingDetailResponse | null> {
  const listing = await repo.findListing(ctx, id);
  if (!listing) return null;
  return { ...toListingResponse(listing), offers: listing.offers.map(toOfferResponse) };
}

export async function listListings(
  ctx: TenantContext,
  query: ListListingsQuery,
): Promise<ListingListResponse> {
  const { listings, total } = await repo.listListings(ctx, {
    page: query.page,
    pageSize: query.pageSize,
    ...(query.status !== undefined && { status: query.status }),
    ...(query.listingType !== undefined && { listingType: query.listingType }),
  });
  return { listings: listings.map(toListingResponse), total, page: query.page, pageSize: query.pageSize };
}

export async function submitOffer(
  ctx: TenantContext,
  listingId: string,
  data: CreateOfferRequest,
  actor: { userId: string; role: string; ip?: string; userAgent?: string },
): Promise<OfferResponse> {
  const listing = await assertListingState(ctx, listingId, ["live"]);

  if (listing.sellerResidentId === data.buyerResidentId) {
    throw new ResaleError("Seller cannot submit an offer on their own listing", 400);
  }

  const offer = await repo.createOffer(ctx, {
    listingId,
    buyerResidentId: data.buyerResidentId,
    offerAmountZar: data.offerAmountZar,
  });

  await recordAuditEvent(ctx, {
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventType: "resale.offer_submitted",
    entityType: ENTITY_OFFER,
    entityId: offer.id,
    payloadJson: { listingId, offerAmountZar: data.offerAmountZar },
    ...(actor.ip !== undefined && { ipAddress: actor.ip }),
    ...(actor.userAgent !== undefined && { userAgent: actor.userAgent }),
  });

  return toOfferResponse(offer);
}

export async function acceptOffer(
  ctx: TenantContext,
  offerId: string,
  data: DecideOfferRequest,
  actor: { userId: string; role: string; ip?: string; userAgent?: string },
): Promise<OfferResponse> {
  const offer = await assertOfferState(ctx, offerId, ["submitted"]);

  // Move listing to under_offer
  await repo.updateListingStatus(ctx, offer.listingId, "under_offer");

  const updated = await repo.updateOfferStatus(ctx, offerId, "accepted", data.notes);
  if (!updated) throw new ResaleError("Offer not found", 404);

  await recordAuditEvent(ctx, {
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventType: "resale.offer_accepted",
    entityType: ENTITY_OFFER,
    entityId: offerId,
    ...(actor.ip !== undefined && { ipAddress: actor.ip }),
    ...(actor.userAgent !== undefined && { userAgent: actor.userAgent }),
  });

  return toOfferResponse(updated);
}

export async function rejectOffer(
  ctx: TenantContext,
  offerId: string,
  data: DecideOfferRequest,
  actor: { userId: string; role: string; ip?: string; userAgent?: string },
): Promise<OfferResponse> {
  await assertOfferState(ctx, offerId, ["submitted"]);

  const updated = await repo.updateOfferStatus(ctx, offerId, "rejected", data.notes);
  if (!updated) throw new ResaleError("Offer not found", 404);

  await recordAuditEvent(ctx, {
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventType: "resale.offer_rejected",
    entityType: ENTITY_OFFER,
    entityId: offerId,
    ...(actor.ip !== undefined && { ipAddress: actor.ip }),
    ...(actor.userAgent !== undefined && { userAgent: actor.userAgent }),
  });

  return toOfferResponse(updated);
}

export async function initiateTransfer(
  ctx: TenantContext,
  listingId: string,
  actor: { userId: string; role: string; ip?: string; userAgent?: string },
): Promise<ListingResponse> {
  const listing = await assertListingState(ctx, listingId, ["under_offer"]);

  const offer = await repo.findAcceptedOfferForListing(ctx, listingId);
  if (!offer) throw new ResaleError("No accepted offer found for this listing", 409);

  const commissionBasisPoints = listing.commissionBasisPoints;
  const totalAmountZar = Math.round(offer.offerAmountZar * (1 + commissionBasisPoints / 10000));

  const buyer = await getPrismaClient(ctx).resident.findUnique({
    where: { id: offer.buyerResidentId },
    select: { firstName: true, lastName: true, phoneNumber: true, languagePreference: true },
  });
  if (!buyer) throw new ResaleError("Buyer resident not found", 404);

  const psp = getPspAdapter();
  const publicBase = process.env["PUBLIC_BASE_URL"] ?? "https://l2l.app";
  const { paymentId, checkoutUrl } = await psp.createCheckout({
    referenceId: listingId,
    amountZar: totalAmountZar,
    buyerName: `${buyer.firstName} ${buyer.lastName}`,
    description: `Resale transfer: ${listing.listingType.replace("_", " ")} — listing ${listingId.slice(0, 8)}`,
    cancelUrl: `${publicBase}/payment-cancelled`,
    successUrl: `${publicBase}/payment-success`,
  });

  const withEscrow = await repo.setListingEscrow(ctx, listingId, {
    paymentLinkUrl: checkoutUrl,
    escrowPaymentId: paymentId,
  });
  if (!withEscrow) throw new ResaleError("Listing not found", 404);

  const updated = await repo.updateListingStatus(ctx, listingId, "transfer_pending");
  if (!updated) throw new ResaleError("Listing not found", 404);

  await recordAuditEvent(ctx, {
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventType: "resale.transfer_initiated",
    entityType: ENTITY_LISTING,
    entityId: listingId,
    payloadJson: { escrowPaymentId: paymentId, totalAmountZar },
    ...(actor.ip !== undefined && { ipAddress: actor.ip }),
    ...(actor.userAgent !== undefined && { userAgent: actor.userAgent }),
  });

  // Notify buyer with payment link
  void dispatchPaymentLinkNotification(ctx, buyer.phoneNumber, buyer.languagePreference, checkoutUrl, listingId);

  return toListingResponse({ ...updated, paymentLinkUrl: checkoutUrl, escrowPaymentId: paymentId });
}

export async function recordPaymentReceived(
  ctx: TenantContext,
  escrowPaymentId: string,
): Promise<ListingResponse | null> {
  const listing = await repo.markPaymentReceived(ctx, escrowPaymentId);
  if (!listing) return null;

  await recordAuditEvent(ctx, {
    actorUserId: "psp-webhook",
    actorRole: "system",
    eventType: "resale.payment_received",
    entityType: ENTITY_LISTING,
    entityId: listing.id,
    payloadJson: { escrowPaymentId },
  });

  // Notify council secretary for final approval
  void notifyCouncilPaymentReceived(ctx, listing.id);

  return toListingResponse(listing);
}

export async function approveCompletion(
  ctx: TenantContext,
  listingId: string,
  actor: { userId: string; role: string; ip?: string; userAgent?: string },
): Promise<ListingResponse> {
  const listing = await assertListingState(ctx, listingId, ["payment_received"]);

  if (!listing.escrowPaymentId) throw new ResaleError("No escrow payment found for this listing", 409);

  const offer = await repo.findAcceptedOfferForListing(ctx, listingId);
  if (!offer) throw new ResaleError("No accepted offer found for this listing", 409);

  // Release escrow funds to seller (net of commission)
  const psp = getPspAdapter();
  await psp.releaseEscrow(listing.escrowPaymentId);

  // Transfer PTO: supersede old, issue new to buyer
  await transferPTO(ctx, listingId, offer, actor);

  // Mark listing as transferred
  const updated = await repo.updateListingStatus(ctx, listingId, "transferred");
  if (!updated) throw new ResaleError("Listing not found", 404);

  await recordAuditEvent(ctx, {
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventType: "resale.transfer_completed",
    entityType: ENTITY_LISTING,
    entityId: listingId,
    payloadJson: { escrowPaymentId: listing.escrowPaymentId, buyerResidentId: offer.buyerResidentId },
    ...(actor.ip !== undefined && { ipAddress: actor.ip }),
    ...(actor.userAgent !== undefined && { userAgent: actor.userAgent }),
  });

  return toListingResponse(updated);
}

export async function refundAndWithdraw(
  ctx: TenantContext,
  listingId: string,
  actor: { userId: string; role: string; ip?: string; userAgent?: string },
): Promise<ListingResponse> {
  const listing = await assertListingState(ctx, listingId, ["transfer_pending", "payment_received"]);

  if (listing.escrowPaymentId) {
    const psp = getPspAdapter();
    await psp.refund(listing.escrowPaymentId);
  }

  const updated = await repo.updateListingStatus(ctx, listingId, "withdrawn");
  if (!updated) throw new ResaleError("Listing not found", 404);

  await recordAuditEvent(ctx, {
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventType: "resale.transfer_refunded",
    entityType: ENTITY_LISTING,
    entityId: listingId,
    ...(actor.ip !== undefined && { ipAddress: actor.ip }),
    ...(actor.userAgent !== undefined && { userAgent: actor.userAgent }),
  });

  return toListingResponse(updated);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function assertListingState(
  ctx: TenantContext,
  id: string,
  allowed: string[],
): Promise<ResaleListing> {
  const listing = await repo.findListing(ctx, id);
  if (!listing) throw new ResaleError("Listing not found", 404);
  if (!allowed.includes(listing.status)) {
    throw new ResaleError(`Cannot perform this action on a '${listing.status}' listing`, 409);
  }
  return listing;
}

async function assertOfferState(
  ctx: TenantContext,
  id: string,
  allowed: string[],
): Promise<ResaleOffer> {
  const offer = await repo.findOffer(ctx, id);
  if (!offer) throw new ResaleError("Offer not found", 404);
  if (!allowed.includes(offer.status)) {
    throw new ResaleError(`Cannot perform this action on a '${offer.status}' offer`, 409);
  }
  return offer;
}

async function recordAndNotify(
  ctx: TenantContext,
  eventType: string,
  entityType: string,
  entityId: string,
  actor: { userId: string; role: string; ip?: string; userAgent?: string },
  residentId: string,
  templateKey: string,
): Promise<void> {
  await recordAuditEvent(ctx, {
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventType,
    entityType,
    entityId,
    ...(actor.ip !== undefined && { ipAddress: actor.ip }),
    ...(actor.userAgent !== undefined && { userAgent: actor.userAgent }),
  });

  void dispatchResaleNotification(ctx, entityId, residentId, templateKey);
}

async function dispatchResaleNotification(
  ctx: TenantContext,
  listingId: string,
  residentId: string,
  templateKey: string,
): Promise<void> {
  try {
    const resident = await getPrismaClient(ctx).resident.findUnique({
      where: { id: residentId },
      select: { phoneNumber: true, languagePreference: true },
    });
    if (!resident) return;

    await enqueueNotification({
      tenantSlug: ctx.slug,
      recipientPhone: resident.phoneNumber,
      language: resident.languagePreference,
      templateKey,
      vars: { ref: listingId.slice(0, 8), council: ctx.slug },
    });
  } catch (err) {
    console.error(`Failed to enqueue resale notification for listing ${listingId}:`, err);
  }
}

async function dispatchPaymentLinkNotification(
  ctx: TenantContext,
  phoneNumber: string,
  language: string,
  paymentUrl: string,
  listingId: string,
): Promise<void> {
  try {
    await enqueueNotification({
      tenantSlug: ctx.slug,
      recipientPhone: phoneNumber,
      language,
      templateKey: "resale.payment_link",
      vars: { ref: listingId.slice(0, 8), council: ctx.slug, paymentUrl },
    });
  } catch (err) {
    console.error(`Failed to enqueue payment link notification for listing ${listingId}:`, err);
  }
}

async function notifyCouncilPaymentReceived(ctx: TenantContext, listingId: string): Promise<void> {
  try {
    // Look up council secretary users for this tenant and notify them
    const prisma = getPrismaClient(ctx);
    const secretaries = await prisma.resident.findMany({
      where: { phoneNumber: { not: "" } },
      select: { phoneNumber: true, languagePreference: true },
      take: 5,
    });
    for (const s of secretaries) {
      void enqueueNotification({
        tenantSlug: ctx.slug,
        recipientPhone: s.phoneNumber,
        language: s.languagePreference,
        templateKey: "resale.payment_received_council",
        vars: { ref: listingId.slice(0, 8), council: ctx.slug },
      }).catch(() => undefined);
    }
  } catch (err) {
    console.error(`Failed to notify council of payment for listing ${listingId}:`, err);
  }
}
