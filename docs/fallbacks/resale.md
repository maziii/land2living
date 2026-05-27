# Manual Fallback — Resale of Stands

**Applies when:** L2L system is unavailable during any stage of the resale workflow.

---

## Paper Reference Formats

| Document | Format | Example |
|---|---|---|
| Resale listing | `LST-YYYY-MM-DD-NNN` | `LST-2026-06-15-001` |
| Offer | `OFR-YYYY-MM-DD-NNN` | `OFR-2026-06-15-001` |
| Transfer record | `TRF-YYYY-MM-DD-NNN` | `TRF-2026-06-15-001` |

Increment `NNN` sequentially per day per type. Record in the council's paper register book.

---

## Stage 1 — Seller Lists a Stand

**If system is down:**
1. Seller completes `docs/templates/resale-listing-form.html` (print and fill manually).
2. Council foot soldier or secretary signs as witness.
3. Assign paper reference `LST-YYYY-MM-DD-NNN`.
4. File original at council office; give copy to seller.
5. Back-enter into the system within 48 hours once restored.

**Back-entry:** Use `POST /api/v1/resale-listings`, setting description to include paper reference in the format: `[Paper ref: LST-2026-06-15-001]`.

---

## Stage 2 — Council Approves the Listing

**If system is down:**
1. Council secretary signs paper listing form as "Approved for publication."
2. Stamp with council seal.
3. Secretary keeps a copy; original returned to seller.
4. Announce via WhatsApp community broadcast or community notice board.
5. Back-enter within 48 hours: `PATCH /api/v1/resale-listings/:id/approve`.

---

## Stage 3 — Buyer Submits an Offer

**If system is down:**
1. Buyer completes `docs/templates/resale-offer-form.html`.
2. Assign paper reference `OFR-YYYY-MM-DD-NNN`.
3. Witnessed by council foot soldier or secretary.
4. Deliver paper offer to seller (via council office as intermediary if needed).
5. Back-enter within 48 hours: `POST /api/v1/resale-listings/:id/offers`.

---

## Stage 4 — Seller Accepts Offer and Council Initiates Transfer

**If system is down:**
1. Seller signs paper acceptance on the offer form.
2. Council secretary co-signs the acceptance.
3. Council issues a "Transfer Initiation Notice" (plain letter, two copies).
4. Back-enter within 48 hours:
   - `PATCH /api/v1/offers/:id/accept`
   - `POST /api/v1/resale-listings/:id/initiate-transfer`

---

## Stage 5 — Payment (Escrow)

**If system is down:**
1. Buyer pays directly into council's designated trust account via EFT.
2. Council secretary issues a paper receipt (`TRF-YYYY-MM-DD-NNN`).
3. Funds held in council trust account until transfer is approved.
4. Back-enter within 48 hours once system is restored (webhook will not fire for manual payments — council secretary manually calls `POST /api/v1/webhooks/psp/payment-completed` via admin tool or contacts L2L support).

**Important:** Council is not a licensed escrow agent. For large transactions (> R500 000), advise parties to use a registered conveyancer. The platform escrow is a convenience for pilot-scale transactions only.

---

## Stage 6 — Council Approves Completion and PTO Transfer

**If system is down:**
1. Council secretary signs a "Transfer Completion Certificate" (see `docs/templates/resale-transfer-cert.html`).
2. Old PTO is physically marked "SUPERSEDED — see TRF-YYYY-MM-DD-NNN".
3. New PTO is issued manually using `docs/templates/pto-paper.html` with:
   - Buyer's name and ID number
   - Stand details
   - Transfer date
   - Reference to superseded PTO ID
4. Back-enter within 48 hours:
   - `POST /api/v1/resale-listings/:id/approve-completion`
   - This triggers automatic PTO supersession and new PTO issuance in the system.

---

## Off-Platform Resale Back-Entry

For resales that completed entirely off-platform (e.g., informal agreement before L2L was adopted):

1. Gather: original PTO (seller), signed sale agreement, proof of payment, ID copies of both parties.
2. Create a listing in "draft" status with description noting it is a historical back-entry.
3. Move the listing through the normal states in rapid succession using admin override.
4. Issue new PTO using the standard flow — set `allocationDate` to the actual transfer date.
5. Record the paper reference in the `reason` field of the audit event.

---

## Audit Log for Offline Period

When back-entering after downtime:

- Include `[Offline period: YYYY-MM-DD HH:MM to YYYY-MM-DD HH:MM]` in the `description` or `notes` field of each back-entered record.
- The council secretary must create an audit record explaining the offline period, its cause, and what manual steps were taken.
- This is done via `POST /api/v1/audit-events` with `eventType: "system.offline_backentry"`.
