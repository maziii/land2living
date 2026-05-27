import { PrismaClient, type ServiceBooking } from "@prisma/client";
import type { ListBookingsQuery } from "./schemas.js";

export type { ServiceBooking };

const prisma = new PrismaClient();

export async function createBooking(data: {
  tenantSlug: string;
  customerResidentId: string;
  providerId: string;
  category: string;
  description: string;
  requestedDate?: Date;
}): Promise<ServiceBooking> {
  return prisma.serviceBooking.create({ data });
}

export async function findBooking(id: string): Promise<ServiceBooking | null> {
  return prisma.serviceBooking.findUnique({ where: { id } });
}

export async function updateBooking(
  id: string,
  data: Partial<{
    status: string;
    quoteAmountZar: number;
    takeRateBasisPoints: number;
    escrowPaymentId: string;
    customerRating: number;
    providerRating: number;
    customerConfirmedAt: Date;
    providerConfirmedAt: Date;
    disputedAt: Date;
    disputeReason: string;
  }>,
): Promise<ServiceBooking | null> {
  const existing = await prisma.serviceBooking.findUnique({ where: { id } });
  if (!existing) return null;
  return prisma.serviceBooking.update({ where: { id }, data });
}

export async function listBookings(query: ListBookingsQuery): Promise<{ bookings: ServiceBooking[]; total: number }> {
  const where = {
    ...(query.status !== undefined && { status: query.status }),
    ...(query.providerId !== undefined && { providerId: query.providerId }),
    ...(query.tenantSlug !== undefined && { tenantSlug: query.tenantSlug }),
    ...(query.customerResidentId !== undefined && { customerResidentId: query.customerResidentId }),
  };
  const [bookings, total] = await prisma.$transaction([
    prisma.serviceBooking.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.serviceBooking.count({ where }),
  ]);
  return { bookings, total };
}

export async function countBookingsBetweenCustomerAndProvider(
  tenantSlug: string,
  customerResidentId: string,
  providerId: string,
): Promise<number> {
  return prisma.serviceBooking.count({
    where: {
      tenantSlug,
      customerResidentId,
      providerId,
      status: { in: ["completed", "in_progress", "accepted"] },
    },
  });
}
