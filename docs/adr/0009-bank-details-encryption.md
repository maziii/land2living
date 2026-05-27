# ADR 0009 — Bank details encryption at rest

**Status:** Accepted  
**Date:** 2026-03-15  
**Deciders:** L2L Founders

---

## Context

Service providers supply bank account details for payment disbursement. These are sensitive financial details that must be protected at rest. A database breach should not expose raw bank account numbers.

Requirements:
- Encrypted before storage in `ServiceProvider.bankDetailsEncrypted`
- Decryptable only by the application with the correct key
- Each encryption should produce a different ciphertext (prevent brute-force via known-plaintext)
- Compatible with PostgreSQL's JSON column type (for flexible bank detail schemas: account number, branch code, bank name, account type)

## Decision

**AES-256-GCM with a random 16-byte IV per encryption.**

Format stored as JSON:
```json
{ "iv": "<hex>", "data": "<hex>", "tag": "<hex>" }
```

- `iv`: 128-bit random IV (fresh per encryption)
- `data`: AES-256-GCM ciphertext
- `tag`: 128-bit authentication tag (provides integrity protection — detects tampering)

The symmetric key is supplied via `BANK_DETAILS_ENCRYPTION_KEY` environment variable (64 hex chars = 32 bytes). In production, this variable is injected by ECS from AWS Secrets Manager.

**Bank details are write-once for providers.** After initial setup, details are read-only from the API; changes require a founder-mediated off-band process to prevent social-engineering attacks.

## Consequences

**Positive:**
- AES-256-GCM is NIST-approved; authentication tag detects any tampering with ciphertext
- Random IV per encryption means identical bank details produce different ciphertext (no leakage via equality)
- JSON format makes the encrypted blob schema-flexible (add card details later without migration)

**Negative:**
- Key rotation requires re-encrypting all existing records (no envelope encryption in pilot — acceptable)
- If `BANK_DETAILS_ENCRYPTION_KEY` is leaked, all bank details are exposed; key management is critical
- Write-once constraint means a provider who genuinely needs to update bank details requires founder intervention — adds operational friction

## Alternatives considered

**PostgreSQL pgcrypto extension:** Rejected. Would store decryption key in the database environment, co-locating the key and ciphertext.

**AWS KMS envelope encryption:** Considered but deferred. Adds KMS API calls per encrypt/decrypt; acceptable at pilot volume but adds cost and latency. Can be added post-pilot.

**No encryption (plain text):** Rejected. PCI DSS and POPIA both require protection of financial account details.
