---
feature: audit-log
design_doc: docs/4. planning/audit-log/audit-log-design.md
creation_date: 2026-03-29
status: implemented
implemented_date: 2026-07-05
---

# Audit Log

> **Purpose:** Captures _what_ the feature does and _why_ — user stories, acceptance criteria, and interface-level implementation constraints. This is the input to `/write-plan`. It is intentionally not a technical plan: no Prisma syntax, no route code, no component file paths.

## Intention

Multi-member households have no visibility into who changed what. The audit log provides an immutable, household-scoped record of every mutation — giving owners and admins the accountability and diagnostic capability to understand and recover from accidental changes.

## Description

Introduces a new `admin` role (owner > admin > member), a transactional `audited()` wrapper that records every household mutation atomically, and an Audit Log section in Settings accessible to owners and admins. The log captures actor, action, resource, and full before/after field-level diffs. Former members' names remain visible in historical entries. All filtering and pagination happen server-side.

## User Stories

- As a household owner or admin, I want to see a chronological list of every change in my household so I can understand what happened and when.
- As a household owner or admin, I want to filter the log by member, resource type, and date range so I can locate relevant entries quickly.
- As a household owner or admin, I want to see the exact before and after values for each change so I can verify or reverse accidental edits.
- As a household owner, I want to assign the admin role to a trusted member so they can view the audit log without receiving full owner access.
- As a household owner or admin, I want to invite someone directly as an admin so I don't need a separate promotion step after they join.
- As a household owner, I want former members' names to remain visible in old audit entries so the history stays meaningful after someone leaves.

## Acceptance Criteria

### Schema

- [ ] `HouseholdRole` enum gains an `admin` value; the hierarchy is owner > admin > member
- [ ] `AuditLog` model gains: `householdId` (nullable FK to Household), `actorId` (nullable, user ID at time of action), `actorName` (nullable, display name at time of action), `changes` (nullable JSON, structured field-level diff)
- [ ] `AuditLog.householdId` and `AuditLog.actorId` are indexed
- [ ] Existing `userId`, `metadata`, `ipAddress`, `userAgent` fields are retained for backward compatibility with auth events

### Backend — `audited()` wrapper

- [ ] `audited()` runs in a single Prisma transaction: fetch before state → run mutation → compute diff → write `AuditLog` entry
- [ ] If the audit write fails, the mutation rolls back (no unaudited changes)
- [ ] `actorId`, `actorName`, `ipAddress`, and `userAgent` are injected from the authenticated request context
- [ ] `changes` stores a structured diff as an array of `{ field, before?, after? }` objects — new keys are creates, removed keys are deletes, changed values are updates
- [ ] All existing household mutation routes across waterfall, wealth, household management, settings, planner, setup-session, and review-session are wrapped with `audited()`
- [ ] Action names follow `VERB_RESOURCE` in SCREAMING_SNAKE_CASE (e.g. `CREATE_INCOME_SOURCE`, `UPDATE_COMMITTED_BILL`, `INVITE_MEMBER`, `UPDATE_MEMBER_ROLE`, `UPDATE_HOUSEHOLD_SETTINGS`)
- [ ] The `resource` field stores a slug identifying the entity type (e.g. `income-source`, `household-settings`) for filtering

### Backend — query endpoint

- [ ] Query endpoint is accessible to owner and admin roles; member role receives 403
- [ ] Results are scoped to the caller's active household (never from request params)
- [ ] Results are returned newest-first, cursor-based on `createdAt` + `id` tiebreaker
- [ ] Supported filters: `actorId` (member), `resource` (resource type), `dateFrom` / `dateTo` (date range)
- [ ] Response includes: `id`, `actorName`, `action`, `resource`, `resourceId`, `changes`, `createdAt`; `ipAddress` and `userAgent` are excluded from the response
- [ ] A `nextCursor` field is returned when more entries exist; `null` when the end is reached
- [ ] No update or delete operations are exposed on `AuditLog`

### Backend — admin role management

- [ ] Invite endpoint accepts an optional `role` field (member | admin); defaults to `member`; owner and admin may both invite as admin
- [ ] Role-update endpoint allows: owner can promote/demote any non-owner member; admin can promote a member to admin; admin cannot demote another admin or the owner (403)
- [ ] Owner role cannot be changed via any API endpoint
- [ ] Invite role and role updates are validated via Zod schemas in `packages/shared`

### Frontend — Settings integration

