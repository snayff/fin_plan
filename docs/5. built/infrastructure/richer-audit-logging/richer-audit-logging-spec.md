---
feature: richer-audit-logging
design_doc: docs/4. planning/richer-audit-logging/richer-audit-logging-design.md
creation_date: 2026-04-18
status: implemented
implemented_date: 2026-07-05
---

# Richer Audit Logging

## Intention

Close three compounding gaps in the current audit system so users see their own security activity, owners/admins see complete household history, and the taxonomy stays coherent over time. Auth events are persisted but unreachable; ~10 mutations are unaudited; `actorCtx` silently no-ops when forgotten; resource-slug strings drift from the enum; JSON blobs diff opaquely; and the table grows unbounded.

## Description

Two UI surfaces over one `AuditLog` table — no schema change. A new **Security activity** view on `/settings/profile` shows the caller's own auth events. The existing **Audit log** view on `/settings/household` (owner + admin) is extended to cover every previously-unaudited household mutation. Bulk operations and cascade deletes collapse to a single summary row with counts in `metadata`. `actorCtx` becomes compiler-required on mutating services, action names are centralised as an `AuditAction` const in `packages/shared`, missing resource slugs are added to `ResourceSlugEnum`, `computeDiff` descends one level into allowlisted flat JSON blobs, and an in-process interval purges rows older than 180 days.

## User Stories

- As a user, I want to see my own sign-ins, sign-outs, and session revocations on my profile so I can spot suspicious activity on my account.
- As a user, I want failed sign-in attempts surfaced without the email that was tried so I'm security-aware without leaking form data.
- As a user, I want routine token-refresh heartbeats hidden from my security activity so the list stays meaningful.
- As a household owner or admin, I want every household mutation — snapshots, gifts, planner budgets, household rename, profile edits, invite lifecycle, import/export, household deletion — visible in the audit log so I have complete accountability.
- As a household owner or admin, I want bulk operations and cascade deletes to appear as a single summary entry with counts so the log stays readable during large operations.
- As a household owner or admin, I want edits to known structured settings (e.g. staleness thresholds) to show which sub-field changed so I can verify intent.
- As a user of either view, I want a disclosure that entries older than 180 days are automatically removed so I understand why very old history may be missing.

## Acceptance Criteria

### Security activity view (new, on /settings/profile)

- [ ] Visible as a section within `/settings/profile`
- [ ] Only the caller's own events are returned (scoped by `userId` from auth; `householdId IS NULL`); cannot see other users' events
- [ ] Three columns: **When** / **Action** / **Details**
- [ ] Event → detail copy mapping:
  - `REGISTER` → "Account created"
  - `LOGIN_SUCCESS` → "Signed in"
  - `LOGIN_FAILED` → "Sign-in attempt failed" (email never shown)
  - `LOGOUT` → "Signed out"
  - `SESSION_REVOKED` → "Session revoked"
  - `ALL_SESSIONS_REVOKED` → "All sessions revoked"
  - `UPDATE_PROFILE` → "Name changed from X to Y" (from `metadata`)
- [ ] `TOKEN_REFRESH` events persist in DB but are excluded from the response
- [ ] `ipAddress` and `userAgent` are never present in the response body
- [ ] Timestamps render in `font-numeric`, relative with ISO tooltip, newest-first
- [ ] Cursor-based pagination with "Load older entries" affordance; hidden when no more entries
- [ ] Loading state: skeleton rows matching the three-column layout
- [ ] Empty state: "No recent activity" in `text-muted`
- [ ] Error state: "Unable to load activity" in `text-muted`
- [ ] Footer note below the table: "Entries older than 180 days are automatically removed."

### Audit log view (existing, on /settings/household)

- [ ] Gated to owner + admin (member → 403)
- [ ] Scope unchanged: household derived from auth context; never from request params
- [ ] `ipAddress` and `userAgent` remain excluded from the response
- [ ] Existing columns, filters, badges, pagination, and state copy are preserved
- [ ] Footer note below the table: "Entries older than 180 days are automatically removed."

### Coverage expansion (backend)

Every currently-unaudited household mutation produces an audit entry. The specific call sites are:

- [ ] Snapshot CRUD
- [ ] Gift persons CRUD
- [ ] Gift events CRUD
- [ ] Gift allocation bulk upsert → **one** summary row with `metadata.counts`
- [ ] Member profile CRUD
- [ ] Planner year-budget upsert → **one** summary row with `metadata.counts`
- [ ] Household rename
- [ ] Invite cancellation
- [ ] Leave household
- [ ] Data export
- [ ] Data import → **one** summary row with `metadata.counts`
- [ ] Invite acceptance
- [ ] Profile name change
- [ ] Household deletion → **one** `DELETE_HOUSEHOLD` row with `metadata.cascaded = { members, assets, liabilities, … }`
- [ ] Bulk operations emit exactly one summary entry (never one per child)
- [ ] Summary entries are written in the same transaction as the underlying mutation(s)

