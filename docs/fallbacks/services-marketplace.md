# Services Marketplace — Manual Fallback Procedure

**Workflow:** Service provider bookings (quote → accept → in-progress → complete)
**Paper ref prefix:** `SVC-`
**Recovery window:** Back-enter within 48 hours of system restoration

---

## When to use this procedure

Use this fallback when:
- The L2L API is unavailable (5xx errors, maintenance, connectivity loss)
- The web-council portal cannot be reached from the field
- A provider needs to submit a quote but cannot access the system

---

## Stage 1 — Customer requests a service

**What to do:**
1. Customer completes **Service Request Form** (template: `docs/templates/service-request-form.html`)
2. Assign a paper reference: `SVC-<YYYY>-<NNN>` (e.g. `SVC-2026-001`)
3. Council secretary records in the paper **Service Register** ledger: customer name, stand, category, description, requested date, provider name
4. Notify the provider by phone call or WhatsApp message

**Paper trail:** Keep the completed form in the monthly services folder.

---

## Stage 2 — Provider submits a quote

**What to do:**
1. Provider verbally or in writing quotes an amount in ZAR
2. Council secretary records quote on the **Service Register**: quote amount, take-rate tier, net to provider
3. Notify customer by phone or WhatsApp

**Take-rate tiers (locked at quote):**

| Category | Rate |
|---|---|
| Gardening, cleaning, security | 11% |
| Plumbing, electrical, repairs | 7% |
| Architecture | 6% |
| Bricklaying, fencing, borehole, building | 4% |

---

## Stage 3 — Customer accepts the quote

**What to do:**
1. Customer signs or verbally confirms acceptance (note in register: "accepted, confirmed by [name] on [date]")
2. Council secretary notifies provider to begin work

---

## Stage 4 — Work in progress

**What to do:**
1. Mark register entry as "in progress" with start date
2. If escrow is required (first 3 jobs between this customer–provider pair), council collects escrow payment offline via EFT or cash and issues a receipt (`ESC-<SVC-ref>`)

---

## Stage 5 — Completion confirmation

**What to do:**
1. Both customer and provider must sign the **Completion Certificate** (`docs/templates/service-completion-cert.html`)
2. Council secretary countersigns
3. Mark register: completed date, both confirmations received
4. If escrow held: release payment to provider via EFT within 1 business day

---

## Stage 6 — Dispute

**What to do:**
1. Either party notifies the council secretary in writing (WhatsApp or letter)
2. Council secretary marks register as "disputed" and assigns a resolution meeting date
3. Resolution documented in writing; both parties sign
4. Payment held until resolved

---

## Back-entry procedure (within 48 hours)

When the system is restored:
1. Open the Services module in web-council
2. Create the booking using the paper reference as the description prefix: `[SVC-2026-001] Fix leaking pipe`
3. Enter the quote amount and mark through the workflow to match the current stage
4. Upload a photo of the paper forms as document evidence
5. Note in the booking description: "Back-entered from paper — original ref SVC-2026-XXX"
6. The audit log will capture the entry timestamp; add a note explaining the offline period

---

## Audit log for offline period

When back-entering, document the offline gap:
- Start time of outage (approximate)
- End time of outage
- Number of paper transactions processed offline
- Name of council secretary who handled the offline period

This note goes into the L2L audit system as a `system.offline_gap` event once access is restored.
