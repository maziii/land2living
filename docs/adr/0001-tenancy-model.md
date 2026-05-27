# ADR 0001 — Schema-per-tenant tenancy model

**Status:** Accepted  
**Date:** 2026-01-15  
**Deciders:** L2L Founders

---

## Context

L2L is a multi-tenant platform where each council (tenant) owns its land registry data. The pilot launches with the Ndebele Royal Council; additional councils are expected after launch. We need a tenancy model that:

- Guarantees council data is logically isolated
- Supports council-level data export on demand (POPIA "right to access")
- Allows cross-platform queries at the L2L operations level (providers, suppliers, audit)
- Works without microservices (modular monolith)

Three options were evaluated:
1. **Shared schema with tenant_id column** — single schema, every table has a `tenant_id` foreign key
2. **Schema-per-tenant** — each council gets a PostgreSQL schema (`tenant_<slug>`)
3. **Database-per-tenant** — separate PostgreSQL instance per council

## Decision

**Schema-per-tenant** (option 2).

Each council maps to a PostgreSQL schema named `tenant_<slug>` (e.g., `tenant_ndebele`). A public schema holds platform-owned data (providers, suppliers, audit events, users).

## Consequences

**Positive:**
- Hard isolation at the DB level — no accidental cross-tenant leaks from a missing `WHERE tenant_id = ?`
- Council export is a schema dump — trivial to hand to a council secretary on request
- Easy to add a new tenant: run the migration script against the new schema
- Schema migrations are explicit per-tenant — no risk of a migration affecting all councils simultaneously

**Negative:**
- Prisma does not natively support schema-per-tenant; requires a `search_path` connection-time workaround
- Cross-schema queries (e.g., joining public suppliers to tenant residents) are not possible via Prisma relations; application code must bridge
- Connection pool management: all tenants share the same connection pool (acceptable at pilot scale)

## Alternatives considered

**Shared schema with tenant_id:** Rejected. Simpler to implement but requires disciplined application-level enforcement of tenant scoping on every query. One missed WHERE clause = data leak. Unacceptable for a land registry holding POPIA-protected data.

**Database-per-tenant:** Rejected as operationally expensive at pilot scale and unnecessary (Ndebele is one council; even at 5–10 councils, PostgreSQL schemas are sufficient).
