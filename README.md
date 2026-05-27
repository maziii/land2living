# Land2Living (L2L)

[![CI](https://github.com/land2living/land2living/actions/workflows/ci.yml/badge.svg)](https://github.com/land2living/land2living/actions/workflows/ci.yml)

A council-endorsed digital registry, services marketplace, and supplier orchestration platform for communal land in South Africa.

## Prerequisites

- Node.js >= 20
- npm >= 10
- Docker + Docker Compose

## Local dev quickstart

```bash
# 1. Install dependencies
npm install

# 2. Copy env vars
cp .env.example .env

# 3. Start backing services (Postgres, Redis, MinIO, MailHog)
npm run dev:up

# 4. Run migrations + seed a dev user (safe to re-run)
npm run dev:seed

# 5a. Start the API  (terminal 1)
npm run dev:api       # http://localhost:3000

# 5b. Start the web app  (terminal 2)
npm run dev:web       # http://localhost:3001
```

**Dev login credentials** (created by `dev:seed`):

| Field    | Value                    |
|----------|--------------------------|
| Email    | `secretary@ndebele.dev`  |
| Password | `L2Ldev1234!`            |
| Tenant   | `ndebele`                |
| Role     | `council_secretary`      |

**Local service URLs:**

| Service     | URL                                         |
|-------------|---------------------------------------------|
| API         | http://localhost:3000                       |
| Web council | http://localhost:3001                       |
| MailHog UI  | http://localhost:8025 (caught reset emails) |
| MinIO UI    | http://localhost:9001                       |

## Scripts (run from root)

```bash
npm run typecheck     # TypeScript type-check all workspaces
npm run lint          # ESLint all workspaces
npm run format        # Prettier write all files
npm run format:check  # Prettier check (used in CI)
npm run test          # Run tests across all workspaces
npm run check         # lint + typecheck + test  ← run before pushing
```

## Docker services

```bash
npm run dev:up     # Start PostgreSQL 16, Redis 7, MinIO, MailHog
npm run dev:down   # Stop services
npm run dev:reset  # Wipe volumes and restart from scratch
```

> See `infra/docker/docker-compose.yml` for configuration.

## Tenant management

```bash
# Seed the dev environment (runs migrations + creates ndebele + dev user)
npm run dev:seed

# Create a new tenant schema
npx tsx scripts/seed-tenant.ts --slug <council-slug>

# Apply pending migrations to all existing tenant schemas
npx tsx scripts/migrate-tenants.ts
```

## Workspaces

| Workspace | Path | Description |
|---|---|---|
| `@l2l/api` | `apps/api` | Fastify backend (Node.js 20 + TypeScript + Prisma) |
| `@l2l/web-council` | `apps/web-council` | Council admin web app (React + Vite + Tailwind) |
| `@l2l/mobile-pwa` | `apps/mobile-pwa` | Foot soldier + resident mobile PWA |
| `@l2l/shared-schemas` | `packages/shared-schemas` | Shared Zod schemas |
| `@l2l/shared-types` | `packages/shared-types` | Shared TypeScript types |

## CI / CD

| Trigger | Workflow | What it does |
|---|---|---|
| PR opened / updated | `ci.yml` | lint + typecheck + test |
| Push to `main` | `deploy-staging.yml` | Build Docker image, push to ECR, deploy to ECS staging |
| Manual (`workflow_dispatch`) | `deploy-production.yml` | Deploy a tagged image to ECS production (requires `DEPLOY` confirmation) |

Required GitHub Actions secrets: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `ECR_REPOSITORY`, `ECS_CLUSTER_STAGING`, `ECS_SERVICE_STAGING`, `ECS_CLUSTER_PRODUCTION`, `ECS_SERVICE_PRODUCTION`.

## Architecture

Modular monolith — single deployable API, cleanly separated by module. Multi-tenant via schema-per-tenant on PostgreSQL. See `CLAUDE.md` for full architecture principles and locked decisions.

## Docs

- `docs/adr/` — Architecture Decision Records
- `docs/fallbacks/` — Manual fallback procedures for each workflow
- `docs/templates/` — Paper form templates
- `docs/runbooks/` — Operational runbooks
