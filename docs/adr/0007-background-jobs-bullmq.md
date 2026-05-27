# ADR 0007 — Background jobs via BullMQ on Redis

**Status:** Accepted  
**Date:** 2026-03-10  
**Deciders:** L2L Founders

---

## Context

Several operations must run outside the HTTP request–response cycle:
- WhatsApp and SMS notification dispatch (rate-limited; should not block API responses)
- Supplier quote dispatch (may take 10+ seconds per supplier for email delivery)
- Escrow auto-release after 7 days

These operations need:
- Retry with backoff on failure
- Visibility into job status (failed, pending, completed)
- Non-blocking dispatch from the API handler

## Decision

**BullMQ on Redis** for all background jobs.

Pattern:
- API handlers call `queue.add(...)` or `void enqueueXxx(...)` and return immediately
- Workers run in the same Node.js process (separate Worker instances), started in `main.ts` when `REDIS_URL` is present
- In-process workers are acceptable for pilot scale; extract to separate worker processes if queue depth exceeds 10 000 jobs

Queues defined:
- `notifications` — WhatsApp/SMS dispatch
- `supplier-dispatch` — per-supplier quote request dispatch

## Consequences

**Positive:**
- Non-blocking: API response times are not affected by slow WhatsApp API or SMTP
- Automatic retries with exponential backoff (3–5 attempts)
- Redis persistence means jobs survive API restarts
- BullMQ's UI (Bull Board) can be wired up for operational visibility

**Negative:**
- Redis adds an infrastructure dependency; not available in bare development without Docker
- Workers in the same process mean a CPU-intensive job could affect API latency (acceptable at pilot scale)
- If Redis is unavailable, jobs are lost — graceful degradation needed (currently: `void dispatch...()` means failures are silent)

## Alternatives considered

**Synchronous dispatch:** Rejected. A slow WhatsApp API call would block the API response thread; unacceptable UX.

**AWS SQS / SNS:** Rejected. Adds AWS-specific complexity and cost for a pilot. Redis is already available as a dependency (BullMQ).

**In-memory queues (p-queue, etc.):** Rejected. Not persistent across restarts; jobs lost on deploy.
