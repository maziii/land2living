# ADR 0006 — Split audit log: tenant-scoped vs platform-level

**Status:** Accepted  
**Date:** 2026-03-05  
**Deciders:** L2L Founders

---

## Context

The platform has two distinct types of events that need audit logging:

1. **Council-owned events** — resident registration, PTO issuance, land applications. These belong to the council's data and must be exportable with the council's data on request (POPIA right of access). They live in the tenant schema.

2. **Platform-owned events** — service bookings, supplier quote dispatches, commission tracking, PSP webhooks. These involve L2L platform operations that span councils or live in the public schema. They should not be part of any one council's data export.

The existing `AuditEvent` model in the tenant schema cannot record platform-level events because: (a) platform events lack a meaningful `TenantContext` in some cases, and (b) it would mix council-owned data with L2L operational data.

## Decision

**Two audit tables:**

- `AuditEvent` in `tenant_<slug>` schema — council-scoped events: residency changes, PTO operations, application decisions, resale transfers.
- `PlatformAuditEvent` in `public` schema — platform events: booking state changes, supplier dispatches, commission records, PSP events.

Two corresponding functions:
- `recordAuditEvent(ctx: TenantContext, ...)` — writes to tenant schema
- `recordPlatformAuditEvent(input: PlatformAuditInput)` — writes to public schema via a dedicated Prisma client instance

## Consequences

**Positive:**
- Council data exports contain only council-owned events — no platform operational noise
- Platform events are queryable across tenants for L2L operational reporting
- Clear ownership semantics: council secretary sees council events; L2L founders see platform events

**Negative:**
- Two separate functions increase the risk of logging to the wrong table; code review must enforce the split
- The `PlatformAuditEvent` table grows unbounded in the public schema; requires a retention policy
- `recordPlatformAuditEvent` instantiates its own `PrismaClient` — not ideal for connection pool efficiency at scale (acceptable at pilot volume)

## Alternatives considered

**Single audit table in public schema:** Rejected. Complicates council data exports and muddies data ownership under POPIA.

**Single audit table per tenant with a platform_owned flag:** Rejected. Still puts L2L operational data inside council schemas; export logic must filter.

**No platform audit log:** Rejected. POPIA and operational requirements both mandate an audit trail for all processing of personal data.
