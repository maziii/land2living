# POPIA Compliance Register — Land2Living

**Last updated:** 2026-05-04  
**Information Officer:** TBD (designate and register with Information Regulator before launch)  
**Regulation:** Protection of Personal Information Act, Act 4 of 2013

---

## 1. Personal information we process

| Data category | Examples | Where stored | Lawful basis | Retention |
|---|---|---|---|---|
| Resident identity | Full name, ID number, date of birth | `tenant_<slug>.residents` | Legitimate interest (council registry function) | Indefinitely (land registry records) |
| Contact details | Phone number, WhatsApp number | `tenant_<slug>.residents` | Consent (provided during registration) | Until resident requests erasure |
| Stand occupancy | Stand number, occupancy start/end dates | `tenant_<slug>.stand_occupancies` | Legitimate interest | Indefinitely (historical record) |
| PTO records | PTO details, signatures, issue date | `tenant_<slug>.ptos` | Legal obligation (communal land administration) | Indefinitely |
| Land applications | Application details, supporting documents | `tenant_<slug>.land_applications` | Consent (applicant submits voluntarily) | 7 years after decision |
| Resale listings | Listing details, offer details | `tenant_<slug>.resale_listings` | Consent | 3 years after transfer |
| Resident photos | Profile photo, document scans | S3 (af-south-1) | Consent | Until erasure request |
| Service bookings | Booking details, category, description | `public.service_bookings` | Contract (booking agreement) | 3 years after completion |
| Bank account details | Account number, branch code, bank name | `public.service_providers.bank_details_encrypted` | Consent + Contract | Until provider deregisters |
| Audit events | Access logs, admin actions | `public.platform_audit_events`, `tenant_<slug>.audit_events` | Legal obligation (POPIA audit requirement) | 5 years |

---

## 2. Data subjects' rights

| Right | How to exercise | Response time | Constraints |
|---|---|---|---|
| **Right to access** | Contact council secretary or email l2l founders | 30 days | |
| **Right to correction** | Contact council secretary | 30 days | |
| **Right to erasure** | Email Information Officer | 30 days | PTO records and audit logs cannot be erased — they are legal and compliance records |
| **Right to object** | Email Information Officer | 30 days | May be refused if legitimate interest overrides |
| **Right to data portability** | Request schema export via council secretary | 30 days | |

---

## 3. Third-party processors

| Processor | Purpose | Data shared | DPA in place? |
|---|---|---|---|
| AWS (af-south-1) | Hosting, RDS, S3, KMS | All personal data | AWS Data Processing Agreement (standard) |
| Meta WhatsApp Business | Supplier and resident notifications | Phone numbers, message content | Meta DPA (standard) |
| 360dialog | WhatsApp API relay | Phone numbers, message content | 360dialog DPA — **obtain before launch** |
| Sentry | Error monitoring | Stack traces, request IDs (no PII in logs) | Sentry DPA — **ensure PII scrubbing is on** |
| PSP (TBD — Yoco or Ozow) | Payment processing | Payment reference, amount | PSP DPA — **obtain before launch** |

---

## 4. International transfers

L2L processes personal data within South Africa only (AWS af-south-1). No cross-border transfer of SA resident personal data. Sentry (US-hosted) receives error logs — PII must be scrubbed from error logs before shipping to Sentry (Sentry `beforeSend` hook must strip resident IDs and phone numbers).

**Action required before launch:** Configure Sentry `beforeSend` to scrub PII from error payloads.

---

## 5. Security measures

- Encryption at rest: AES-256-GCM for bank details; RDS encryption enabled; S3 server-side encryption (AES-256)
- Encryption in transit: TLS 1.2+ for all API traffic
- Access controls: RBAC enforced at API level; no direct database access from outside VPC
- Audit logging: all admin-role access to personal data is logged
- PTO signing: Ed25519 cryptographic signature via AWS KMS
- Incident response: data breach runbook at `docs/runbooks/data-breach.md`

---

## 6. Privacy policy

**Status:** Draft required — legal review needed before launch.

Key sections to include:
- Who we are (L2L, council partner)
- What data we collect and why
- Who we share it with (council, PSP, WhatsApp)
- How long we keep it
- Your rights under POPIA
- How to contact the Information Officer

---

## 7. Pre-launch compliance checklist

- [ ] Information Officer designated and name registered with Information Regulator
- [ ] Privacy policy published at `land2living.co.za/privacy`
- [ ] Data Processing Agreements with 360dialog, PSP, and Sentry obtained
- [ ] Resident registration form includes explicit consent checkbox (not pre-ticked)
- [ ] Sentry `beforeSend` hook scrubs PII
- [ ] Data breach response rehearsed (tabletop exercise) with founders
- [ ] Erasure procedure tested end-to-end
- [ ] Council partnership agreement includes Data Processing Agreement clause
