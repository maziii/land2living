# ADR 0008 — Modular monolith over microservices

**Status:** Accepted  
**Date:** 2026-01-10  
**Deciders:** L2L Founders

---

## Context

L2L needs to deliver a working platform by June 2026. The team is small (3 founders + contractors). The pilot is a single council (Ndebele). Key risks are: over-engineering, slow delivery, operational complexity.

Options considered:
1. Microservices from day one
2. Modular monolith (single deployable, cleanly separated modules)
3. Big ball of mud (monolith with no internal structure)

## Decision

**Modular monolith:** one Node.js + Fastify deployable, structured into well-defined modules under `apps/api/src/modules/`. Each module has its own `routes.ts`, `service.ts`, `repository.ts`, `schemas.ts`, `types.ts`, and `__tests__/`.

**Module communication is in-process function calls** during the pilot. No event bus, no message queue between modules. Import directly.

**Extraction rule:** A module is only extracted into a separate service if it has a concrete, demonstrated need for independent deployment (e.g., it needs to scale independently, or it has its own team). Hypothetical future need does not justify extraction.

## Consequences

**Positive:**
- Single deploy unit — simple CI/CD, simple infrastructure, simple debugging
- In-process calls are type-safe and IDE-navigable; no serialisation overhead between modules
- Refactoring across module boundaries is straightforward (TypeScript compiler catches breaks)
- One database connection pool; no distributed transaction complexity

**Negative:**
- All modules share the same failure domain — a crash anywhere crashes everything (mitigated by ECS health checks and auto-restart)
- Horizontal scaling applies to all modules, not just high-load ones (acceptable at pilot scale)
- Module boundaries must be enforced by convention, not runtime isolation

## Alternatives considered

**Microservices from day one:** Rejected. The team cannot staff 5+ independent deployable services for a pilot with one council. The operational overhead (service discovery, distributed tracing, network partitions) would dwarf feature delivery velocity.

**Big ball of mud:** Rejected. Without module structure, the codebase becomes unnavigable within 3 months. Module structure costs almost nothing up front and pays dividends immediately.
