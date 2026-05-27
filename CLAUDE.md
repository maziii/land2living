# CLAUDE.md

This file is read by Claude CLI at the start of every session. It contains the persistent context, conventions, and non-negotiable decisions for the Land2Living (L2L) pilot build.

**Read this entire file before doing any work.** If anything below conflicts with what the user is asking, surface the conflict and ask. Don't silently override these conventions.

---

## What L2L Is

L2L is a council-endorsed digital registry, services marketplace, and supplier orchestration platform for communal land in South Africa. The pilot launches with the Ndebele Royal Council under King Mabena in June 2026.

The platform is **multi-tenant** (each council = one tenant), **mobile-first**, and **integration-flexible** on the supply side.

## Three Workflows the Pilot Must Ship

1. **Existing resident capture** — foot soldiers register existing residents and their occupied stands into the digital register.
2. **Land application & PTO issuance** — residents apply for stands; council reviews and approves digitally; cryptographically signed PTO is issued.
3. **Resale of existing stands** — residents list stands or houses for sale; council approves the transfer; PTO updates to the new occupant.

Plus a **services marketplace** (architects, builders, plumbers, gardeners) and **supplier orchestration** (hardware stores via the Supplier Adapter pattern).

## Architecture Principles (Non-Negotiable)

These are locked. Don't violate them without explicit user approval.

1. **Council sovereignty** — each council's data is logically isolated and exportable on demand.
2. **Registry first** — the Land Register is the source of truth. Everything else consumes from it.
3. **Suppliers integrate on their terms** — never force suppliers onto a portal. Use API, WhatsApp, email, or manual.
4. **Build only what manual cannot replace** — WhatsApp + spreadsheet + a person beats premature code.
5. **Mobile is primary; offline is a feature** — foot soldier role MUST work offline.
6. **Manual fallback for every workflow** — no single point of failure breaks the council.
7. **Multi-tenant from day one** — every query must scope by tenant. No tenant_id-leak class of bugs.
8. **POPIA-aligned by default** — data minimisation, role-based access, audit on everything.
9. **Boring tech, sharp execution** — proven stack, no novelty for novelty's sake.

## Tech Stack (Locked)

| Layer | Choice | Notes |
|---|---|---|
| Mobile | React + Vite + Workbox (PWA) | Offline-capable for foot soldier role |
| Web (council) | React + TypeScript + Tailwind | Same components as mobile where possible |
| Backend | Node.js 20 + TypeScript + Fastify + Prisma ORM | |
| Database | PostgreSQL 16 (RDS managed) | **Schema-per-tenant** — see Tenancy below |
| Object storage | S3 (or Backblaze B2) | Document vault, signed PTOs, resident photos |
| Search | Postgres full-text initially | Meilisearch only if pilot proves the need |
| Background jobs | BullMQ on Redis | Quote dispatch, notifications, audit batching |
| WhatsApp | Meta WhatsApp Business API via 360dialog | |
| Payments / Escrow | Yoco or Ozow as PSP | Final selection deferred — design for either |
| Hosting | AWS af-south-1 (Cape Town) | POPIA data residency requirement |
| Container runtime | ECS Fargate | |
| CI/CD | GitHub Actions | |
| Observability | CloudWatch logs, Sentry for errors, Better Stack uptime | |

### What we are NOT using (reject if Claude CLI suggests these)

- **NOT** Kubernetes — overkill for pilot scale
- **NOT** microservices — modular monolith only
- **NOT** GraphQL — REST is fine and easier
- **NOT** MongoDB / NoSQL primary — relational data wins here
- **NOT** Next.js — Vite + React is leaner
- **NOT** any proprietary AI service in pilot
- **NOT** Auth0 / Clerk / Supabase Auth — implement own auth (POPIA simpler with own data)
- **NOT** Stripe — local SA PSPs only

## Application Architecture (Locked)

**Modular monolith, single deployable.** One backend service with cleanly separated modules per capability.

### Modules (one folder per module under `apps/api/src/modules/`)

- `register` — Land Registry: residents, stands, PTOs
- `applications` — New land application workflow
- `resale` — Resale listings and transfers
- `services` — Services marketplace (providers, bookings, take rate)
- `suppliers` — Supplier orchestration including the Adapter
- `admin` — Tenant config, user management, oversight

### Shared services (under `apps/api/src/shared/`)

- `identity` — auth, user identity, RBAC
- `notifications` — SMS, WhatsApp, in-app
- `payments` — escrow, disbursement (PSP-abstracted)
- `documents` — vault, cryptographic signing
- `audit` — append-only audit log

