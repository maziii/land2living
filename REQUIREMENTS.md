# L2L Pilot Requirements

**Document:** Pilot Solution Requirements
**Version:** v1.0 DRAFT
**For:** Claude CLI implementation
**Companion:** CLAUDE.md (read first)

---

## How to Use This Document

This document specifies the complete L2L pilot solution. It is structured for AI-agent execution: each work package is broken into tasks, each task has clear inputs, outputs, and acceptance criteria.

**Order of execution:**
1. WP-01 Foundation (must complete before any other WP)
2. WP-02 Resident Registration (depends on WP-01)
3. WP-03 Land Application & PTO (depends on WP-01, WP-02)
4. WP-04 Resale Workflow (depends on WP-01, WP-03)
5. WP-05 Marketplace + Suppliers (depends on WP-01, can run parallel with WP-03/04)

Each task has:
- **ID** — stable reference (e.g., `T-01.03`)
- **Goal** — what success looks like
- **Inputs** — files, data, dependencies needed
- **Acceptance criteria** — how we know it's done
- **Out of scope** — what NOT to do in this task

---

## WP-01: Foundation

**Effort estimate:** 3 weeks
**Owner:** Senior Engineer (lead), Data Lead (review schema)
**Dependencies:** None — first work package

### Goal

Stand up the multi-tenant platform foundation: authentication, tenant management, the audit log, the document vault, and the council admin shell. Every subsequent work package builds on this.

### Tasks

#### T-01.01 — Repository scaffold

**Goal:** Create the monorepo structure with the layout specified in CLAUDE.md.

**Inputs:**
- CLAUDE.md project layout section

**Acceptance criteria:**
- Folder structure matches CLAUDE.md exactly
- `package.json` configured for npm workspaces
- TypeScript strict mode enabled across all workspaces
- ESLint + Prettier configured with shared config in root
- `.gitignore` covers `node_modules`, `.env*`, `dist`, `coverage`
- `npm install` from root installs all workspace dependencies
- A `README.md` at the root documents setup steps

**Out of scope:** Any application code; CI/CD configuration (T-01.10).

#### T-01.02 — Local development environment

**Goal:** Docker Compose setup for local development with PostgreSQL, Redis, and a mock S3 (MinIO).

**Inputs:**
- Tech stack from CLAUDE.md

**Acceptance criteria:**
- `docker-compose.yml` in `infra/docker/`
- PostgreSQL 16 with persistent volume
- Redis with persistent volume
- MinIO for local S3 emulation
- `.env.example` documents every required environment variable
- `npm run dev:up` starts all services
- `npm run dev:down` stops cleanly
- `npm run dev:reset` rebuilds from scratch

**Out of scope:** Production infrastructure; AWS resources.

#### T-01.03 — Database connection and schema-per-tenant runner

**Goal:** Prisma setup with a tenant-aware connection layer and a migration runner that applies schemas per tenant.

**Inputs:**
- Tenancy model from CLAUDE.md
- Tech stack: PostgreSQL, Prisma

**Acceptance criteria:**
- Prisma installed and configured
- A `TenantContext` class that holds the current tenant slug for the request
- A connection wrapper that sets `search_path` to `tenant_<slug>,public` per request
- A `scripts/migrate-tenants.ts` script that applies pending migrations to every existing tenant schema
- A `scripts/seed-tenant.ts` script that creates a new tenant schema and runs all migrations against it
- Tests prove that a query in tenant A's context cannot see tenant B's data
- The `public` schema is reserved for platform-owned data (provider profiles, supplier registrations, etc.)

**Out of scope:** Specific business entity schemas (covered in later tasks).

#### T-01.04 — Authentication and identity

**Goal:** JWT-based auth with role-based access control. Users authenticate; their JWT carries tenant slug and role.

**Inputs:**
- CLAUDE.md identity & access section

**Acceptance criteria:**
- Users table in `public` schema (cross-tenant; users may belong to multiple tenants)
- Roles defined: `resident`, `foot_soldier`, `council_secretary`, `council_member`, `provider`, `supplier`, `founder`
- A user has one role per tenant they belong to
- Password hashing with argon2id
- JWT issued on login, includes `userId`, `tenantSlug`, `role`, expires in 1 hour
- Refresh tokens stored hashed in DB, valid 30 days, rotated on use
- Endpoint: `POST /api/v1/auth/login`
- Endpoint: `POST /api/v1/auth/refresh`
- Endpoint: `POST /api/v1/auth/logout`
- Middleware that resolves tenant from JWT and attaches to request context
- Middleware that enforces role on protected routes
- MFA scaffold for `council_secretary` and `founder` roles (TOTP) — implementation in T-01.07
- Tests cover login success, login failure, expired token, role rejection

**Out of scope:** Forgot password (T-01.08); MFA enforcement (T-01.07); user registration UI.

#### T-01.05 — Audit log

**Goal:** Append-only audit log. Every state change in any tenant-scoped module logs an event.

**Inputs:**
- CLAUDE.md POPIA compliance section
- CLAUDE.md data ownership section (audit log is per-tenant)

**Acceptance criteria:**
- `audit_event` table in each tenant schema
- Columns: `id`, `created_at`, `actor_user_id`, `actor_role`, `event_type`, `entity_type`, `entity_id`, `payload_json`, `ip_address`, `user_agent`
- The table is append-only enforced at DB level (REVOKE UPDATE, DELETE; only INSERT and SELECT permitted)
- A `recordAuditEvent()` utility in `shared/audit/` that all modules call
- Helper for "view PII" events specifically (council secretary or founder reads resident records → must log)
- Endpoint: `GET /api/v1/audit-events` for council secretary and founder roles
- Endpoint supports filtering by entity, actor, date range, event type
- Tests cover: event recorded on create/update/delete; cannot UPDATE/DELETE existing events