### Systemic integrity (backend)

- [ ] `actorCtx` is a required (non-optional) parameter on every service function that mutates household data; omitting it is a compile error
- [ ] All action-name strings in routes/services are replaced by references to `AuditAction` exported from `packages/shared`
- [ ] `AuditAction` members are SCREAMING_SNAKE_CASE `VERB_RESOURCE` and cover every action currently written by backend code
- [ ] A test fails if any backend code writes an action string not present in `AuditAction`, or if any `AuditAction` member is unused
- [ ] `ResourceSlugEnum` is extended with: `snapshot`, `user`, `gift-person`, `gift-event`, `gift-allocation`, `member-profile`, `year-budget`, `household`
- [ ] A test fails if any backend code writes a resource slug not in `ResourceSlugEnum`
- [ ] `computeDiff` descends one level into a `FLAT_JSON_ALLOWLIST` keyed by `resource.field`; initial entries: `household-settings.stalenessThresholds`
- [ ] JSON fields not in the allowlist continue to diff opaquely as a single `{ field, before, after }`
- [ ] `twoFactorEnabled` is added to `SYSTEM_FIELDS`

### Retention

- [ ] A `retentionService.purgeOldAuditLogs(db)` function issues a single indexed DELETE for rows where `createdAt < now − 180 days` and returns the number deleted
- [ ] `app.ts` registers a `setInterval(…, 24h).unref()` plus a one-time run ~60 s after boot (mirrors `tokenBlacklist`)
- [ ] Purge does not itself emit an audit entry
- [ ] No deployment-level config, cron job, or admin "purge now" control is introduced

## Open Questions

_(none — see design doc for resolved decisions)_

---

## Implementation

### Schema

- **No schema change.** Reuse the existing `AuditLog` model.
- `metadata` JSON conventions:
  - **Bulk:** `{ counts: { created?, updated?, deleted? } }`
  - **Cascade delete:** `{ cascaded: { members, assets, liabilities, … } }`
  - **`UPDATE_PROFILE`:** carries old/new display names so the Security view can render "Name changed from X to Y"
- `FLAT_JSON_ALLOWLIST` is an application-layer concept only (no DB change).

### API

- **Security activity query** (new) — JWT-protected. Derives `userId` from auth; filters `householdId IS NULL` and `action != TOKEN_REFRESH`. Cursor pagination, newest-first. Response excludes `ipAddress` / `userAgent`. Validated by a new Zod schema in `packages/shared`.
- **Audit log query** (existing) — unchanged filters, gating, and response shape.
- **Coverage expansion** — every mutation listed above is wrapped in `audited()` or writes a summary entry inside the same transaction.
- **`actorCtx` requirement** — becomes a non-optional parameter on all mutating service functions; routes supply it via the existing `actorCtx(req)` helper.
- **Shared contracts** — `AuditAction` (new const) and extended `ResourceSlugEnum` live in `packages/shared`. Both backend and frontend import from the same source.
- **Diff** — `computeDiff` consults `FLAT_JSON_ALLOWLIST`; matching fields emit one `AuditChange` per sub-key.
- **Retention** — `retentionService.purgeOldAuditLogs(db)` is idempotent; registered in `app.ts` alongside the existing interval pattern.

### Components

- **SecurityActivitySection** (new) — mounted in `/settings/profile`. Owns query state, pagination, and loading/empty/error rendering. Maps actions to the fixed detail copy.
- **AuditLogSection** (existing) — unchanged structure; gains the 180-day footer note.
- **Shared detail-copy map** — lives alongside `SecurityActivitySection`; entries match the Acceptance Criteria table exactly.
- **ChangesCell / ActionBadge** (existing) — unchanged; allowlisted JSON descent flows through as additional `changes[]` entries, rendering one stacked row per sub-key.

### Notes

- **`LOGIN_FAILED` privacy:** detail string must never include the attempted email, even if `metadata` contains it. The view mapper ignores `metadata` for this action.
- **`TOKEN_REFRESH`:** continues to be written (internal forensics) and is filtered out by the query, not by the writer.
- **Summary writes:** must share the underlying mutation's transaction — if the mutation rolls back, the summary row does too.
- **Compiler-enforced `actorCtx`:** achieved by making `actorCtx` a positional required parameter (not an optional field). Any caller that forgets it fails the type-check.
- **Retention disclosure:** identical wording in both views, beneath the table.
- **Denylist widening:** `SYSTEM_FIELDS` addition is future-proofing; no 2FA endpoint exists yet.
- **Auth-event writes** continue via the existing fire-and-forget `auditService.log()` path — this feature does not move auth event writing onto `audited()`.

#### Out of scope

- Alerting/anomaly detection (separate observability feature)
- 2FA / password / email-change auditing (no endpoints yet)
- Surfacing IP/UA in any UI
- Bulk export of audit data
- Role promotion/demotion events (already covered by existing `audited()` wrapper)
