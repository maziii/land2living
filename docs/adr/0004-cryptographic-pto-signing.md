# ADR 0004 — Cryptographic PTO signing

**Status:** Accepted  
**Date:** 2026-02-10  
**Deciders:** L2L Founders

---

## Context

A Permission to Occupy (PTO) is a legally significant document in communal land administration. We need a signing mechanism that:

- Binds the PTO to the issuing council (non-repudiation)
- Allows verification without contacting L2L's servers (offline verification)
- Is auditable — verification events should be loggable
- Is resistant to forgery or tampering

## Decision

**Ed25519 keypair per tenant, managed via AWS KMS; QR code on PDF for offline verification.**

- Each tenant has an Ed25519 signing keypair in AWS KMS (af-south-1 region)
- The PTO record is canonicalised as deterministic JSON (sorted keys, no whitespace) before signing
- The signature is stored alongside the PTO record in the database
- A PDF is generated with the signed PTO data embedded as a QR code
- The QR code payload is: `{ ptoData: {...}, signature: "<base64 ed25519 sig>" }`
- Verification: anyone scans the QR code, fetches the tenant's public key from `/api/v1/tenants/<slug>/pto-pubkey`, verifies the Ed25519 signature

## Consequences

**Positive:**
- Completely offline verification possible once the public key is cached
- KMS handles key storage; private key material never touches application memory
- Ed25519 signatures are compact (64 bytes) — QR code payload stays scannable
- Superseded PTOs remain verifiable (the signature is on the historical record)

**Negative:**
- KMS has a per-API-call cost; high-volume verification (unlikely in pilot) would incur cost
- Key rotation requires re-issuing all PTOs or maintaining a key version lookup
- Pilot uses a test KMS key; production requires a production KMS key setup before launch

## Alternatives considered

**RSA-2048 or RSA-4096:** Rejected. Larger signatures inflate QR code payload; Ed25519 is equally secure at far smaller size.

**Self-signed certificates (no KMS):** Rejected. Key material would need to be managed by L2L application code — risk of exposure.

**No signing (DB record only):** Rejected. A PTO stored only in a database provides no tamper-evident proof to a third party who cannot query the DB.
