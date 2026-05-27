# ADR 0003 — Supplier Adapter pattern

**Status:** Accepted  
**Date:** 2026-02-01  
**Deciders:** L2L Founders

---

## Context

The CLAUDE.md principle "Suppliers integrate on their terms" is non-negotiable. Suppliers range from:

- **Regional hardware chains** — have REST APIs, can integrate programmatically
- **Mid-size local suppliers** — reachable via WhatsApp Business
- **Small local suppliers** — only have email; some only have a phone number
- **Informal suppliers** — council staff contacts them manually

A single integration mechanism would exclude the majority of pilot suppliers. We need a pattern that accommodates all four.

## Decision

**Implement the Strategy pattern as a `SupplierAdapter` interface** with four concrete implementations:

| Mechanism | Class | Dispatch | Response |
|---|---|---|---|
| `api` | `ApiAdapter` | HTTP POST to supplier endpoint | Webhook to `/webhooks/supplier-adapter/whatsapp` |
| `whatsapp_template` | `WhatsAppAdapter` | Meta WhatsApp Business API template | Webhook or staff manual entry |
| `email_template` | `EmailAdapter` | SMTP via nodemailer | Inbound parse webhook or manual entry |
| `manual` | `ManualAdapter` | Audit log; staff phones supplier | Council staff enters via web-council |

The `createSupplierAdapter(mechanism: string): SupplierAdapter` factory function reads from the `Supplier.integrationMechanism` field and returns the appropriate implementation.

Each response is parsed with `parseIncomingResponse` using best-effort ZAR amount extraction from free text where the response is unstructured (WhatsApp/email).

## Consequences

**Positive:**
- No supplier is excluded from the pilot regardless of their tech maturity
- Adding a new mechanism (e.g., SMS, PDF attachment) is an isolated class implementation
- The `ManualAdapter` guarantees 100% coverage even when all digital channels fail

**Negative:**
- `parseIncomingResponse` on unstructured text is heuristic and error-prone; council staff must verify parsed values
- WhatsApp webhook context IDs (linking a reply to a request) require template design to include the request reference
- Email inbound parse services (SendGrid/Mailgun) add an external dependency

## Alternatives considered

**Single API gateway for all suppliers:** Rejected. Would require every supplier to integrate with L2L's API, excluding the majority.

**Portal-only integration:** Rejected. CLAUDE.md explicitly prohibits forcing suppliers onto a portal in the pilot.