- [ ] Audit Log appears as a new section in the Settings left nav
- [ ] Section is visible only to owner and admin; hidden for member role
- [ ] Table renders 5 columns: When / Who / Action / Resource / Changes
- [ ] Timestamps rendered in `font-numeric`; relative format (e.g. "2 hours ago") with absolute ISO tooltip on hover
- [ ] Action badges: neutral pill (`rgba(238,242,255,0.06)` background), `page-accent` (#8b5cf6) Lucide icon, 11px, stroke-width 2.5; icon map: Plus=created, Pencil=updated, Trash2=deleted, UserPlus=invited
- [ ] No colour-coding by action type — all badges use the same neutral treatment
- [ ] Resource column: name in `text-secondary`, type label in `text-muted` stacked below
- [ ] Changes column — Update: `field` in `text-tertiary` + old value in `text-muted` + `→` in `text-tertiary` + new value in `text-primary`, all in `font-numeric`
- [ ] Changes column — Create: `field` in `text-tertiary` + value in `text-primary`; no old value
- [ ] Changes column — Delete: `field` in `text-tertiary` + old value in `text-muted line-through`
- [ ] Multi-field entries stack each changed field vertically within the cell
- [ ] Three filter dropdowns above the table: Member, Resource Type, Date Range — `Select` components with `surface-elevated` backgrounds
- [ ] "Load older entries" link below the table, `page-accent` colour, cursor-based; hidden when `nextCursor` is null
- [ ] Empty state: 2–3 fading skeleton rows + "No changes recorded yet" in `text-muted`; no CTA
- [ ] Loading state: skeleton rows matching table column layout
- [ ] Error state: "Unable to load audit log" in `text-muted`

### Frontend — admin role assignment

- [ ] Invite flow gains a role selector (Member / Admin), defaulting to Member
- [ ] Each member row in the Household settings panel shows the member's current role
- [ ] Owner and admin can open a role action on a member row; owner can also demote admins; admin cannot act on other admins or the owner
- [ ] Promoting/demoting triggers an optimistic update and re-fetches membership data on settle

## Open Questions

_(none remaining)_

---

## Implementation

### Schema

- **HouseholdRole**: enum extended with `admin`. New value sits between `owner` and `member` in the application's permission checks; the DB enum has no ordering, so auth middleware enforces the hierarchy programmatically.
- **AuditLog** (extends existing model):
  - `householdId` — optional string, FK to `Household.id`. Null for auth events, populated for all household mutations.
  - `actorId` — optional string, the user ID at the time of the action (denormalised). Indexed for member filter.
  - `actorName` — optional string, the user's display name at the time of the action. Denormalised so former-member names persist.
  - `changes` — optional JSON. Structure: `Array<{ field: string; before?: unknown; after?: unknown }>`. New fields: `before` absent. Removed fields: `after` absent. Changed fields: both present.
  - Compound index `[householdId, createdAt]` added for paginated queries.
  - Existing `userId`, `metadata`, `ipAddress`, `userAgent` fields unchanged (auth event compat).

### API

- **`audited<T>(params)`** — generic service helper. Accepts: `db` (Prisma client), `ctx` (actorId, actorName, ipAddress, userAgent, householdId), `action` (string), `resource` (string), `resourceId` (string), `beforeFetch` (() => Promise\<Record\<string, unknown\> | null\>), `mutation` (() => Promise\<T\>). Returns the mutation result `T`. Diff is computed by comparing flat key sets before and after; nested JSON fields are treated as a single opaque value.
- **Query: get audit log** — owner/admin only, household-scoped. Params: `householdId` (from auth), `actorId?`, `resource?`, `dateFrom?`, `dateTo?`, `cursor?` (base64-encoded `{ createdAt, id }`), `limit` (default 50). Returns: `{ entries: AuditEntry[], nextCursor: string | null }`.
- **Update member role** — owner/admin only. Body: `{ targetUserId, role }`. Auth rules enforced in service layer (not just middleware). Returns updated membership.
- **Invite** — existing endpoint gains optional `role: 'member' | 'admin'` field. Invite stores role; applied on acceptance.
- All existing mutation service methods receive `audited()` wrapping. The wrapper is called at the service layer, not the route layer, so it captures the exact entity state from the DB.

### Components

- **AuditLogSection** — Settings section wrapper. Owns filter state and cursor state. Fetches paginated audit log. Renders `AuditLogFilters` + `AuditLogTable`. Manages loading, empty, and error states.
- **AuditLogFilters** — Three `Select` dropdowns: Member (populated from household members list), Resource Type (populated from a shared Zod enum of resource slugs), Date Range (Last 7 days / Last 30 days / Last 90 days / All time). Emits filter changes up to `AuditLogSection`.
- **AuditLogTable** — Renders the 5-column `<table>`. Maps entries to `AuditLogRow` components.
- **AuditLogRow** — Single row: formatted timestamp with tooltip, actor name, `ActionBadge`, resource label+type, `ChangesCell`.
- **ActionBadge** — Neutral pill with mapped Lucide icon. Receives `action` string, derives verb (created/updated/deleted/invited), renders correct icon in `page-accent`.
- **ChangesCell** — Renders stacked field diff rows. Handles update / create / delete formatting per spec. All values in `font-numeric`.
- **RoleSelector** — Controlled select for `member | admin`. Used in the invite modal and member row action. Labels: "Member", "Admin".

### Notes

- Auth event logging (fire-and-forget `auditService.log()` in `auth.routes.ts`) is entirely separate from the new `audited()` wrapper and must not be changed.
- The diff algorithm operates on flat DB record snapshots. If a mutated field is itself a JSON object (e.g. `metadata`), the entire field appears as one `{ field: 'metadata', before: {...}, after: {...} }` entry.
- `actorName` is the user's `displayName` at mutation time. If the user renames themselves later, historical entries retain the old name.
- Admin cannot demote other admins: service layer returns 403 when `callerRole === 'admin'` and `targetCurrentRole === 'admin'`.
- The `resource` slug values are a fixed set matching existing entity types, defined as a Zod enum in `packages/shared` so the frontend filter can use the same values.
- Page glow: Audit Log inherits the Settings glow — no new ambient glow token needed.
- `ipAddress` and `userAgent` are stored for internal audit integrity but are never returned to the frontend (privacy).
- `householdId` in the query is always derived from the authenticated user's active household — never trusted from request params.
- All new request/response shapes are defined as Zod schemas in `packages/shared/src/schemas/` — no inline validation in routes.