### Adapters (under `apps/api/src/adapters/`)

- `supplier-adapter` — abstracts supplier integration mechanism
- `payment-psp` — abstracts Yoco vs Ozow
- `whatsapp` — abstracts WhatsApp Business API
- `sms` — SMS gateway abstraction
- `maps` — GIS / mapping

**Module communication:** in-process function calls during pilot. NO event bus, NO message queue between modules in pilot. We extract services later if and only if a specific module justifies its own deployment.

## Tenancy Model (Locked)

**Schema-per-tenant on PostgreSQL.** Each council = one schema in a shared DB instance.

- Schema name format: `tenant_<slug>` (e.g., `tenant_ndebele`)
- Tenant resolved from JWT token claim, NEVER from request body
- Every database query MUST be scoped to the resolver's tenant
- Tenant resolution happens once per request in middleware
- Cross-tenant queries are reserved for platform-level admin only and require an explicit role check

**Migrations:** schema migrations apply per-tenant. Use a migration runner that loops over tenants. Don't apply ALTER TABLE statements globally.

**Public schema** holds platform-owned data (provider profiles, supplier registrations, ratings, etc. — see Data Ownership below).

## Data Ownership (Locked)

| Data category | Where it lives | Owner |
|---|---|---|
| Resident records, Stands, PTOs | Per-tenant schema | Council |
| Applications, approvals | Per-tenant schema | Council |
| Resale listings | Per-tenant schema | Council |
| Audit log (council-relevant) | Per-tenant schema | Council |
| Service provider profiles | `public` schema | L2L |
| Supplier registrations | `public` schema | L2L |
| Quote requests, bookings | `public` schema, with tenant_id reference | L2L (operational) |
| Reputation, ratings | `public` schema | L2L |
| Cross-tenant analytics | `public.analytics` schema | Shared (council sees their slice only) |

## Code Conventions

### File and folder naming

- **kebab-case** for folders and files: `land-application/`, `pto-issuance.ts`
- **PascalCase** for classes and types: `LandApplication`, `PTORecord`
- **camelCase** for functions and variables: `issuePto()`, `currentTenant`
- **SCREAMING_SNAKE_CASE** for constants: `MAX_PTO_RETENTION_DAYS`

### TypeScript

- Strict mode ON. No `any` types except at integration boundaries with explanation.
- Prefer `type` for unions and interfaces; use `interface` for extension scenarios.
- Use `zod` for runtime validation at API boundaries and any external input.
- All API request/response shapes defined as zod schemas; types derived from them.

### Module structure pattern

Every module follows the same internal layout:

```
modules/<module-name>/
  routes.ts          # Fastify route registration
  schemas.ts         # zod schemas for requests/responses
  service.ts         # Business logic, no HTTP concerns
  repository.ts      # Database access via Prisma
  types.ts           # Module-internal types
  __tests__/
    service.test.ts
    routes.test.ts
```

### API conventions

- All endpoints prefixed with `/api/v1`
- Resource paths use plural nouns: `/api/v1/applications`, `/api/v1/residents`
- Tenant-scoped paths: `/api/v1/tenants/:tenantSlug/applications` for multi-tenant explicit calls (admin only); standard tenant comes from JWT
- Standard HTTP verbs: GET (read), POST (create), PATCH (partial update), DELETE (soft delete)
- All responses include `requestId` for tracing
- Errors follow RFC 7807 problem details format

### Git and commit conventions

