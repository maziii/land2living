# Manual Fallback: PTO Issuance

**Purpose:** Procedure when the L2L system is unavailable and a PTO must be issued.

---

## If the system is offline

### Step 1 — Verify the application status

Confirm that a paper decision record exists (see `land-application.md`) showing the application was **approved** and a stand was allocated.

### Step 2 — Print and complete the paper PTO template

Use **`docs/templates/pto-paper.pdf`**.

Complete all fields:
- Council name
- Occupant full name and SA ID number
- Stand address / description and local reference number
- Allocation date (today's date)
- Application reference number
- Council secretary name

### Step 3 — Sign and seal

The council secretary must **sign** the paper PTO and affix the **council stamp / kingdom seal** where indicated.

**Two copies:** give the original to the resident. Keep a photocopy in the council's physical file.

### Step 4 — Assign a paper PTO reference

Format: `PTO-YYYY-MM-DD-NNN` (e.g. `PTO-2026-05-03-001`). Write this on both copies.

---

## Back-entry into the system (within 48 hours)

Once the system is restored:

1. Ensure the land application is back-entered and in `approved` status with an allocated stand (see `land-application.md`).
2. Log in as `council_secretary`.
3. Navigate to **Applications → [application] → Issue PTO**.
4. The system will generate the digital PTO and sign it.
5. In the **Decision Notes** field (if available), record: `"Digital PTO issued to match paper PTO-YYYY-MM-DD-NNN issued on [date]."` 
6. Store the PDF in the document vault.
7. The `stand_occupancy` record will be automatically updated with the PTO ID.

---

## Relationship between paper and digital PTOs

The paper PTO and the digital PTO represent the same occupancy grant. The paper PTO is the legally binding document for the offline period. The digital PTO supersedes it once issued. The paper PTO reference number is recorded in the digital PTO's notes field for traceability.

---

## If the resident disputes occupancy

The paper PTO (signed by the council secretary with the council seal) is the primary evidence for the offline period. The digital PTO, once issued, is verifiable via the QR code at `https://l2l.app/verify/<id>`.

---

## Templates

- `docs/templates/pto-paper.pdf` — printable paper PTO with signature lines and seal placeholder
- `docs/templates/land-application-form.pdf` — prerequisite: the approved application

---

*Last updated: 2026-05-03*
