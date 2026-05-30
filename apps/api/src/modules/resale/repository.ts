import type { ResaleListing, ResaleOffer, Stand } from "../../generated/tenant-client/index.js";
import { getPrismaClient } from "../../shared/database/index.js";
import type { TenantContext } from "../../shared/database/tenant-context.js";

export type { ResaleListing, ResaleOffer, Stand };

export interface CreateListingData {
  sellerResidentId: string;
  standId: string;
  ptoId: string;
  listingType: string;
  askingPriceZar: number;
  description: string;
  negotiable: boolean;
  expiresAt: Date;
}

export interface ListListingsFilter {
  page: number;
  pageSize: number;
  status?: string;
  listingType?: string;
}

export async function createListing(ctx: TenantContext, data: CreateListingData): Promise<ResaleListing> {
  return getPrismaClient(ctx).resaleListing.create({ data });
}

export async function findListing(ctx: TenantContext, id: string): Promise<(ResaleListing & { stand: Stand; offers: ResaleOffer[] }) | null> {
  return getPrismaClient(ctx).resaleListing.findUnique({
    where: { id },
    include: { stand: true, offers: { orderBy: { createdAt: "desc" } } },
  }) as Promise<(ResaleListing & { stand: Stand; offers: ResaleOffer[] }) | null>;
}

export async function listListings(
  ctx: TenantContext,
  filter: ListListingsFilter,
): Promise<{ listings: (ResaleListing & { stand: Stand })[]; total: number }> {
  const prisma = getPrismaClient(ctx);
  const where = {
    ...(filter.status !== undefined && { status: filter.status }),
    ...(filter.listingType !== undefined && { listingType: filter.listingType }),
  };
  const [listings, total] = await prisma.$transaction([
    prisma.resaleListing.findMany({
      where,
      include: { stand: true },
      orderBy: { createdAt: "desc" },
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
    }),
    prisma.resaleListing.count({ where }),
  ]);
  return { listings: listings as (ResaleListing & { stand: Stand })[], total };
}

export async function updateListingStatus(
  ctx: TenantContext,
  id: string,
  status: string,
  extra?: { decisionNotes?: string },
): Promise<ResaleListing | null> {
  const prisma = getPrismaClient(ctx);
  const existing = await prisma.resaleListing.findUnique({ where: { id } });
  if (!existing) return null;
  return prisma.resaleListing.update({
    where: { id },
    data: { status },
  });
}

export async function createOffer(
  ctx: TenantContext,
  data: { listingId: string; buyerResidentId: string; offerAmountZar: number },
): Promise<ResaleOffer> {
  return getPrismaClient(ctx).resaleOffer.create({ data });
}

export async function findOffer(ctx: TenantContext, id: string): Promise<ResaleOffer | null> {
  return getPrismaClient(ctx).resaleOffer.findUnique({ where: { id } });
}

export async function updateOfferStatus(
  ctx: TenantContext,
  id: string,
  status: string,
  notes?: string,
): Promise<ResaleOffer | null> {
  const prisma = getPrismaClient(ctx);
  const existing = await prisma.resaleOffer.findUnique({ where: { id } });
  if (!existing) return null;
  return prisma.resaleOffer.update({
    where: { id },
    data: {
      status,
      decidedAt: new Date(),
      ...(notes !== undefined && { notes }),
    },
  });
}

export async function setListingEscrow(
  ctx: TenantContext,
  id: string,
  data: { paymentLinkUrl: string; escrowPaymentId: string },
): Promise<ResaleListing | null> {
  const prisma = getPrismaClient(ctx);
  const existing = await prisma.resaleListing.findUnique({ where: { id } });
  if (!existing) return null;
  return prisma.resaleListing.update({
    where: { id },
    data: { paymentLinkUrl: data.paymentLinkUrl, escrowPaymentId: data.escrowPaymentId },
  });
}

export async function markPaymentReceived(
  ctx: TenantContext,
  escrowPaymentId: string,
): Promise<ResaleListing | null> {
  const prisma = getPrismaClient(ctx);
  const listing = await prisma.resaleListing.findFirst({ where: { escrowPaymentId } });
  if (!listing) return null;
  return prisma.resaleListing.update({
    where: { id: listing.id },
    data: { status: "payment_received", paymentReceivedAt: new Date() },
  });
}

export async function findListingByEscrowPaymentId(
  ctx: TenantContext,
  escrowPaymentId: string,
): Promise<ResaleListing | null> {
  return getPrismaClient(ctx).resaleListing.findFirst({ where: { escrowPaymentId } });
}

export async function findAcceptedOfferForListing(
  ctx: TenantContext,
  listingId: string,
): Promise<ResaleOffer | null> {
  return getPrismaClient(ctx).resaleOffer.findFirst({
    where: { listingId, status: "accepted" },
  });
}

export async function countLiveListingsForStand(ctx: TenantContext, standId: string): Promise<number> {
  return getPrismaClient(ctx).resaleListing.count({
    where: { standId, status: "live" },
  });
}
