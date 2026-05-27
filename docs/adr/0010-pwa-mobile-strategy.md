# ADR 0010 — Progressive Web App for mobile (React + Vite + Workbox)

**Status:** Accepted  
**Date:** 2026-01-12  
**Deciders:** L2L Founders

---

## Context

The foot soldier workflow (registering residents and stands in the field) must work with unreliable or absent mobile data. Foot soldiers in communal areas often operate in low-connectivity zones. Requirements:

- Works offline for core registration flow (resident capture, stand assignment)
- Installable on Android phones (the primary foot soldier device)
- No app store approval delays — pilot needs to iterate quickly
- Shared codebase with the council web app where possible

Options:
- React Native / Expo
- Native Android
- Progressive Web App (PWA) with Workbox

## Decision

**React + Vite + Workbox PWA** for `apps/mobile-pwa`.

- Service worker via `vite-plugin-pwa` (Workbox under the hood)
- Offline-first for read operations; write operations queue via IndexedDB and sync when connectivity returns (using Workbox Background Sync)
- Installable via "Add to Home Screen" on Android Chrome — no Play Store required
- Same design system (Tailwind) and component library as `apps/web-council`

**Offline scope (pilot):** The registration form, stand assignment, and photo capture work offline. Syncing requires connectivity. PTO issuance requires connectivity (KMS signing).

## Consequences

**Positive:**
- No app store — deploy a URL, users install from the browser
- Rapid iteration — push updates without an app store review cycle
- Shared component library reduces total UI code
- Workbox Background Sync handles queued writes transparently when connectivity resumes

**Negative:**
- iOS PWA support is limited (Background Sync not supported on Safari as of pilot date); foot soldiers on iPhones cannot use offline sync — iOS support deferred
- Camera access via PWA is browser-permissioned; UX differs from native
- Service worker caching strategy must be carefully tuned — stale data risks if cache TTLs are too long

## Alternatives considered

**React Native / Expo:** Rejected. Two separate JavaScript runtimes (React Native + React DOM) make code sharing harder. Play Store and App Store distribution adds deployment friction for a pilot.

**Native Android:** Rejected. Separate codebase, separate language (Kotlin/Java), requires Android developer expertise the team does not have.

**No mobile, field workers use web-council on tablets:** Rejected. Field conditions (intermittent connectivity, outdoor use, single-handed operation) require a purpose-built mobile UX.
