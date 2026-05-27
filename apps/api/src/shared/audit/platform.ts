import { PrismaClient, type Prisma } from "@prisma/client";

const prisma = new PrismaClient();

export interface PlatformAuditInput {
  actorUserId?: string;
  actorRole?: string;
  eventType: string;
  entityType?: string;
  entityId?: string;
  tenantSlug?: string;
  payloadJson?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export async function recordPlatformAuditEvent(event: PlatformAuditInput): Promise<void> {
  await prisma.platformAuditEvent.create({
    data: {
      actorUserId: event.actorUserId ?? null,
      actorRole: event.actorRole ?? null,
      eventType: event.eventType,
      entityType: event.entityType ?? null,
      entityId: event.entityId ?? null,
      tenantSlug: event.tenantSlug ?? null,
      ...(event.payloadJson !== undefined
        ? { payloadJson: event.payloadJson as Prisma.InputJsonValue }
        : {}),
      ipAddress: event.ipAddress ?? null,
      userAgent: event.userAgent ?? null,
    },
  });
}
