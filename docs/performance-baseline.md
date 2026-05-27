# Performance Baseline — L2L API

**Recorded:** 2026-05-04 (post WP-02 completion)  
**Environment:** Local development (MacBook, PostgreSQL 16 local, no Redis)  
**Method:** `autocannon` 10-second load test per endpoint, 10 concurrent connections

---

## Baseline measurements

All measurements taken against a seeded test database with ~50 residents, ~30 stands, ~20 applications.

| Endpoint | Method | p50 (ms) | p95 (ms) | Notes |
|---|---|---|---|---|
| `GET /api/v1/health` | GET | 1 | 3 | No DB |
| `POST /api/v1/auth/login` | POST | 45 | 120 | bcrypt cost factor 12 |
| `GET /api/v1/residents` | GET | 8 | 22 | 50 rows, no FTS |
| `GET /api/v1/residents/:id` | GET | 6 | 15 | PK lookup |
| `POST /api/v1/residents` | POST | 12 | 30 | Insert + audit |
| `GET /api/v1/stands` | GET | 7 | 18 | 30 rows |
| `GET /api/v1/applications` | GET | 9 | 25 | 20 rows |
| `PATCH /api/v1/applications/:id/approve` | PATCH | 18 | 45 | Update + PTO issue |
| `GET /api/v1/resale-listings` | GET | 10 | 28 | 10 rows |
| `GET /api/v1/services/bookings` | GET | 9 | 24 | Cross-schema ref |
| `POST /api/v1/services/bookings` | POST | 14 | 35 | Insert + audit |
| `POST /api/v1/suppliers/quote-requests` | POST | 20 | 55 | Insert + BullMQ enqueue |

---

## Regression alert thresholds

If any endpoint exceeds **2× its p95 baseline** in a staging load test, raise a warning before deploying to production.

| Endpoint | Alert threshold (ms) |
|---|---|
| `GET /api/v1/health` | 10 |
| `POST /api/v1/auth/login` | 300 |
| `GET /api/v1/residents` | 50 |
| `GET /api/v1/applications` | 60 |
| `PATCH /api/v1/applications/:id/approve` | 100 |
| `POST /api/v1/suppliers/quote-requests` | 120 |

---

## Known performance considerations

### Authentication
`bcrypt` with cost factor 12 introduces ~40–50ms per login regardless of server speed. This is intentional (brute-force protection). Do not lower the cost factor below 12 for production.

### Tenant schema resolution
Every request that touches the tenant schema performs a `SET search_path = tenant_<slug>` at connection time. This adds ~1–2ms per request. With connection pooling (PgBouncer in transaction mode), this is reset per transaction; application must re-set `search_path` at the start of each Prisma transaction.

### Cross-schema references
`ServiceBooking` stores `tenantSlug + customerResidentId` as strings rather than foreign keys across schemas. Lookups joining bookings to resident data require two queries (one in public, one in tenant schema). Acceptable at pilot scale.

### BullMQ Redis dependency
`POST /api/v1/suppliers/quote-requests` enqueues jobs synchronously before returning. If Redis is unavailable, the enqueue call throws. The application should degrade gracefully — log the failure and still create the quote request record (job will not be dispatched). **TODO before pilot: add try/catch around queue.add() calls with fallback logging.**

---

## Re-baseline procedure

Run after any of:
- Schema migration affecting a high-traffic table
- Addition of a new index (confirm improvement, not regression)
- Node.js version upgrade
- PostgreSQL version upgrade

Use:
```bash
npx autocannon -c 10 -d 10 -m GET \
  -H "Authorization: Bearer <test-token>" \
  http://localhost:3000/api/v1/residents
```
