# Manual Fallback: Land Application Workflow

**Purpose:** Procedure when the L2L system is unavailable and a resident needs to submit a land application.

---

## If the system is offline

### Step 1 — Capture on paper

Use the **Land Application Form** (`docs/templates/land-application-form.pdf`).

Collect:
- Applicant's full name and SA ID number
- Application type: new stand / additional stand / regularisation
- Requested location description (landmark references welcome)
- Household size (number of people who will occupy)
- Reason for the application
- Applicant's phone number
- Foot soldier's name and employee number

**Two copies:** give one to the applicant as their receipt (mark it with the date and foot soldier's signature). Keep one copy for the council.

### Step 2 — Assign a paper reference number

Format: `APP-YYYY-MM-DD-NNN` (e.g. `APP-2026-05-03-001`). Write this on both copies. The applicant must quote this reference in any follow-up.

### Step 3 — Notify the council secretary

Hand the council copy to the council secretary (or photograph and send via WhatsApp) the same day.

---

## Back-entry into the system (within 48 hours)

Once the system is restored:

1. Log in as `council_secretary` or `foot_soldier`.
2. Navigate to **Applications → Submit Application**.
3. Enter the data from the paper form.
4. Set `submittedAt` to the date on the paper form (not the system entry date).
5. Add a note in the **Reason** field: `"Back-entered from paper form APP-YYYY-MM-DD-NNN due to system outage on [date]."` 
6. Submit the application.

The audit log will record the actual submission timestamp (the back-entry time). The paper reference number is captured in the reason field.

---

## Council decision on paper

If the council must decide before the system is restored:

1. The secretary writes the decision on the paper application form: approved / rejected / deferred, with reason and date.
2. Both the secretary and applicant sign.
3. When the system is restored, back-enter the decision via **Applications → [application] → Make Decision** and include `"Paper decision dated [date]"` in the notes.

---

## How the audit log captures the offline period

- The back-entry creates a normal audit event timestamped at the time of back-entry.
- The paper reference number in the reason field provides the paper trail.
- The system does not suppress the audit entry — the gap between paper date and system date is visible and expected.
- The foot soldier's name and date on the paper form constitute the offline record.

---

## Templates

- `docs/templates/land-application-form.pdf` — printable A4 form
- `docs/templates/decision-notice.pdf` — printable approval / rejection notice for the applicant

---

*Last updated: 2026-05-03*