- Trunk-based development. Short-lived branches.
- Commit message format: `<type>(<scope>): <subject>` — types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`
- Example: `feat(applications): add PTO issuance endpoint`
- One concept per commit. Don't bundle unrelated changes.

### Testing

- Every module has tests for `service.ts` (business logic) and `routes.ts` (HTTP contract)
- Test framework: Vitest (matches Vite for shared config)
- Database tests use a per-test-file tenant schema, dropped after
- Aim for tests that prove behaviour, not coverage percentages

### Logging

- Use `pino` (Fastify default)
- Log levels: `error` (must page someone), `warn` (worth investigating), `info` (audit-relevant events), `debug` (dev only)
- Every log line includes `tenantSlug` and `requestId`
- NEVER log: PII without explicit redaction, raw passwords, full ID numbers, full payment card details

## Manual Fallback Requirement

Every user-facing workflow MUST have a documented manual fallback for when the system is unavailable. This is non-negotiable.

For each workflow, document in `docs/fallbacks/<workflow-name>.md`:
- What the council does if the system is down
- What paper template to use (and where to find it in `docs/templates/`)
- How to back-enter into the system once recovered (within 48 hours)
- How the audit log captures the offline period

## POPIA Compliance Requirements

Every feature touching personal data MUST consider:

1. **Lawful basis** — what's the lawful basis for processing? (Usually consent or legitimate interest)
2. **Data minimisation** — collect only what's needed for the specific purpose
3. **Retention** — how long is this data kept? Documented per data category
4. **Access controls** — who can see this data? Enforced via RBAC
5. **Audit trail** — every read of personal data by an admin role is logged
6. **Right to access** — residents can request their data export within 30 days
7. **Right to erasure** — residents can request data deletion (subject to register integrity constraints)

Data residency: **South Africa only.** Use af-south-1 region exclusively. No cross-region replication outside SA.

## Cryptographic PTO Signing

PTOs are cryptographically signed. The pilot approach:

- Each tenant has a signing keypair (Ed25519) stored in AWS KMS
- The PTO record (resident, stand, allocation date, council secretary signature, council ID) is canonicalised as JSON and signed
- The signed PTO is stored as both:
  - A JSON record in the database with the signature attached
  - A PDF in the document vault, with the signature embedded as a QR code
- Verification: scanning the QR code returns the signed JSON; the signature is verified against the tenant's public key
- The public key is published at `/api/v1/tenants/<slug>/pto-pubkey` so anyone can verify

## Coding Workflow with Claude CLI

When working on tasks:

1. **Read REQUIREMENTS.md first** for the specific work package and task
2. **Confirm understanding** before writing code — restate what you'll do
3. **Make small commits** — one task = one or more commits, each focused
4. **Write tests** alongside the implementation, not after
5. **Update docs** if the task changes documented behaviour
6. **Surface uncertainty** — when there's a choice not specified, ask rather than guess

### Things to ALWAYS do

- Run `npm run typecheck` before declaring a task complete
- Run `npm run test` before declaring a task complete
- Update relevant ADR in `docs/adr/` if making an architectural choice
- Use existing utilities — don't reinvent (search the codebase first)

### Things to NEVER do

- NEVER commit secrets (API keys, passwords, KMS key material)
- NEVER hardcode tenant identifiers
- NEVER write a query without tenant scoping (in tenant-scoped modules)
- NEVER use `any` without justification in a comment
- NEVER add a dependency without checking if existing dependencies cover it
- NEVER deploy without the user's explicit confirmation
- NEVER send actual SMS / WhatsApp messages from dev environments
- NEVER use real personal data in tests — use the faker library

## Project Layout (Target)

```
land2living/
├── CLAUDE.md                    # This file
├── REQUIREMENTS.md              # Full pilot requirements
├── README.md                    # Setup, run, deploy
├── docs/
│   ├── adr/                     # Architecture Decision Records
│   ├── fallbacks/               # Manual fallback procedures
│   ├── templates/               # Paper-form templates
│   └── runbooks/                # Operational runbooks
├── apps/
│   ├── api/                     # Backend (Node.js + Fastify)
│   ├── web-council/             # Council admin web app
│   └── mobile-pwa/              # Mobile PWA (residents, foot soldiers)
├── packages/
│   ├── shared-schemas/          # Zod schemas shared between API and clients
│   └── shared-types/            # TypeScript types shared
├── infra/
│   ├── terraform/               # IaC for AWS resources
│   └── docker/                  # Docker configs for local dev
└── scripts/
    ├── seed-tenant.ts           # Create a new tenant schema
    └── migrate-tenants.ts       # Apply migrations across tenants
```

## When to Stop and Ask

Stop and ask the user (don't guess) when:

- A task touches more than one module and the integration approach isn't specified
- A library or framework choice would deviate from the locked stack
- A schema change has potential to break existing tenants
- A POPIA-relevant feature has ambiguous lawful basis
- The pilot success criteria appear at risk

## Pilot Success Criteria (Reference)

The pilot is successful when, by 30 June 2026:

- 200+ communal records digitised
- 10+ digital PTOs issued
- 25+ land applications submitted
- 5+ land applications approved
- 3+ resale listings live
- 1+ resale transaction completed end-to-end
- 6+ verified service providers onboarded
- 1+ service booking completed end-to-end
- Public launch event with the King's office held
- 5+ foot soldiers actively using the field interface
- 2 anchor suppliers onboarded via Supplier Adapter

---

**Last updated:** 2026/05/02
**Owners:** L2L Founders (3)
**For Claude CLI:** Read this entire file at the start of every session. Confirm you have read it by referencing one of the principles or locked decisions in your first response. If you are about to do anything that conflicts with this file, stop and surface the conflict.
