---
feature: audit-log-durability
design_doc: docs/4. planning/workflow-enhancement-roadmap.md
creation_date: 2026-05-04
status: backlog
implemented_date:
---

# Audit Log Durability

> **Purpose:** Eliminate fire-and-forget audit writes from the codebase. Every audit-eligible action must either persist its log entry as part of the same transaction as the underlying mutation, or — for actions with no mutation to wrap (e.g. login attempts) — use a durable, retried write rather than the current `console.error`-on-failure pattern.

## Intention

The original repo audit assumed all ~350 audit sites were fire-and-forget. **That is not accurate.** Closer inspection shows the codebase already has a transactional `audited()` wrapper used at ~52 sites, but a smaller real gap exists:

1. **`auditService.log(entry)`** is a fire-and-forget helper (`prisma.auditLog.create(...).catch(console.error)`). It is currently used at ~9 sites, primarily in `auth.routes.ts` (login success/failure, refresh, logout) and a journey test. If the audit insert fails (DB hiccup, schema drift), the action is invisible — and for failed-login tracking this is a real compliance and security-monitoring gap.
2. **Inline `auditLog.create` calls outside `audited()`** at a small number of sites (e.g. `export.service.ts`, parts of `household.service.ts`, `cashflow.service.ts`). Some of these are inside a `tx.$transaction` (safe); others use the bare `prisma` client (not safe). Each needs verification.

This spec closes both gaps with surgical refactors, not a 350-site rewrite.

## Description

Two coordinated changes:

1. **Eliminate `auditService.log`** as a fire-and-forget pattern. Replace each call site with one of:
   - the `audited()` wrapper if there is a mutation to wrap,
   - a new **`auditEvent()` helper** for mutationless events (login attempts, logout, refresh) that performs a durable transactional write of just the audit row, with a bounded in-process retry on transient errors and a structured-log fallback if the retry fails.
2. **Audit every inline `auditLog.create`** for transactional context. Any site using the bare `prisma` client outside a `$transaction` must be migrated to either `audited()` or `auditEvent()`. Sites already inside a `tx` are left as-is and tagged with a comment confirming their durability.

Once complete, the fire-and-forget `auditService.log` export is removed from the codebase so it cannot be re-introduced by accident.

## User Stories

- As a compliance reviewer, I want every authentication outcome (success, failure, refresh, logout) durably recorded so I can reconstruct who did what, even when the database had a brief hiccup.
- As a security operator, I want failed-login audit entries to be reliable so brute-force detection cannot be defeated by transient DB errors.
- As a backend developer, I want a single, obviously-safe API for audit logging so I do not have to think about durability semantics on every call.
- As a maintainer, I want the unsafe fire-and-forget pattern _removed_ — not just deprecated — so future contributors cannot reach for it.

## Acceptance Criteria

- [ ] A new `auditEvent()` helper exists in `audit.service.ts` for mutationless audit writes. It performs a transactional write of a single audit row and returns a Promise that callers can `await`.
- [ ] `auditEvent()` retries transient errors (e.g. `P1001` connection refused, `P2024` connection pool timeout) up to a small bounded count (recommend 3 attempts with linear backoff). Non-transient errors throw.
- [ ] If `auditEvent()` exhausts retries, it logs a structured `error`-level message including the audit payload (with sensitive fields redacted) and rethrows.
- [ ] All ~9 production `auditService.log(...)` call sites are migrated to either `audited()` (if mutating) or `auditEvent()` (if not).
- [ ] The `auditService.log` export is **removed** from `audit.service.ts` after migration. Any remaining test references are deleted or updated.
- [ ] Every inline `auditLog.create` call in the production code (excluding `audit.service.ts` itself) is verified to be inside a `tx.$transaction`. Sites using the bare `prisma` client are migrated to `auditEvent()` or `audited()`.
- [ ] An ESLint rule (or a comment-banner in `audit.service.ts`) prevents direct access to `prisma.auditLog.create` outside the audit service — forcing all future audit writes through `audited()` or `auditEvent()`.
- [ ] Tests cover: `auditEvent()` happy path; retry-then-success; retry-exhausted-rethrow; full migration of `auth.routes.ts` (login success, login failure, logout, refresh).
- [ ] No regression: the existing `audited()` wrapper is unchanged in API and behaviour.
- [ ] The change ships behind a documented "audit durability hardening" entry in the changelog / planning notes; no backward-compat shim for the removed export.

## Open Questions

- [ ] **Failed-login audit during DB outage.** If the database is unreachable, login fails anyway (no auth check possible). The audit write would also fail. Decision: in this case, structured-log to stderr with full payload (already happens) and accept the loss — the user couldn't have logged in either way. Confirm this position during `/write-plan`.
- [ ] **Retry strategy parameters.** Recommend max 3 attempts, linear 50ms / 150ms / 300ms backoff, total upper bound ~500ms so it doesn't block the request beyond reason. Confirm during `/write-plan`.
- [ ] **`auditEvent()` blocking the response.** For login-failure audit, the user is already getting a generic 401. Awaiting the audit write adds a small latency (single-digit ms typical). Confirm this is acceptable; alternative is to spawn a tracked promise registered with an `await Promise.allSettled` shutdown hook so the process drains in-flight audits on SIGTERM.
- [ ] **Lint enforcement of "no direct `auditLog.create`".** Custom ESLint rule vs. project-level convention noted in `CLAUDE.md`. Recommend the lint rule (catches drift mechanically). Confirm during `/write-plan`.
- [ ] **Existing inline `auditLog.create` calls in services.** Each must be inspected during `/write-plan` to confirm transactional context. Sites needing migration: `apps/backend/src/services/export.service.ts:336` (uses bare `prisma`); `apps/backend/src/services/household.service.ts:649` (uses `tx`, safe); `apps/backend/src/services/cashflow.service.ts:494` (uses `tx`, safe); `apps/backend/src/services/household.service.ts:514` (uses `tx`, safe). Final list to be confirmed during `/write-plan`.

