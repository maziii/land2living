# ADR 0002 — Payment PSP abstraction (Yoco / Ozow)

**Status:** Accepted  
**Date:** 2026-01-20  
**Deciders:** L2L Founders

---

## Context

The resale workflow and services marketplace both require escrow payments. We need a PSP that:

- Operates in South Africa (POPIA residency)
- Supports merchant escrow or custodial hold
- Integrates without a per-transaction manual review
- Has predictable, reasonable fees for a pilot-scale transaction volume

Two local PSPs were shortlisted: **Yoco** and **Ozow**.

A third consideration: the integration must not lock us into a single PSP — if Yoco drops escrow support or Ozow's fees become uncompetitive, we should be able to switch without rewriting business logic.

## Decision

**Build a `PspAdapter` abstraction first; implement `MockPspAdapter` for pilot development.**

The abstraction (`apps/api/src/adapters/payment-psp/index.ts`) defines:
```typescript
interface PspAdapter {
  createCheckout(opts: CreateCheckoutOpts): Promise<CheckoutResult>;
  releaseEscrow(paymentId: string): Promise<void>;
  refund(paymentId: string): Promise<void>;
  verifyWebhookSignature(rawBody: string, headers: ...): boolean;
}
```

The concrete PSP (Yoco or Ozow) is selected via `PSP_PROVIDER` environment variable. `MockPspAdapter` is used in development and tests.

**PSP selection deferred to 30 days before pilot launch** once we confirm which provider offers merchant escrow for the ZAR amounts expected (R5 000 – R500 000 range for resale; R500 – R50 000 for services).

## Consequences

**Positive:**
- Business logic (escrow status machine, dual-confirmation release) is completely PSP-agnostic
- Mock PSP enables full end-to-end testing without a live payment account
- Switching PSPs post-pilot is a matter of adding a new adapter class

**Negative:**
- Webhook signature verification is PSP-specific; the adapter interface must be flexible enough to accommodate both Yoco's HMAC and Ozow's RSA signatures
- Escrow hold semantics differ between PSPs; the adapter may need to expose a `holdFunds` method separately from `createCheckout` depending on final choice

## Alternatives considered

**Stripe:** Rejected — not a SA-local PSP; POPIA data residency requirement prohibits storing payment data offshore.

**Manual EFT:** Available as fallback only; not suitable for automated escrow release.