**Out of scope:** Reporting dashboard for audit events (later phase).

#### T-01.06 — Document vault

**Goal:** S3-backed document storage with cryptographic signing for PTOs.

**Inputs:**
- CLAUDE.md cryptographic PTO signing section
- AWS KMS for tenant signing keys (or local-dev simulation)

**Acceptance criteria:**
- `document` table in each tenant schema with metadata: `id`, `created_at`, `type` (enum: `pto`, `application`, `resale_listing`, `id_doc`, `other`), `s3_key`, `content_hash`, `signature` (nullable), `signed_by_tenant`, `created_by_user_id`
- S3 bucket per environment, server-side encryption enabled (KMS-managed)
- Each tenant has an Ed25519 keypair stored in KMS (local dev: stored in dev-only KMS simulator)
- A `signDocument(tenantSlug, payload)` utility that canonicalises JSON, signs, returns signature
- A `verifySignature(tenantSlug, payload, signature)` utility for verification
- Endpoint: `POST /api/v1/documents` (uploads + records metadata)
- Endpoint: `GET /api/v1/documents/:id` (returns signed URL with 5-minute expiry)
- Endpoint: `GET /api/v1/tenants/:slug/pto-pubkey` (public — returns the tenant's PTO verification public key)
- Tests cover: signing and verification roundtrip; rejection of tampered payload

**Out of scope:** PDF rendering of PTO (T-03.07); QR code generation (T-03.07).

#### T-01.07 — MFA enforcement

**Goal:** TOTP-based MFA enforced for `council_secretary` and `founder` roles.

**Acceptance criteria:**
- TOTP setup endpoint: `POST /api/v1/auth/mfa/setup` returns QR code data URI
- TOTP verify endpoint: `POST /api/v1/auth/mfa/verify` accepts code, marks account MFA-enabled
- Login flow checks if MFA is enabled; if so, requires code in second step
- Recovery codes (8 codes, single-use) generated at setup, displayed once, hashed in DB
- Endpoint: `POST /api/v1/auth/mfa/disable` (requires current password + valid TOTP code)
- Tests cover: setup, verify, login with MFA, recovery code use, disable

**Out of scope:** SMS-based MFA (TOTP only in pilot).

#### T-01.08 — Password reset

**Goal:** Standard forgot-password flow via email.

**Acceptance criteria:**
- Endpoint: `POST /api/v1/auth/forgot-password` (accepts email, always returns 200 to avoid enumeration)
- Generates a single-use reset token (32 bytes), stores hash with 1-hour expiry
- Sends email via SES (or local-dev MailHog) with reset link
- Endpoint: `POST /api/v1/auth/reset-password` (accepts token + new password)
- Token consumed on use; cannot be reused
- All password changes audit-logged
- Tests cover: happy path, expired token, reused token, invalid token

**Out of scope:** Account lockout (deferred to post-pilot).

#### T-01.09 — Council admin shell (web app)

**Goal:** A minimal authenticated web app for council secretaries — login, dashboard placeholder, navigation, log out.

**Inputs:**
- Tech stack: React + TypeScript + Tailwind
- Auth API from T-01.04

**Acceptance criteria:**
- App in `apps/web-council/`
- Vite + React + TypeScript + Tailwind setup
- Login page with email + password fields
- MFA challenge page if MFA is enabled
- Dashboard page (placeholder cards for each module)
- Sidebar navigation with placeholder links: Residents, Applications, Resales, Services, Suppliers, Audit
- Logout button in header
- Auth context that holds JWT and refreshes silently
- 401 response triggers logout
- Tailwind theme uses Forest & Moss palette (forest green primary, terracotta accent)
- Responsive — usable on tablet (council secretary may use one)

**Out of scope:** Module-specific UIs (covered in WP-02 onwards).

#### T-01.10 — CI/CD pipeline

**Goal:** GitHub Actions pipeline that runs lint, typecheck, and tests on every PR; deploys to staging on merge to main.

**Acceptance criteria:**
- `.github/workflows/ci.yml` runs on PR: install, lint, typecheck, test
- `.github/workflows/deploy-staging.yml` runs on push to main: build, push to ECR, update ECS service
- Secrets configured via GitHub Actions secrets (no secrets in repo)
- Build status badge in README
- Deployment to production requires manual workflow trigger with confirmation
- A `npm run check` script that runs everything CI runs (for pre-commit confidence)

**Out of scope:** Multi-environment promotion logic; rollback automation.

#### T-01.11 — Observability baseline

**Goal:** Logging, error tracking, and uptime monitoring configured.

**Acceptance criteria:**
- Pino logger configured with `tenantSlug` and `requestId` in every log
- CloudWatch log group per environment
- Sentry integration in API and web-council; errors captured with tenant context
- Better Stack uptime monitor pinging `/api/v1/health` every 60s
- A `/api/v1/health` endpoint that returns DB connectivity, Redis connectivity, S3 connectivity
- A `/api/v1/health/ready` endpoint for readiness checks (returns 503 during migrations)
- Documented runbook for "service is down" scenario in `docs/runbooks/`

**Out of scope:** Custom metrics dashboards (deferred to post-pilot).

---

## WP-02: Resident Registration

**Effort estimate:** 2 weeks
**Owner:** Senior Engineer (lead), Data Lead (schema design)
**Dependencies:** WP-01 complete

### Goal

Foot soldiers can register existing residents and their occupied stands into the digital register, working both online and offline. The output is a populated land register: the foundation dataset everything else hangs from.

### Tasks

#### T-02.01 — Resident and Stand schema

**Goal:** Define the core entities: `Resident`, `Stand`, and the linking concept (a resident "occupies" zero or more stands).

**Acceptance criteria:**
- `resident` table in tenant schema:
  - `id` (uuid), `created_at`, `updated_at`
  - `id_number` (SA ID, encrypted at rest at column level)
  - `first_name`, `last_name`, `other_names` (nullable)
  - `date_of_birth` (date, nullable — derived from ID where possible)
  - `gender` (enum: `M`, `F`, `X`)
  - `phone_number` (E.164 format)
  - `whatsapp_number` (E.164, nullable)
  - `language_preference` (enum: `nde`, `nso`, `ts`, `en`, etc.)
  - `consent_data_capture` (boolean, mandatory true to create)
  - `consent_marketing` (boolean, default false)
  - `notes` (text, nullable)
  - `captured_by_user_id` (foreign key to users)
  - `verification_status` (enum: `unverified`, `identity_verified`, `council_verified`)
- `stand` table in tenant schema:
  - `id` (uuid), `created_at`, `updated_at`
  - `local_reference` (string — council's existing reference, nullable for new)
  - `gps_latitude` (decimal), `gps_longitude` (decimal)
  - `boundary_geojson` (jsonb, nullable — for future GIS use)
  - `area_square_metres` (decimal, nullable)
  - `address_description` (text — natural language description of where it is)
  - `village_or_section` (string)
  - `notes` (text, nullable)
- `stand_occupancy` table (junction with state):
  - `id`, `created_at`, `ended_at` (nullable — null means current occupant)
  - `stand_id`, `resident_id` (foreign keys)
  - `relationship` (enum: `primary_occupant`, `household_member`, `historic_owner`)
  - `pto_id` (nullable foreign key — null until a PTO is issued)
- Prisma migrations created and tested
- All tables have audit triggers configured
- Indexes on commonly queried fields (resident.phone_number, stand.gps coordinates)

**Out of scope:** PTO issuance (T-03.05); resale linkage (WP-04).

#### T-02.02 — Resident management API

**Goal:** CRUD endpoints for residents, scoped to tenant, accessible to foot soldiers and council secretaries.

**Acceptance criteria:**
- `POST /api/v1/residents` — create resident (foot_soldier, council_secretary)
- `GET /api/v1/residents` — list residents with pagination, search by name or phone (foot_soldier, council_secretary, council_member)
- `GET /api/v1/residents/:id` — get resident detail with stands occupied (any council role)
- `PATCH /api/v1/residents/:id` — update resident (council_secretary only)
- Soft delete only via `DELETE /api/v1/residents/:id` (council_secretary only) — sets `deleted_at`, never hard deletes
- All operations audit-logged
- Reading PII fields (id_number) by council_secretary logs a "PII access" audit event
- ID number is returned in masked form (`xxxxx789012`) unless caller has elevated role and explicit unmask permission
- Validation: SA ID format, phone E.164, mandatory consent_data_capture
- Tests cover happy paths, validation errors, role-based access, audit log entries

**Out of scope:** Bulk import (T-02.07); offline sync (T-02.05).

#### T-02.03 — Stand management API

**Goal:** CRUD endpoints for stands, scoped to tenant.

**Acceptance criteria:**
- `POST /api/v1/stands` — create stand (foot_soldier, council_secretary)
- `GET /api/v1/stands` — list with pagination, filter by village_or_section, geo-bounding-box query support
- `GET /api/v1/stands/:id` — get detail including current and historic occupants
- `PATCH /api/v1/stands/:id` — update (council_secretary only)
- Soft delete only
- All operations audit-logged
- Validation: GPS lat/long ranges, geometry validation if boundary_geojson provided
- Tests cover happy paths, validation, role checks

**Out of scope:** Map visualisation (T-02.06).

#### T-02.04 — Occupancy linking

**Goal:** API to link residents to stands.

**Acceptance criteria:**
- `POST /api/v1/stands/:standId/occupants` — add occupancy (foot_soldier, council_secretary)
- `PATCH /api/v1/stand-occupancies/:id` — update relationship or end occupancy
- `GET /api/v1/residents/:id/stands` — list stands a resident occupies
- `GET /api/v1/stands/:id/occupants` — list occupants of a stand (current + historic)
- Cannot add a duplicate active primary_occupant for the same stand (validation)
- Audit-logged
- Tests cover linking, ending occupancy, duplicate prevention

**Out of scope:** PTO generation (T-03.05).

#### T-02.05 — Mobile PWA scaffold + offline-capable foot soldier UI

**Goal:** A mobile PWA that foot soldiers use to register residents and stands in the field. Must work offline and sync when connectivity returns.

**Inputs:**
- Tech stack: React + Vite + Workbox (PWA)
- APIs from T-02.02, T-02.03, T-02.04

**Acceptance criteria:**
- App in `apps/mobile-pwa/`
- Vite + React + TypeScript + Tailwind setup
- Workbox configured for service worker; offline shell cached
- Login screen
- Foot soldier home screen with: register new resident, register new stand, link resident to stand
- Resident registration form with: ID, names, phone, language preference, consent capture
- Stand registration form with: GPS capture (uses browser geolocation), description, village
- Forms work offline: data stored in IndexedDB; sync queue managed
- Sync indicator visible: "X items pending sync"
- On reconnection, queued items POSTed to API; conflicts surfaced to foot soldier
- Photos can be attached to resident records (camera or gallery); held locally and uploaded on sync
- App installable as PWA (manifest, icons, theme)
- Tested on Android Chrome (primary target)

**Out of scope:** PTO viewing (later); resale flow (WP-04).

#### T-02.06 — Council secretary view of residents and stands

**Goal:** Web UI for the council secretary to view, search, and manage residents and stands.

**Acceptance criteria:**
- In `apps/web-council/`, modules for Residents and Stands
- Residents list with search by name and phone, pagination
- Resident detail view: profile, occupied stands, audit log of changes
- Stands list with filter by village, search
- Stand detail view: profile, current and historic occupants, location on simple map
- Map view uses Leaflet with OpenStreetMap tiles (no Google Maps API costs in pilot)
- Edit resident and stand details
- All operations honour role permissions

**Out of scope:** Application processing UI (WP-03).

#### T-02.07 — Bulk import of existing residents

**Goal:** A one-time bulk import tool to digitise the council's existing paper register.

**Acceptance criteria:**
- CSV upload endpoint: `POST /api/v1/residents/bulk-import` (council_secretary only)
- CSV format documented in `docs/templates/resident-import-template.csv`
- Required columns: id_number, first_name, last_name, phone_number, language_preference, village
- Optional columns: other_names, date_of_birth, gender, whatsapp_number, notes
- Pre-flight validation: returns row-level errors before any rows are inserted
- All rows inserted in a single transaction; if any fail, none are saved
- Audit log records bulk import event with row count
- Each imported resident has `verification_status = unverified` (council secretary verifies later)

**Out of scope:** Bulk import of stands (do separately if needed); deduplication (manual for pilot).

---

## WP-03: Land Application & PTO

**Effort estimate:** 3 weeks
**Owner:** Senior Engineer (lead), CEO (council process design)
**Dependencies:** WP-01, WP-02 complete

### Goal

A resident can apply for a stand. The council reviews and approves digitally. A cryptographically signed PTO is issued. Both digital and paper versions are produced. The register reflects the new PTO.

### Tasks

#### T-03.01 — Application schema

**Goal:** Define the application entity and its workflow states.

**Acceptance criteria:**
- `land_application` table in tenant schema:
  - `id`, `created_at`, `updated_at`
  - `applicant_resident_id` (foreign key — applicant must be a resident)
  - `application_type` (enum: `new_stand`, `additional_stand`, `regularisation`)
  - `requested_location_description` (text)
  - `requested_size_square_metres` (decimal, nullable)
  - `household_size` (integer)
  - `reason` (text)
  - `status` (enum: `submitted`, `under_review`, `approved`, `rejected`, `deferred`, `withdrawn`)
  - `submitted_at`, `reviewed_at` (nullable), `decided_at` (nullable)
  - `decision_notes` (text, nullable)
  - `decided_by_user_id` (nullable)
  - `allocated_stand_id` (nullable foreign key — set when approved and stand allocated)
  - `pto_id` (nullable foreign key — set when PTO issued)
- State transitions documented and enforced in service layer (cannot go from `approved` directly to `rejected`, etc.)
- Audit log captures every state transition with timestamp and actor

**Out of scope:** Application form rendering (T-03.03).

#### T-03.02 — Application API

**Goal:** Endpoints for submitting, reviewing, approving, and rejecting applications.

**Acceptance criteria:**
- `POST /api/v1/applications` — submit (resident or foot_soldier on resident's behalf)
- `GET /api/v1/applications` — list with filter by status (council_secretary, council_member)
- `GET /api/v1/applications/:id` — detail
- `PATCH /api/v1/applications/:id/status` — update status with notes (council_secretary only)
  - Enforces valid state transitions
  - On `approved`: requires `allocated_stand_id` in body
- `POST /api/v1/applications/:id/withdraw` — withdraw (applicant resident only)
- All operations audit-logged with full state transition trail
- Validation: cannot submit for another resident unless foot_soldier; required fields per application type
- Tests cover happy path, invalid transitions, role checks, withdrawal

**Out of scope:** Notifications (T-03.04); PTO issuance (T-03.05).

#### T-03.03 — Application UI (mobile + council)

**Goal:** Resident applies via mobile (with foot soldier assistance for non-app users); council secretary reviews and decides via web.

**Acceptance criteria:**
- Mobile PWA: residents can submit application; foot soldiers can submit on resident's behalf (selecting from existing resident records)
- Form fields per schema; clear language with vernacular options
- Application status tracking in mobile app (resident sees their submission state)
- Web council app: applications list with filter, search, kanban-style status columns
- Application detail view: applicant profile, request details, history of state changes
- Decision panel: approve (requires stand selection or creation), reject (requires reason), defer (requires reason)
- All inline with web-council Tailwind theme

**Out of scope:** Bulk operations on applications.

#### T-03.04 — Application notifications

**Goal:** Applicants notified at every state transition via SMS and WhatsApp; council notified of new submissions.

**Acceptance criteria:**
- On submission: SMS + WhatsApp to applicant confirming receipt with reference number; notification to council secretary
- On approval: SMS + WhatsApp to applicant with PTO issuance date
- On rejection: SMS + WhatsApp to applicant with reason summary
- On deferral: SMS + WhatsApp with reason and next steps
- Templates support `nde`, `nso`, `ts`, `en` based on resident's language preference
- Notification dispatch is queued (BullMQ); failures retried with exponential backoff
- Failed notifications logged but don't block the underlying state transition

**Out of scope:** Push notifications to PWA (deferred); email notifications.

#### T-03.05 — PTO entity and issuance

**Goal:** PTO records are created on application approval, with cryptographic signing.

**Acceptance criteria:**
- `pto` table in tenant schema:
  - `id`, `created_at`, `superseded_at` (nullable), `superseded_by_pto_id` (nullable)
  - `application_id` (foreign key)
  - `resident_id`, `stand_id` (foreign keys)
  - `issued_by_user_id` (council_secretary)
  - `signed_payload_json` (jsonb — canonical signed JSON)
  - `signature_base64` (text)
  - `pdf_document_id` (foreign key to documents)
- A PTO record is immutable once created (UPDATE permitted only on `superseded_at` and `superseded_by_pto_id`)
- Endpoint: `POST /api/v1/applications/:id/issue-pto` (council_secretary only)
  - Validates application is in `approved` state with allocated_stand_id
  - Generates canonical signed payload (resident name, ID hash, stand reference, allocation date, council ID)
  - Signs via tenant signing key (KMS)
  - Generates PDF (T-03.07)
  - Creates PTO record
  - Updates application with pto_id
  - Updates stand_occupancy with pto_id
  - Audit-logs
- Endpoint: `GET /api/v1/ptos/:id` — returns PTO with verification info
- Endpoint: `GET /api/v1/ptos/verify` — accepts signed payload, returns valid/invalid (public — no auth required)
- Tests cover issuance flow, signature verification, invalid state rejection

**Out of scope:** Bulk PTO operations; superseding (handled in WP-04 resale).

#### T-03.06 — PTO PDF generation

**Goal:** A printable PDF version of every PTO with embedded QR code for verification.

**Acceptance criteria:**
- PDF rendered using Puppeteer (headless Chrome) from an HTML template
- Template in `apps/api/src/modules/register/pto-template.html`
- Layout includes: kingdom crest placeholder, council name, resident details, stand details, allocation date, council secretary signature line, QR code
- QR code encodes the verification URL: `https://l2l.app/verify/<pto-id>`
- PDF stored in S3 via document vault
- PDF accessible via `GET /api/v1/ptos/:id/pdf` (returns signed URL with 5-minute expiry)
- Print-friendly: A4, single page, professional layout

**Out of scope:** Custom templates per kingdom (single template in pilot).

#### T-03.07 — Manual fallback documentation

**Goal:** Every step of the application + PTO flow has a documented manual fallback.

**Acceptance criteria:**
- `docs/fallbacks/land-application.md` documents:
  - How a foot soldier captures an application on paper if app is offline
  - The paper template (in `docs/templates/`)
  - How the council secretary records a decision on paper
  - How the data is back-entered within 48 hours
  - How the audit log captures the offline period
- `docs/fallbacks/pto-issuance.md` documents:
  - How a paper PTO is hand-issued from a template if the system is down
  - The paper template (signed by council secretary, with kingdom seal)
  - How the digital PTO is back-issued and matched to the paper one
- Templates included as PDF in `docs/templates/`

**Out of scope:** Automated fallback detection (manual processes only).

---

## WP-04: Resale Workflow

**Effort estimate:** 3 weeks
**Owner:** Senior Engineer (lead), CEO (council approval flow)
**Dependencies:** WP-01, WP-03 complete

### Goal

A resident can list their stand or house for sale. A buyer expresses interest. The council approves the transfer. Funds flow through escrow. The PTO updates to the new occupant.

### Tasks

#### T-04.01 — Listing schema

**Goal:** Resale listings entity with state.

**Acceptance criteria:**
- `resale_listing` table in tenant schema:
  - `id`, `created_at`, `updated_at`
  - `seller_resident_id`, `stand_id`, `pto_id` (foreign keys)
  - `listing_type` (enum: `vacant_stand`, `built_property`)
  - `asking_price_zar` (integer cents)
  - `description` (text), `negotiable` (boolean)
  - `status` (enum: `draft`, `pending_council_approval`, `live`, `under_offer`, `transfer_pending`, `transferred`, `withdrawn`, `expired`)
  - `expires_at` (timestamp — listings auto-expire after 90 days)
  - `photos` (array of document_ids)
- `resale_offer` table:
  - `id`, `created_at`
  - `listing_id`, `buyer_resident_id` (foreign keys — buyer must be a registered resident)
  - `offer_amount_zar` (integer cents)
  - `status` (enum: `submitted`, `accepted`, `rejected`, `withdrawn`)
  - `decided_at` (nullable), `notes` (text, nullable)
- Validations: seller must currently occupy the stand with valid PTO; cannot list while another listing is `live` for same stand

**Out of scope:** Property valuations; market analytics.

#### T-04.02 — Resale API and flow

**Goal:** Endpoints to manage the resale lifecycle.

**Acceptance criteria:**
- `POST /api/v1/resale-listings` — create draft (seller resident or council secretary on behalf)
- `POST /api/v1/resale-listings/:id/submit` — submit for council approval
- `PATCH /api/v1/resale-listings/:id/approve` — approve (council_secretary only) → status `live`
- `PATCH /api/v1/resale-listings/:id/reject` — reject with reason (council_secretary only)
- `GET /api/v1/resale-listings` — list `live` listings (any role)
- `GET /api/v1/resale-listings/:id` — detail
- `POST /api/v1/resale-listings/:id/offers` — submit offer (resident; cannot offer on own listing)
- `PATCH /api/v1/offers/:id/accept` — seller accepts → listing status `under_offer`
- `PATCH /api/v1/offers/:id/reject` — seller rejects
- `POST /api/v1/resale-listings/:id/initiate-transfer` — start escrow process (T-04.04)
- All operations audit-logged
- Notifications dispatched at every state change (similar to T-03.04)

**Out of scope:** Counteroffers (single-shot offers in pilot).

#### T-04.03 — Resale UI (mobile + council)

**Goal:** Sellers list their property; buyers browse and offer; council reviews and approves.

**Acceptance criteria:**
- Mobile PWA:
  - Sellers create listings with photos and details
  - Buyers browse listings with filter by location, price, type
  - Buyers submit offers
  - Both sides see offer state and notifications
- Web council app:
  - Listings awaiting approval shown prominently
  - Council secretary reviews details, approves or rejects with notes
  - Active listings tracked with state
- Listing detail page accessible to buyers shows photos, description, asking price, kingdom-of-record (council badge)

**Out of scope:** In-app chat between buyer and seller (use phone/WhatsApp directly in pilot).

#### T-04.04 — Escrow integration

**Goal:** Buyer payment held in escrow via PSP until council approves the transfer.

**Acceptance criteria:**
- PSP abstraction layer in `shared/payments/`
- Pilot supports either Yoco or Ozow — config-driven
- `POST /api/v1/resale-listings/:id/initiate-transfer` triggers:
  - Calculates total: offer amount + L2L commission (default 2.5%)
  - Generates payment link via PSP
  - Sends link to buyer via SMS + WhatsApp
- PSP webhook handler at `POST /api/v1/webhooks/psp/payment-completed`
  - Verifies signature
  - Marks transfer as `payment_received`
  - Notifies council secretary for final approval
- `POST /api/v1/transfers/:id/approve-completion` (council_secretary only):
  - Releases funds to seller (minus L2L commission)
  - Updates PTO: supersedes old, issues new to buyer (calls T-03.05 PTO issuance flow)
  - Updates stand_occupancy
  - Updates listing status to `transferred`
- Refund flow if council rejects transfer or seller withdraws after payment
- Tests use a mock PSP

**Out of scope:** Multiple payment instalments (single payment in pilot).

#### T-04.05 — PTO transfer mechanics

**Goal:** When a resale completes, the old PTO is superseded and a new one issued to the buyer.

**Acceptance criteria:**
- Existing PTO record gets `superseded_at` set (record itself remains immutable otherwise)
- A new PTO is issued via the same flow as T-03.05, with `superseded_pto_id` set on the new record
- The `stand_occupancy` table reflects: old occupant ended, new occupant active
- Audit log records the chain: old PTO → resale listing → offer → transfer → new PTO
- Verification of either PTO returns its full lineage

**Out of scope:** Inheritance flows (deceased estate transfer — deferred).

#### T-04.06 — Resale fallback documentation

**Goal:** Every step has a documented manual fallback in `docs/fallbacks/resale.md`.

**Acceptance criteria:**
- Documented: how council mediates a resale entirely manually if system is down
- Documented: how to back-enter a completed off-platform resale
- Paper templates in `docs/templates/`

---

## WP-05: Marketplace + Suppliers

**Effort estimate:** 3 weeks
**Owner:** Senior Engineer (lead), CEO (supplier relationship)
**Dependencies:** WP-01 complete (can run parallel with WP-03/04)

### Goal

Service providers (architects, builders) onboard and accept bookings; suppliers (hardware stores) receive quote requests via the Supplier Adapter and respond. L2L earns take rate on bookings and commission on supplier sales.

### Tasks

#### T-05.01 — Provider and Supplier schemas

**Goal:** Define the platform-owned entities for providers and suppliers (in `public` schema).

**Acceptance criteria:**
- `service_provider` table in `public` schema:
  - `id`, `created_at`, `updated_at`
  - `business_name`, `cipc_number` (nullable for sole traders), `vat_number` (nullable)
  - `primary_contact_user_id`
  - `categories` (array — gardening, plumbing, electrical, building, fencing, etc.)
  - `geographic_coverage` (array of tenant slugs the provider serves)
  - `verification_status` (enum: `unverified`, `documents_submitted`, `verified`, `suspended`)
  - `bank_details_encrypted` (jsonb encrypted at rest)
  - `created_by_user_id`
- `supplier` table in `public` schema:
  - `id`, `created_at`, `updated_at`
  - `business_name`, `cipc_number`, `vat_number`
  - `primary_contact_user_id`
  - `category` (enum: `hardware_chain`, `regional_chain`, `local_store`)
  - `geographic_coverage` (array of tenant slugs)
  - `integration_mechanism` (enum: `api`, `whatsapp_template`, `email_template`, `manual`)
  - `integration_config` (jsonb — varies by mechanism)
  - `commission_rate_basis_points` (integer — e.g., 250 = 2.5%)
  - `commission_settlement_cadence` (enum: `per_transaction`, `weekly`, `monthly`)
  - `verification_status`
- `service_booking` table in `public` schema:
  - `id`, `created_at`, `updated_at`
  - `tenant_slug` (the council the customer is from — for revenue attribution)
  - `customer_resident_id` (foreign key references tenant schema — store as composite key tenant_slug + resident_id)
  - `provider_id`
  - `category`, `description`, `requested_date`
  - `quote_amount_zar`, `take_rate_basis_points`
  - `status` (enum: `quote_requested`, `quoted`, `accepted`, `in_progress`, `completed`, `disputed`, `cancelled`)
  - `escrow_payment_id` (nullable)
  - `customer_rating` (nullable 1-5), `provider_rating` (nullable 1-5)
- `supplier_quote_request` table in `public` schema:
  - `id`, `created_at`
  - `tenant_slug`, `requested_by_user_id`
  - `basket_json` (jsonb — list of items)
  - `dispatched_to_supplier_ids` (array)
  - `status` (enum: `pending`, `dispatched`, `responses_received`, `customer_decided`, `expired`)
- `supplier_quote_response` table:
  - `id`, `created_at`
  - `request_id`, `supplier_id`
  - `received_via` (enum matching integration_mechanism)
  - `quote_amount_zar`, `availability`, `lead_time_days`
  - `raw_response_text` (preserved as received), `parsed_response_json`
- Cross-schema reference: bookings reference `tenant_slug + customer_resident_id` since residents are in tenant schemas

**Out of scope:** Provider portfolios; service category trees beyond enums.

#### T-05.02 — Provider onboarding API

**Goal:** Service providers register, submit verification documents, get verified.

**Acceptance criteria:**
- `POST /api/v1/providers` — register (creates user + provider record)
- `POST /api/v1/providers/:id/documents` — upload verification documents (CIPC, ID, references)
- `PATCH /api/v1/providers/:id/verification` — update status (founder role only in pilot)
- `GET /api/v1/providers` — list with filter by category, geographic coverage
- `GET /api/v1/providers/:id` — detail with ratings summary
- Geographic coverage validated against existing tenant slugs
- Bank details encrypted before storage
- Tests cover registration, document upload, verification flow

**Out of scope:** Self-serve verification (founder-led in pilot).

#### T-05.03 — Service booking flow

**Goal:** Customer requests work, providers quote, customer accepts, escrow holds funds, completion confirmed, payout.

**Acceptance criteria:**
- `POST /api/v1/services/bookings` — customer creates request (resident role)
- System matches providers by category + geographic coverage; sends them notification
- `POST /api/v1/services/bookings/:id/quote` — provider submits quote (provider role)
- Customer sees all quotes, can accept one: `PATCH /api/v1/services/bookings/:id/accept-quote`
- On acceptance for first 3 bookings between this customer and provider: payment-via-platform mandatory; escrow flow initiated
- After 3 bookings: customer can opt for direct payment (with reduced platform protections)
- `POST /api/v1/services/bookings/:id/start` — provider marks work started
- `POST /api/v1/services/bookings/:id/complete` — both parties must confirm completion
- On completion: escrow released to provider (minus take rate based on category); ratings prompt sent to both parties
- Auto-release after 7 days of no dispute if work was marked complete by provider
- Dispute path: `POST /api/v1/services/bookings/:id/dispute` — escalates to L2L mediation
- Tests cover happy path, dispute, auto-release, role checks

**Out of scope:** Sub-provider relationships; recurring service contracts.

#### T-05.04 — Take rate calculation

**Goal:** Tiered take rate based on service category and quote amount.

**Acceptance criteria:**
- Take rate config in `apps/api/src/modules/services/take-rate-config.ts`
- Tiers (matches Phase B addendum):
  - Recurring small (gardening, cleaning, security): 10-12% — config 1100 basis points
  - Mid jobs (plumbing, electrical, repairs): 6-8% — config 700 basis points
  - Large jobs (bricklaying, fencing, borehole): 3-5% — config 400 basis points
  - Architects: 5-7% — config 600 basis points
- Take rate locked at booking acceptance time; doesn't change if config changes later
- Tests verify each tier calculates correctly

**Out of scope:** Dynamic pricing (fixed config in pilot).

#### T-05.05 — Supplier Adapter — core abstraction

**Goal:** Single internal contract for supplier integration with multiple mechanism implementations.

**Acceptance criteria:**
- `apps/api/src/adapters/supplier-adapter/index.ts` exports a `SupplierAdapter` interface:
  - `dispatchQuoteRequest(supplier, request): Promise<DispatchResult>`
  - `parseIncomingResponse(supplier, payload): ParsedQuoteResponse`
- Implementations:
  - `api-adapter.ts` — HTTP POST to supplier's endpoint (config-driven URL, auth)
  - `whatsapp-adapter.ts` — sends a structured WhatsApp template message; parses incoming response via webhook
  - `email-adapter.ts` — sends templated email; parses incoming structured email reply
  - `manual-adapter.ts` — adds to a "manual queue" for founder dispatch via WhatsApp/phone; allows manual entry of response
- A factory: `createSupplierAdapter(supplier.integration_mechanism)` returns the correct implementation
- Each implementation tested with a mock supplier
- All dispatch and response events audit-logged in `public` schema

**Out of scope:** Real Cashbuild API integration (pending agreement); proprietary EDI formats.

#### T-05.06 — Quote-out / Quote-in flow

**Goal:** Customer or provider builds a basket; quote requests go out via Adapter; responses come back; customer compares.

**Acceptance criteria:**
- `POST /api/v1/suppliers/quote-requests` — create request with basket
- System identifies eligible suppliers by tenant + basket categories
- Dispatches via Adapter to each (background job)
- Webhook endpoints for incoming responses:
  - `POST /api/v1/webhooks/supplier-adapter/whatsapp` — WhatsApp Business webhook
  - `POST /api/v1/webhooks/supplier-adapter/email` — incoming email parsing (via SES inbound)
- Manual entry for `manual` mechanism: `POST /api/v1/suppliers/quote-requests/:id/manual-response`
- All responses captured in `supplier_quote_response`
- Customer sees comparison: `GET /api/v1/suppliers/quote-requests/:id` — returns normalised quotes
- `POST /api/v1/suppliers/quote-requests/:id/select-supplier` — customer chooses
- Notification to selected supplier (acceptance) and others (decline)
- Tests cover dispatch via each mechanism, response parsing, comparison

**Out of scope:** Auto-acceptance based on price; bulk quote requests.

#### T-05.07 — Commission tracking and invoicing

**Goal:** When supplier confirms a fulfilled sale, L2L invoices commission per agreed cadence.

**Acceptance criteria:**
- `POST /api/v1/suppliers/sales-confirmations` — supplier confirms a sale (via API or manual entry)
- Schema: `supplier_sale` — supplier_id, quote_request_id, fulfilled_amount_zar, customer_resident reference, commission_amount_zar, status (`pending_invoice`, `invoiced`, `paid`)
- Background job runs per cadence (per-transaction / weekly / monthly):
  - Aggregates pending sales per supplier
  - Generates invoice (PDF stored in document vault)
  - Sends invoice via supplier's preferred channel (email or WhatsApp)
  - Marks sales as `invoiced`
- `POST /api/v1/suppliers/payments` — record incoming commission payment (founder role)
- Marks corresponding sales as `paid`
- Reporting: total earned, total invoiced, total outstanding per supplier
- Tests cover sale confirmation, invoice generation, payment matching

**Out of scope:** Automated reconciliation against bank statements (manual in pilot).

#### T-05.08 — Provider and supplier UIs

**Goal:** Provider portal for managing bookings; council secretary view of marketplace activity.

**Acceptance criteria:**
- Provider portal in `apps/web-council/` (reuses chrome) — provider role sees:
  - Active booking requests
  - Submit quotes
  - Manage in-progress bookings
  - Bank details (read-only after first set; founder-mediated changes)
  - Ratings and reputation
- Council secretary view:
  - Marketplace activity in their council (bookings, providers, suppliers operating)
  - Reputation visible per provider
  - Cannot modify provider data (platform-owned) but can flag for review
- Suppliers do NOT have a portal in pilot (they integrate via Adapter mechanisms)

**Out of scope:** Provider self-service profile management beyond basics; supplier portal.

#### T-05.09 — Marketplace fallback documentation

**Goal:** `docs/fallbacks/services-marketplace.md` and `docs/fallbacks/supplier-quotes.md` document manual processes.

**Acceptance criteria:**
- Documented: how a service booking is mediated entirely off-platform if system is down
- Documented: how supplier quote-out runs entirely manually (founder uses WhatsApp directly)
- Paper templates for booking confirmation and supplier quote tracking

---

## Cross-Cutting Tasks (Apply Throughout)

These are not WP-specific; they apply across the build.

### CC-01 — Architecture Decision Records (ADRs)

For every significant architectural decision made during build, create an ADR in `docs/adr/`:
- Numbered: `0001-tenancy-model.md`, `0002-payment-psp.md`, etc.
- Format: Context, Decision, Consequences, Alternatives Considered
- Pre-pilot: ADRs 0001-0010 already locked from Phase A-D documents (transcribe these)

### CC-02 — Performance baseline

By end of WP-02:
- Document p50/p95 response times for key endpoints in a baseline doc
- Set up baseline alerts for regressions (>2x baseline triggers warning)

### CC-03 — Security review checklist

Before pilot launch:
- All endpoints checked for: auth required, role checked, tenant scoped, PII access logged
- All forms checked for: zod validation, CSRF protection
- All file uploads checked for: type validation, size limits, virus scan (ClamAV or AWS-native)
- Penetration test by external party 30 days before launch

### CC-04 — POPIA documentation

Before pilot launch:
- Privacy policy drafted and reviewed
- Information Officer designated and registered with Information Regulator
- Data Processing Agreement template prepared for council partnerships
- Data breach response runbook in `docs/runbooks/data-breach.md`

### CC-05 — User documentation

Before pilot launch:
- Council secretary user guide
- Foot soldier user guide (visual / in vernacular where possible)
- Resident FAQ
- Provider onboarding guide

---

## Definition of Done — Pilot

The pilot is "done and ready to launch" when:

- [ ] All WP-01 through WP-05 acceptance criteria met
- [ ] All cross-cutting tasks complete
- [ ] End-to-end test of all three workflows (resident registration, application, resale) passes in staging
- [ ] End-to-end test of services booking with payment-via-platform passes
- [ ] End-to-end test of supplier quote-out via at least 2 mechanisms (e.g., WhatsApp + manual) passes
- [ ] Manual fallback procedures documented and rehearsed with council secretary
- [ ] Foot soldiers (5+) trained and have completed at least 1 real registration each
- [ ] Council secretary trained and has issued at least 1 PTO end-to-end in staging
- [ ] Two anchor suppliers signed and integrated (one regional chain + one local store)
- [ ] Penetration test passed
- [ ] POPIA documentation in place
- [ ] Backup and disaster recovery tested (restore from backup successful)
- [ ] On-call runbook documented; founders know who's primary on launch day

---

## Open Questions to Resolve During Build

These were flagged in Phases A-B and need closure during execution:

1. **PSP selection** — Yoco vs Ozow — decide before WP-04 starts
2. **Council secretary's MFA channel** — TOTP only or also SMS fallback for shared phone scenarios?
3. **Foot soldier authentication** — full account each, or shared device with PIN per soldier?
4. **PTO retention period** — how long do we keep superseded PTOs? (Recommend: indefinitely; they're historical record)
5. **Supplier commission settlement when supplier doesn't pay on time** — when is a commission written off?
6. **Cross-border resale** — what happens when a buyer is from a different kingdom or province? (Pilot: same-kingdom only)
7. **Foot soldier compensation model** — flat fee per registration, salary, council-paid, or L2L-paid? (Affects partnership agreement)

---

**Document end. Companion: CLAUDE.md.**
