import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { TenantContext } from "../../database/tenant-context.js";
import {
  disconnectAllClients,
  getPrismaClient,
  getPublicPrismaClient,
} from "../../database/prisma-client.js";
import { recordAuditEvent, recordPiiAccess, getAuditEvents } from "../service.js";
import { AuditEventType } from "../types.js";

const hasDatabase = Boolean(process.env["DATABASE_URL"]);
const suffix = Date.now().toString();
const slug = `test_audit_${suffix}`;
const ctx = new TenantContext(slug);

describe.skipIf(!hasDatabase)("audit service integration", () => {
  let admin!: PrismaClient;

  beforeAll(async () => {
    admin = getPublicPrismaClient();
    const db = getPrismaClient(ctx);

    await admin.$executeRawUnsafe(`CREATE SCHEMA "${ctx.schemaName}"`);

    await db.$executeRawUnsafe(`
      CREATE TABLE "audit_events" (
        "id" TEXT NOT NULL,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "actor_user_id" TEXT,
        "actor_role" TEXT,
        "event_type" TEXT NOT NULL,
        "entity_type" TEXT NOT NULL,
        "entity_id" TEXT,
        "payload_json" JSONB,
        "ip_address" TEXT,
        "user_agent" TEXT,
        CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
      )
    `);

    await db.$executeRawUnsafe(
      `CREATE INDEX "audit_events_event_type_idx" ON "audit_events"("event_type")`,
    );
    await db.$executeRawUnsafe(
      `CREATE INDEX "audit_events_entity_idx" ON "audit_events"("entity_type", "entity_id")`,
    );
    await db.$executeRawUnsafe(
      `CREATE INDEX "audit_events_created_at_idx" ON "audit_events"("created_at")`,
    );

    await db.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION prevent_audit_events_modification()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'audit_events is append-only: updates and deletes are not permitted';
      END;
      $$
    `);

    await db.$executeRawUnsafe(`
      CREATE TRIGGER no_update_audit_events
        BEFORE UPDATE ON audit_events
        FOR EACH ROW EXECUTE FUNCTION prevent_audit_events_modification()
    `);

    await db.$executeRawUnsafe(`
      CREATE TRIGGER no_delete_audit_events
        BEFORE DELETE ON audit_events
        FOR EACH ROW EXECUTE FUNCTION prevent_audit_events_modification()
    `);
  });

  afterAll(async () => {
    await admin.$executeRawUnsafe(`DROP SCHEMA "${ctx.schemaName}" CASCADE`);
    await admin.$disconnect();
    await disconnectAllClients();
  });

  it("recordAuditEvent inserts a record in the tenant schema", async () => {
    await recordAuditEvent(ctx, {
      actorUserId: "user-abc",
      actorRole: "council_secretary",
      eventType: AuditEventType.USER_LOGIN,
      entityType: "user",
      entityId: "user-abc",
    });

    const events = await getPrismaClient(ctx).auditEvent.findMany({
      where: { eventType: AuditEventType.USER_LOGIN, actorUserId: "user-abc" },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.actorRole).toBe("council_secretary");
    expect(events[0]?.entityId).toBe("user-abc");
  });

  it("recordPiiAccess creates a PII_ACCESSED event with request metadata", async () => {
    await recordPiiAccess(
      ctx,
      { userId: "user-xyz", role: "council_secretary" },
      "resident",
      "resident-123",
      { ip: "10.0.0.1", userAgent: "Mozilla/5.0" },
    );

    const events = await getPrismaClient(ctx).auditEvent.findMany({
      where: { eventType: AuditEventType.PII_ACCESSED, entityId: "resident-123" },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.ipAddress).toBe("10.0.0.1");
    expect(events[0]?.userAgent).toBe("Mozilla/5.0");
    expect(events[0]?.entityType).toBe("resident");
  });

  it("UPDATE on audit_events is rejected by the database trigger", async () => {
    const db = getPrismaClient(ctx);
    const created = await db.auditEvent.create({
      data: { eventType: AuditEventType.RECORD_CREATED, entityType: "stand" },
    });

    await expect(
      db.$executeRawUnsafe(
        `UPDATE audit_events SET actor_role = 'tampered' WHERE id = $1`,
        created.id,
      ),
    ).rejects.toThrow("append-only");
  });

  it("DELETE on audit_events is rejected by the database trigger", async () => {
    const db = getPrismaClient(ctx);
    const created = await db.auditEvent.create({
      data: { eventType: AuditEventType.RECORD_CREATED, entityType: "stand" },
    });

    await expect(
      db.$executeRawUnsafe(`DELETE FROM audit_events WHERE id = $1`, created.id),
    ).rejects.toThrow("append-only");
  });

  it("getAuditEvents returns paginated results", async () => {
    const db = getPrismaClient(ctx);
    await db.auditEvent.createMany({
      data: Array.from({ length: 5 }, (_, i) => ({
        eventType: AuditEventType.RECORD_UPDATED,
        entityType: "application",
        entityId: `app-${i}`,
      })),
    });

    const result = await getAuditEvents(ctx, {
      page: 1,
      pageSize: 3,
      eventType: AuditEventType.RECORD_UPDATED,
    });

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(3);
    expect(result.events).toHaveLength(3);
    expect(result.total).toBeGreaterThanOrEqual(5);
  });

  it("getAuditEvents filters by entityType", async () => {
    const result = await getAuditEvents(ctx, { page: 1, pageSize: 50, entityType: "resident" });
    expect(result.events.every((e) => e.entityType === "resident")).toBe(true);
  });

  it("getAuditEvents filters by actorUserId", async () => {
    const result = await getAuditEvents(ctx, { page: 1, pageSize: 50, actorUserId: "user-abc" });
    expect(result.events.every((e) => e.actorUserId === "user-abc")).toBe(true);
  });

  it("getAuditEvents filters by date range", async () => {
    const fromDate = new Date(Date.now() - 60_000).toISOString();
    const toDate = new Date(Date.now() + 60_000).toISOString();

    const db = getPrismaClient(ctx);
    await db.auditEvent.create({
      data: { eventType: AuditEventType.BULK_IMPORT, entityType: "residents" },
    });

    const result = await getAuditEvents(ctx, {
      page: 1,
      pageSize: 50,
      eventType: AuditEventType.BULK_IMPORT,
      fromDate,
      toDate,
    });

    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.events.every((e) => e.eventType === AuditEventType.BULK_IMPORT)).toBe(true);
  });
});
