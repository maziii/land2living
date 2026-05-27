import { z } from "zod";

export const auditQuerySchema = z.object({
  eventType: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  actorUserId: z.string().optional(),
  fromDate: z.string().datetime({ offset: true }).optional(),
  toDate: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
});

export type AuditQuery = z.infer<typeof auditQuerySchema>;
