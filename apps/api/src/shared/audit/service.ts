import type { AuditEvent, Prisma } from "../../generated/tenant-client/index.js";
import { getPrismaClient } from "../database/index.js";
import type { AuditQuery } from "./schemas.js";
import { AuditEventType, type AuditEventInput } from "./types.js";
import type { TenantContext } from "../database/tenant-context.js";

export type { AuditEvent };

export async function recordAuditEvent(
  ctx: TenantContext,
  event: AuditEventInput,
): Promise<void> {
  await getPrismaClient(ctx).auditEvent.create({
    data: {
      actorUserId: event.actorUserId ?? null,
      actorRole: event.actorRole ?? null,
      eventType: event.eventType,
      entityType: event.entityType,
      entityId: event.entityId ?? null,
      ...(event.payloadJson !== undefined
        ? { payloadJson: event.payloadJson as Prisma.InputJsonValue }
        : {}),
      ipAddress: event.ipAddress ?? null,
      userAgent: event.userAgent ?? null,
    },
  });
}

// Convenience wrapper for POPIA PII-access events.
// Call this whenever a privileged role reads personal data fields.
export async function recordPiiAccess(
  ctx: TenantContext,
  actor: { userId: string; role: string },
  entityType: string,
  entityId: string,
  request?: { ip?: string; userAgent?: string },
): Promise<void> {
  await recordAuditEvent(ctx, {
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventType: AuditEventType.PII_ACCESSED,
    entityType,
    entityId,
    ...(request?.ip !== undefined ? { ipAddress: request.ip } : {}),
    ...(request?.userAgent !== undefined ? { userAgent: request.userAgent } : {}),
  });
}

export async function getAuditEvents(
  ctx: TenantContext,
  filters: AuditQuery,
): Promise<{ events: AuditEvent[]; total: number; page: number; pageSize: number }> {
  const db = getPrismaClient(ctx);
  const where: Prisma.AuditEventWhereInput = {};

  if (filters.eventType) where.eventType = filters.eventType;
  if (filters.entityType) where.entityType = filters.entityType;
  if (filters.entityId) where.entityId = filters.entityId;
  if (filters.actorUserId) where.actorUserId = filters.actorUserId;

  if (filters.fromDate ?? filters.toDate) {
    where.createdAt = {
      ...(filters.fromDate ? { gte: new Date(filters.fromDate) } : {}),
      ...(filters.toDate ? { lte: new Date(filters.toDate) } : {}),
    };
  }

  const skip = (filters.page - 1) * filters.pageSize;

  const [events, total] = await Promise.all([
    db.auditEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: filters.pageSize,
    }),
    db.auditEvent.count({ where }),
  ]);

  return { events, total, page: filters.page, pageSize: filters.pageSize };
}
