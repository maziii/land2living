import { recordPlatformAuditEvent } from "../../shared/audit/platform.js";
import { getPspAdapter } from "../../adapters/payment-psp/index.js";
import * as repo from "./repository.js";
import type { ServiceBooking } from "./repository.js";
import type { CreateBookingRequest, SubmitQuoteRequest, DisputeBookingRequest, ListBookingsQuery } from "./schemas.js";
import { getTakeRateBasisPoints } from "./take-rate-config.js";
import type { BookingResponse, BookingListResponse } from "./types.js";

const ENTITY = "service_booking";
// Platform escrow required for first 3 completed bookings between a customer+provider pair
const ESCROW_REQUIRED_THRESHOLD = 3;
// Auto-release escrow 7 days after provider marks complete with no dispute
export const AUTO_RELEASE_DAYS = 7;

export class ServicesError extends Error {
  constructor(message: string, readonly statusCode: 400 | 403 | 404 | 409 = 400) {
    super(message);
    this.name = "ServicesError";
  }
}

function toResponse(b: ServiceBooking): BookingResponse {
  return {
    id: b.id,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
    tenantSlug: b.tenantSlug,
    customerResidentId: b.customerResidentId,
    providerId: b.providerId,
    category: b.category as BookingResponse["category"],
    description: b.description,
    requestedDate: b.requestedDate ? b.requestedDate.toISOString() : null,
    quoteAmountZar: b.quoteAmountZar,
    takeRateBasisPoints: b.takeRateBasisPoints,
    status: b.status as BookingResponse["status"],
    escrowPaymentId: b.escrowPaymentId,
    customerRating: b.customerRating,
    providerRating: b.providerRating,
    customerConfirmedAt: b.customerConfirmedAt ? b.customerConfirmedAt.toISOString() : null,
    providerConfirmedAt: b.providerConfirmedAt ? b.providerConfirmedAt.toISOString() : null,
  };
}

export async function createBooking(
  tenantSlug: string,
  customerResidentId: string,
  data: CreateBookingRequest,
  actor: { userId: string; role: string; ip?: string; userAgent?: string },
): Promise<BookingResponse> {
  const booking = await repo.createBooking({
    tenantSlug,
    customerResidentId,
    providerId: data.providerId,
    category: data.category,
    description: data.description,
    ...(data.requestedDate !== undefined && { requestedDate: new Date(data.requestedDate) }),
  });

  await recordPlatformAuditEvent({
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventType: "services.booking_requested",
    entityType: ENTITY,
    entityId: booking.id,
    payloadJson: { tenantSlug, category: data.category, providerId: data.providerId },
    ...(actor.ip !== undefined && { ipAddress: actor.ip }),
    ...(actor.userAgent !== undefined && { userAgent: actor.userAgent }),
  });

  return toResponse(booking);
}

export async function submitQuote(
  bookingId: string,
  data: SubmitQuoteRequest,
  actor: { userId: string; role: string; ip?: string; userAgent?: string },
): Promise<BookingResponse> {
  const booking = await assertBookingState(bookingId, ["quote_requested"]);
  const takeRateBasisPoints = getTakeRateBasisPoints(booking.category);

  const updated = await repo.updateBooking(bookingId, {
    status: "quoted",
    quoteAmountZar: data.quoteAmountZar,
    takeRateBasisPoints,
  });
  if (!updated) throw new ServicesError("Booking not found", 404);

  await recordPlatformAuditEvent({
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventType: "services.quote_submitted",
    entityType: ENTITY,
    entityId: bookingId,
    payloadJson: { quoteAmountZar: data.quoteAmountZar, takeRateBasisPoints },
    ...(actor.ip !== undefined && { ipAddress: actor.ip }),
    ...(actor.userAgent !== undefined && { userAgent: actor.userAgent }),
  });

  return toResponse(updated);
}

