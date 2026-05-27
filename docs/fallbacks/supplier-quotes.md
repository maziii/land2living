# Supplier Quote Requests — Manual Fallback Procedure

**Workflow:** Basket → dispatch to suppliers → receive quotes → compare → select
**Paper ref prefix:** `SQR-`
**Recovery window:** Back-enter within 48 hours of system restoration

---

## When to use this procedure

Use this fallback when:
- The Supplier Adapter cannot dispatch (API down, WhatsApp API unavailable, SMTP failure)
- The web-council portal is unavailable
- A supplier can only respond via phone and the system is down

---

## Stage 1 — Prepare the basket

**What to do:**
1. Council secretary completes the **Supplier Quote Request Form** (`docs/templates/supplier-quote-request-form.html`)
2. Assign a paper reference: `SQR-<YYYY>-<NNN>` (e.g. `SQR-2026-001`)
3. List all items: description, quantity, unit, spec notes
4. Note the response deadline (default: 7 working days from dispatch)

---

## Stage 2 — Dispatch to suppliers

**Dispatch method by supplier integration type:**

| Mechanism | Manual fallback |
|---|---|
| `api` | Email the basket PDF to the supplier's technical contact |
| `whatsapp_template` | Send a WhatsApp message manually: "Hi [Supplier], please quote for: [items]. Ref: SQR-2026-XXX. Reply by [deadline]." |
| `email_template` | Send an email from the council secretary's email address with the basket attached |
| `manual` | Phone call; record verbally: who was called, when, by whom |

For all methods: note in the **Supplier Dispatch Register** — supplier name, dispatch method, date/time, person who dispatched.

---

## Stage 3 — Receiving quotes

For each response received:
1. Record in the **Quote Response Register**: supplier name, quote amount (ZAR), availability, lead time in days, date received, response method
2. Keep any written quotes (emails, WhatsApp screenshots) in the SQR folder

---

## Stage 4 — Comparing and selecting

1. Prepare a comparison table (see template column format: Supplier | Quote | Availability | Lead Days | Notes)
2. Council secretary and requesting manager review
3. Sign the selection decision: "Selected: [Supplier Name] at R[amount] on [date]. Reason: [price/availability/relationship]"
4. Notify the selected supplier and unsuccessful suppliers

---

## Stage 5 — Recording the sale (commission tracking)

When the supplier fulfils the order:
1. Record on the **Supplier Sales Register**: supplier name, SQR ref, fulfilled amount, commission rate, commission amount
2. Commission amounts:

| Arrangement | Rate |
|---|---|
| Standard suppliers | 2.5% (250 basis points) |
| Custom agreements | Per supplier contract |

3. Issue a commission invoice to the supplier within the settlement cadence (default: per transaction)

---

## Back-entry procedure (within 48 hours)

When the system is restored:

**Quote request:**
1. Go to `web-council > Suppliers > New request`
2. Create the quote request with the same basket — description prefix: `[SQR-2026-001]`
3. Add manual responses for each quote received during downtime using `+ Add manual response`
4. Select the winning supplier using the Compare view

**Commission:**
1. Go to `web-council > Suppliers > Commission tracker`
2. Record each sale that was fulfilled offline
3. Mark invoiced/paid to match the current state in the paper register

**Audit note:** Include "Back-entered from paper — original ref SQR-2026-XXX" in any notes fields.

---

## Contact list (keep updated in council secretary's paper folder)

Each anchor supplier should have their contact card on file, including:
- Business name
- Primary contact name
- Phone number (WhatsApp-capable)
- Email address
- Integration mechanism when system is up

Review and update this list at every monthly L2L review meeting.
