# Security Review Checklist — Pre-Pilot Launch

**Owner:** L2L Founders  
**Target completion:** 30 days before pilot launch (by 2026-05-31)  
**Penetration test:** external party, by 2026-05-31

---

## 1. Authentication and authorisation

- [ ] All non-public endpoints require a valid JWT (`requireAuth` middleware applied)
- [ ] Every privileged action checks role via `requireRole(...)` — no role checked via `if (role === ...)` in route handlers
- [ ] JWT secret is at least 256 bits; rotated from the default test value before production
- [ ] JWT expiry is set to a sensible value (e.g. 24h access token, 7d refresh)
- [ ] MFA is enforced for `council_secretary` and `founder` roles
- [ ] Failed login attempts are rate-limited (implement before launch)
- [ ] Sessions are invalidated on password change or explicit logout

## 2. Tenant isolation

- [ ] Every query that touches tenant data goes through `withTenantContext(ctx)` — no bare Prisma calls to tenant tables in tenant-scoped modules
- [ ] Tenant resolved from JWT claim only — never from request body or query parameter
- [ ] Cross-tenant admin queries have an explicit `requireRole("founder")` guard
- [ ] Integration tests verify that tenant A cannot read tenant B's data (write a cross-tenant test)

## 3. Input validation

- [ ] All request bodies validated with Zod at route entry — no raw `req.body` access in service/repository layers
- [ ] All URL path parameters validated (UUID format check where expected)
- [ ] File upload endpoints: type validation (MIME + extension), size limit (10 MB enforced via `@fastify/multipart`), filename sanitisation
- [ ] File uploads scanned for malware before storage (ClamAV or AWS Macie — **TODO before launch**)
- [ ] Numeric fields: check for negative values, overflow (Zod `.int().positive()`)
- [ ] Date fields: check for valid ISO 8601 format; reject dates too far in the future

## 4. Injection and XSS

- [ ] All database queries use Prisma parameterised queries — no raw SQL string concatenation
- [ ] Any `prisma.$queryRaw` usage reviewed for injection risk (grep for `$queryRaw` before launch)
- [ ] HTML-generating code (PDF generation, email templates) uses a template engine with auto-escaping — no direct string interpolation of user data into HTML
- [ ] API responses set `Content-Type: application/json` — no reflected HTML in error messages
- [ ] `X-Content-Type-Options: nosniff` header set on all responses
- [ ] `Content-Security-Policy` header set on web-council and mobile-pwa (allow only known CDN origins)

## 5. Secrets and configuration

- [ ] No secrets committed to git — scan history with `git log --all -- '*.env'` and `truffleHog`
- [ ] `.env` files in `.gitignore`
- [ ] All production secrets in AWS Secrets Manager; injected as ECS task environment variables
- [ ] `BANK_DETAILS_ENCRYPTION_KEY` is a separate secret from `JWT_SECRET`
- [ ] `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_WEBHOOK_VERIFY_TOKEN` rotated from defaults before production
- [ ] KMS key policy restricts decrypt access to the ECS task role only

## 6. Transport security

- [ ] All production traffic via HTTPS only; HTTP redirects to HTTPS at the load balancer
- [ ] TLS 1.2 minimum; TLS 1.3 preferred
- [ ] `Strict-Transport-Security` header with `max-age=31536000; includeSubDomains`
- [ ] Certificate auto-renewal configured (ACM)
- [ ] No mixed content on web-council or mobile-pwa

## 7. Personal data (POPIA)

- [ ] PII fields (ID numbers, phone numbers, addresses) are not logged at `INFO` level or above
- [ ] Audit log captures every admin-role read of personal data (resident records, PTO details)
- [ ] `GET /api/v1/residents/:id` by a `council_secretary` logs an audit event
- [ ] Residents can request data export (manual process documented in `docs/runbooks/`)
- [ ] Residents can request erasure (procedure documented — note: PTO records cannot be erased as they are historical title documents)

## 8. File storage

- [ ] S3 bucket is private — no public ACL
- [ ] Presigned URLs expire within 15 minutes
- [ ] S3 bucket policy denies all public `s3:GetObject` except via the signed URL mechanism
- [ ] S3 versioning enabled for document vault bucket (prevents accidental overwrites of PTOs)

## 9. Dependency security

- [ ] `npm audit` passes with no critical vulnerabilities before launch
- [ ] Dependabot or Renovate configured to alert on new CVEs
- [ ] Node.js version is current LTS (20.x)

## 10. Penetration test scope

The external penetration test (due by 2026-05-31) should cover:

- Authentication bypass attempts
- JWT manipulation (algorithm confusion, expired token acceptance)
- Tenant isolation bypass (direct ID manipulation across tenants)
- Injection attacks (SQL, NoSQL, command injection in file handling)
- IDOR (Insecure Direct Object References) — accessing another resident's records
- File upload attacks (polyglot files, path traversal)
- Rate limiting bypass for auth endpoints
- Webhook endpoint abuse (mass-submitting fake PSP/supplier responses)

**Acceptance criterion:** Zero critical or high findings unresolved before pilot launch.

---

## Sign-off

| Area | Reviewer | Date | Status |
|---|---|---|---|
| Auth + RBAC | | | ☐ |
| Tenant isolation | | | ☐ |
| Input validation | | | ☐ |
| Injection + XSS | | | ☐ |
| Secrets | | | ☐ |
| Transport security | | | ☐ |
| POPIA | | | ☐ |
| File storage | | | ☐ |
| Penetration test | External party | | ☐ |
