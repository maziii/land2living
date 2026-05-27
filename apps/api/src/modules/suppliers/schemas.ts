import { z } from "zod";

export const basketItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().int().positive(),
  unit: z.string().optional(),
  specNotes: z.string().optional(),
});

export const createQuoteRequestSchema = z.object({
  supplierIds: z.array(z.string().uuid()).min(1, "At least one supplier required"),
  basket: z.array(basketItemSchema).min(1, "Basket cannot be empty"),
  responseDeadlineDays: z.number().int().min(1).max(30).default(7),
});

export const submitManualResponseSchema = z.object({
  supplierId: z.string().uuid(),
  quoteAmountZar: z.number().int().positive().optional(),
  availability: z.string().optional(),
  leadTimeDays: z.number().int().min(0).optional(),
  notes: z.string().optional(),
});

export const selectSupplierSchema = z.object({
  supplierId: z.string().uuid(),
  responseId: z.string().uuid(),
});

export const listQuoteRequestsQuerySchema = z.object({
  tenantSlug: z.string().optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateQuoteRequestInput = z.infer<typeof createQuoteRequestSchema>;
export type SubmitManualResponseInput = z.infer<typeof submitManualResponseSchema>;
export type SelectSupplierInput = z.infer<typeof selectSupplierSchema>;
export type ListQuoteRequestsQuery = z.infer<typeof listQuoteRequestsQuerySchema>;
