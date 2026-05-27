import { z } from "zod";
import { SERVICE_CATEGORIES } from "./take-rate-config.js";

export const BOOKING_STATUSES = [
  "quote_requested",
  "quoted",
  "accepted",
  "in_progress",
  "completed",
  "disputed",
  "cancelled",
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const createBookingSchema = z.object({
  providerId: z.string().uuid(),
  category: z.enum(SERVICE_CATEGORIES),
  description: z.string().min(10).max(2000),
  requestedDate: z.string().datetime().optional(),
});

export const submitQuoteSchema = z.object({
  quoteAmountZar: z.number().int().positive(),
});

export const rateBookingSchema = z.object({
  customerRating: z.number().int().min(1).max(5).optional(),
  providerRating: z.number().int().min(1).max(5).optional(),
});

export const disputeBookingSchema = z.object({
  reason: z.string().min(10).max(1000),
});

export const listBookingsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(BOOKING_STATUSES).optional(),
  providerId: z.string().uuid().optional(),
  tenantSlug: z.string().optional(),
  customerResidentId: z.string().optional(),
});

export type CreateBookingRequest = z.infer<typeof createBookingSchema>;
export type SubmitQuoteRequest = z.infer<typeof submitQuoteSchema>;
export type RateBookingRequest = z.infer<typeof rateBookingSchema>;
export type DisputeBookingRequest = z.infer<typeof disputeBookingSchema>;
export type ListBookingsQuery = z.infer<typeof listBookingsQuerySchema>;
