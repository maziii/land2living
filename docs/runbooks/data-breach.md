# Data Breach Response Runbook

**Owner:** L2L Founders (Information Officer)  
**Regulation:** POPIA (Protection of Personal Information Act, Act 4 of 2013)  
**Regulator:** Information Regulator of South Africa — [inforeg.org.za](https://www.inforeg.org.za)

---

## Breach classification

| Severity | Description | Response time |
|---|---|---|
| **P1 — Critical** | Database exfiltration, encryption key exposure, bulk resident PII exposed | Immediate (within 1 hour) |
| **P2 — High** | Single tenant's data accessed by another tenant, bank detail exposure | Within 4 hours |
| **P3 — Medium** | Audit log exposure, metadata leakage without direct PII | Within 24 hours |
| **P4 — Low** | Misconfigured public read on non-PII assets | Within 72 hours |

POPIA Section 22 requires notification to the Information Regulator and affected data subjects **as soon as reasonably possible** after discovery of a compromise.

---

## Immediate response (first 30 minutes)

1. **Confirm the breach** — distinguish false positive (penetration test, security scanner) from genuine incident
2. **Page the primary on-call founder** — see `docs/runbooks/on-call.md` for contact list
3. **Isolate the affected system:**
   - ECS task: `aws ecs update-service --desired-count 0 --service l2l-api --cluster l2l-prod`
   - RDS: Modify security group to revoke all inbound except VPN
   - S3: Remove any public ACLs if document bucket is involved
4. **Preserve evidence** — take a snapshot of CloudWatch logs for the 24 hours preceding discovery; do not delete anything
5. **Notify co-founders** — WhatsApp group "L2L INCIDENT"

---

## Assess the scope (first 2 hours for P1/P2)

Answer these questions and record in writing:

- Which data was accessed or exfiltrated?
  - [ ] Resident personal data (names, ID numbers, phone numbers)
  - [ ] PTO records
  - [ ] Bank account details
  - [ ] Application data
  - [ ] Audit logs only
- How many data subjects are affected?
- Which tenants (councils) are affected?
- Is the breach ongoing or contained?
- What was the attack vector? (Compromised credential, SQL injection, misconfigured storage, etc.)

---

## Contain and remediate

### If credentials were compromised
1. Rotate all secrets immediately: `JWT_SECRET`, `BANK_DETAILS_ENCRYPTION_KEY`, database password, AWS IAM keys
2. Invalidate all active JWTs by rotating the secret (all users will be logged out — acceptable in an incident)
3. Audit all recent API access in CloudWatch for the compromised credential

### If database was accessed
1. Change RDS master password
2. Revoke all application DB users and re-provision
3. Review and rotate `BANK_DETAILS_ENCRYPTION_KEY` — if key is compromised, bank details must be considered exposed even if encrypted
4. Issue new encrypted values for all bank details once a clean key is in place

### If S3 was accessed
1. Remove public access block exceptions
2. Enable S3 access logging if not already on
3. Rotate presigned URL signing key

---

## Notify the Information Regulator (P1/P2 — within 72 hours of discovery)

POPIA Section 22 — notification form available at: [inforeg.org.za/forms](https://www.inforeg.org.za)

Required information:
- Description of the compromise (what happened)
- Categories and approximate number of data subjects affected
- Categories and approximate number of records affected
- Contact details of the Information Officer
- Likely consequences of the compromise
- Measures taken or proposed to address the compromise

**Information Officer:** [To be designated — complete before pilot launch]  
**Information Regulator contact:** complaints@inforeg.org.za | 010 023 5207

---

## Notify affected data subjects

If reasonable grounds exist to believe that the identity of a data subject has been affected:

1. Draft a notification letter (template: `docs/templates/breach-notification-letter.html`)
2. Notify via the channel on record for each affected resident (SMS, WhatsApp, or letter)
3. Include:
   - What happened
   - What personal information was involved
   - What L2L is doing about it
   - What the data subject can do (e.g. freeze credit, monitor for fraud)
   - Contact details for questions

---

## Post-incident review (within 7 days)

1. Root cause analysis — what failed? (Technical control, process, human error)
2. Timeline reconstruction — when did the breach start, when was it discovered, when contained?
3. Control gaps — what control would have prevented or limited this?
4. Remediation plan — with owners and dates
5. Update this runbook if the response revealed gaps in the procedure

Document the review in `docs/incidents/YYYY-MM-DD-<slug>.md`.

---

## Contact list (update before launch)

| Role | Name | WhatsApp | Email |
|---|---|---|---|
| Information Officer | TBD | | |
| Primary on-call | TBD | | |
| Secondary on-call | TBD | | |
| Legal counsel | TBD | | |
| AWS account owner | TBD | | |
