import { z } from "zod";

export const recordSaleSchema = z.object({
  supplierId: z.string().uuid(),
  quoteRequestId: z.string().uuid().optional(),
  tenantSlug: z.string().min(1),
  customerResidentId: z.string().optional(),
  fulfilledAmountZar: z.number().int().positive(),
});

export const recordPaymentSchema = z.object({
  paidAt: z.string().datetime().optional(),
});

export const listSalesQuerySchema = z.object({
  supplierId: z.string().uuid().optional(),
  status: z.enum(["pending_invoice", "invoiced", "paid"]).optional(),
  tenantSlug: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type RecordSaleInput = z.infer<typeof recordSaleSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type ListSalesQuery = z.infer<typeof listSalesQuerySchema>;
