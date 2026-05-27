# ADR 0005 — Escrow and dual-confirmation for service bookings

**Status:** Accepted  
**Date:** 2026-03-01  
**Deciders:** L2L Founders

---

## Context

The services marketplace handles payments between residents (customers) and service providers. Key risks:
- Provider does the work but customer refuses to confirm completion (payment held indefinitely)
- Customer pays but provider never shows up (no recourse)
- Provider disputes quality; payment released too early

We also need to decide when escrow is mandatory vs optional — requiring escrow for every booking adds friction for established provider–customer relationships.

## Decision

**Dual confirmation with threshold-based mandatory escrow:**

1. **Escrow threshold:** Escrow is mandatory for the first 3 bookings between any customer–provider pair. After 3 completed bookings, escrow is optional (both parties may agree to direct payment).

2. **Dual confirmation:** Completion requires both `customerConfirmedAt` and `providerConfirmedAt` to be set. The booking only moves to `completed` when both are set; escrow is released at that point.

3. **Auto-release:** If only one party confirms and the other fails to act, a BullMQ job auto-releases escrow after `AUTO_RELEASE_DAYS = 7` (configurable) to prevent indefinite hold.

4. **Dispute window:** Either party can raise a dispute at any point while the booking is `in_progress` or before both confirmations are set. Disputes freeze escrow until council staff resolve.

## Consequences

**Positive:**
- Protects both parties in new relationships without permanent friction
- Established relationships can skip escrow — respects existing trust networks in communal communities
- Auto-release prevents escrow limbo if one party is unresponsive
- Dispute mechanism gives council secretary a defined role in resolution

**Negative:**
- Counting "completed bookings" requires a cross-booking query per acceptance — O(1) with an index on (`customerResidentId`, `providerId`, `status`)
- Auto-release at 7 days may be too short for multi-day construction jobs — configurable per-booking category in future
- Dual confirmation requires both parties to be digitally reachable; a BullMQ reminder job is needed (not yet implemented in pilot)

## Alternatives considered

**Always-escrow:** Rejected. Adds permanent friction; existing trust between residents and local providers is a competitive advantage L2L should not erode.

**No escrow, direct payment:** Rejected. Inadequate protection for first-time relationships; defeats the platform's value proposition as a trusted intermediary.

**Single-party confirmation (customer only):** Rejected. Provider has no recourse if customer claims dissatisfaction after work is done and refuses to confirm.