---

## Implementation

> Interface-level constraints. `/write-plan` produces concrete code.

### Schema

No database changes. The existing `AuditLog` Prisma model is untouched.

### API

No HTTP API changes. Internal API surface:

- **`audited<T>(...)`** — unchanged.
- **`auditEvent(entry: AuditEventEntry): Promise<void>`** — new. Transactional single-row insert with retry. Caller awaits. Throws on retry exhaustion. Used for mutationless events (login attempts, logout, refresh).
- **`auditService.log` export** — removed.

### Components

> Backend modules and tests. No UI.

- **`apps/backend/src/services/audit.service.ts`** — add `auditEvent()`; remove `auditService.log`. Internal: small retry helper used only by `auditEvent` (don't generalise prematurely).
- **`apps/backend/src/routes/auth.routes.ts`** — migrate ~8 `auditService.log` call sites to `auditEvent(...)`. Errors during audit propagate to the route's existing error handler (which masks them as a generic 500 in prod).
- **`apps/backend/src/services/export.service.ts`** — migrate the bare `prisma.auditLog.create` to `auditEvent` (or wrap the whole export in a `$transaction` and use inline `tx.auditLog.create` if the export already requires a transaction for other reasons; decision in `/write-plan`).
- **`apps/backend/src/test/journeys/auth.journey.test.ts`** — update the one `auditService.log` reference to use `auditEvent`.
- **`apps/backend/src/services/audit.service.test.ts`** — replace tests for the removed export; add full coverage for `auditEvent` retry behaviour.
- **(Optional) ESLint rule** — `apps/backend/eslint.config.js` adds a `no-restricted-syntax` selector blocking `prisma.auditLog.create` and `*.auditLog.create` calls outside `audit.service.ts`. Inline disable available for the audit service itself.
- **Docs note** — short addition to `CLAUDE.md` (Security Conventions section) replacing "Audit all mutations: Wrap every create/update/delete in `audited()`" with "Use `audited()` for mutations and `auditEvent()` for mutationless events; never call `prisma.auditLog.create` directly."

### Notes

**Why not just keep fire-and-forget for login failures?** Two reasons. First, brute-force detection logic that ingests audit data is only as reliable as the audit log; silent drops let an attacker poke under the radar during DB stress. Second, the existing `console.error`-on-failure path is invisible without log aggregation (which is explicitly out of scope per the roadmap). Awaited writes with bounded retry + structured log on exhaustion give the best of both worlds: durability when the DB is healthy, observability when it isn't.

**Why not an outbox?** Considered and rejected during the audit review. For finplan's scale (single backend, modest write rate), Postgres-as-the-sink is fast enough that a sync transactional write is fine. An outbox would add a worker/cron with no benefit. If write latency ever becomes a real bottleneck, the outbox can be revisited as a follow-up.

**Why remove `auditService.log` rather than deprecate it?** A deprecated export tends to find new callers. Removal forces every future contributor to use the safe APIs. The migration is small enough (~9 sites) to do in one PR.

**Order of work in `/write-plan`.** Add `auditEvent` → migrate auth routes → migrate journey test → audit and migrate inline `auditLog.create` sites → remove `auditService.log` export → add ESLint rule → update CLAUDE.md.

**Out of scope (intentional):** outbox pattern, async drainer/cron, log aggregation infrastructure, schema changes to `AuditLog`, new audit dimensions or fields, retroactive backfill of historical missing audit entries (none expected), refactoring the `audited()` wrapper itself.

## Security Notes

- **Compliance posture improves.** Failed-login audit is now durable (within retry budget); silent drops on transient DB errors no longer occur unless the DB is genuinely unreachable for the entire retry window.
- **No new external surface.** All changes are internal; no new routes, no new request paths, no new auth surfaces.
- **PII in retry-exhaustion logs.** When retries fail and the audit payload is logged to stderr as a fallback, that payload may include user IDs, IPs, user agents, and the action name. None of this is PII beyond what `pino`/Fastify already logs. Tokens, passwords, and password hashes are _not_ part of audit payloads (existing convention) — verify this holds for every migrated call site.
- **Latency regression.** Awaiting the audit write adds a small latency to login attempts (~1–5ms healthy, up to retry budget on error). Acceptable; login is not a hot path.
- **Lint rule as defense-in-depth.** Blocking `prisma.auditLog.create` outside the audit service prevents future contributors from re-introducing the unsafe pattern by accident. Pairs with the design-system ESLint rules already in place.
- **No `any` in audit paths.** Per CLAUDE.md security conventions, the new `auditEvent` and retry helper must be fully typed; no `as any` casts.