export async function acceptQuote(
  bookingId: string,
  actor: { userId: string; role: string; ip?: string; userAgent?: string },
): Promise<BookingResponse> {
  const booking = await assertBookingState(bookingId, ["quoted"]);
  if (!booking.quoteAmountZar || !booking.takeRateBasisPoints) {
    throw new ServicesError("Booking has no quote to accept", 409);
  }

  const priorCount = await repo.countBookingsBetweenCustomerAndProvider(
    booking.tenantSlug,
    booking.customerResidentId,
    booking.providerId,
  );

  let escrowPaymentId: string | undefined;
  const requiresEscrow = priorCount < ESCROW_REQUIRED_THRESHOLD;

  if (requiresEscrow) {
    const psp = getPspAdapter();
    const publicBase = process.env["PUBLIC_BASE_URL"] ?? "https://l2l.app";
    const { paymentId } = await psp.createCheckout({
      referenceId: bookingId,
      amountZar: booking.quoteAmountZar,
      buyerName: booking.customerResidentId,
      description: `Service booking: ${booking.category} — ${bookingId.slice(0, 8)}`,
      cancelUrl: `${publicBase}/payment-cancelled`,
      successUrl: `${publicBase}/payment-success`,
    });
    escrowPaymentId = paymentId;
  }

  const updated = await repo.updateBooking(bookingId, {
    status: "accepted",
    ...(escrowPaymentId !== undefined && { escrowPaymentId }),
  });
  if (!updated) throw new ServicesError("Booking not found", 404);

  await recordPlatformAuditEvent({
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventType: "services.quote_accepted",
    entityType: ENTITY,
    entityId: bookingId,
    payloadJson: { requiresEscrow, escrowPaymentId: escrowPaymentId ?? null },
    ...(actor.ip !== undefined && { ipAddress: actor.ip }),
    ...(actor.userAgent !== undefined && { userAgent: actor.userAgent }),
  });

  return toResponse(updated);
}

export async function markStarted(
  bookingId: string,
  actor: { userId: string; role: string; ip?: string; userAgent?: string },
): Promise<BookingResponse> {
  await assertBookingState(bookingId, ["accepted"]);
  const updated = await repo.updateBooking(bookingId, { status: "in_progress" });
  if (!updated) throw new ServicesError("Booking not found", 404);

  await recordPlatformAuditEvent({
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventType: "services.work_started",
    entityType: ENTITY,
    entityId: bookingId,
    ...(actor.ip !== undefined && { ipAddress: actor.ip }),
    ...(actor.userAgent !== undefined && { userAgent: actor.userAgent }),
  });

  return toResponse(updated);
}

export async function confirmCompletion(
  bookingId: string,
  role: "customer" | "provider",
  actor: { userId: string; role: string; ip?: string; userAgent?: string },
): Promise<BookingResponse> {
  const booking = await assertBookingState(bookingId, ["in_progress"]);

  const patch =
    role === "customer"
      ? { customerConfirmedAt: new Date() }
      : { providerConfirmedAt: new Date() };

  let updated = await repo.updateBooking(bookingId, patch);
  if (!updated) throw new ServicesError("Booking not found", 404);

  // Both parties confirmed → mark completed and release escrow
  if (updated.customerConfirmedAt && updated.providerConfirmedAt) {
    if (booking.escrowPaymentId) {
      const psp = getPspAdapter();
      await psp.releaseEscrow(booking.escrowPaymentId);
    }
    updated = await repo.updateBooking(bookingId, { status: "completed" }) ?? updated;
  }

  await recordPlatformAuditEvent({
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventType: `services.completion_confirmed_by_${role}`,
    entityType: ENTITY,
    entityId: bookingId,
    ...(actor.ip !== undefined && { ipAddress: actor.ip }),
    ...(actor.userAgent !== undefined && { userAgent: actor.userAgent }),
  });

  return toResponse(updated);
}

export async function disputeBooking(
  bookingId: string,
  data: DisputeBookingRequest,
  actor: { userId: string; role: string; ip?: string; userAgent?: string },
): Promise<BookingResponse> {
  await assertBookingState(bookingId, ["in_progress", "accepted"]);

  const updated = await repo.updateBooking(bookingId, {
    status: "disputed",
    disputedAt: new Date(),
    disputeReason: data.reason,
  });
  if (!updated) throw new ServicesError("Booking not found", 404);

  await recordPlatformAuditEvent({
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventType: "services.booking_disputed",
    entityType: ENTITY,
    entityId: bookingId,
    payloadJson: { reason: data.reason },
    ...(actor.ip !== undefined && { ipAddress: actor.ip }),
    ...(actor.userAgent !== undefined && { userAgent: actor.userAgent }),
  });

  return toResponse(updated);
}

export async function getBooking(id: string): Promise<BookingResponse | null> {
  const b = await repo.findBooking(id);
  return b ? toResponse(b) : null;
}

export async function listBookings(query: ListBookingsQuery): Promise<BookingListResponse> {
  const { bookings, total } = await repo.listBookings(query);
  return { bookings: bookings.map(toResponse), total, page: query.page, pageSize: query.pageSize };
}

async function assertBookingState(id: string, allowed: string[]): Promise<ServiceBooking> {
  const booking = await repo.findBooking(id);
  if (!booking) throw new ServicesError("Booking not found", 404);
  if (!allowed.includes(booking.status)) {
    throw new ServicesError(`Cannot perform this action on a '${booking.status}' booking`, 409);
  }
  return booking;
}
