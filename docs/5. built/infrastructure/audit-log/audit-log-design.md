---
feature: audit-log
status: approved
creation_date: 2026-03-26
status: implemented
implemented_date: 2026-07-05
---

# Audit Log — Design

> **Purpose:** Captures the approved product direction — the problem, the chosen approach, and the key decisions made during requirement refinement. This is the input to `/write-spec`. It is intentionally product-level: no Prisma syntax, no route shapes, no component trees.

## Problem

There is no record of who changed what in a household. In a multi-member household, owners have no visibility into the history of mutations — who edited an income source, who removed a member, who changed a setting. Without an audit trail, there is no accountability, no ability to diagnose accidental changes, and no way to answer "who did this and when?"

## Approved Approach

Introduce a household-scoped, immutable audit log that records every mutation with full before/after diffs, using a transactional `audited()` wrapper that ensures every mutation and its corresponding audit entry succeed or fail together.

**Key elements:**

- **New `admin` role** added to the household role hierarchy (owner > admin > member). Admin shares all owner permissions except removing other admins. Both owner and admin can view the audit log.
- **`audited()` wrapper** — a generic helper that wraps service-layer mutations in a Prisma transaction: fetches before state, runs the mutation, computes a field-level diff, and writes the audit entry atomically.
- **Household-scoped entries** — the audit log model gains a `householdId` field (nullable, to preserve existing user-scoped auth events). A denormalised `actorName` is stored so former members' names remain visible.
- **Query endpoint** — owner/admin only, with cursor-based pagination and filters for date range, member, and resource type.
- **Application-layer immutability** — no update or delete methods are exposed. The audit service only provides insert and read operations.

This was chosen over a Prisma client extension (automatic interception) because the wrapper approach gives explicit control over what gets logged, makes it easy to inject user context (actor, IP, user-agent), and naturally fits the transactional requirement. It was chosen over manual per-service logging because the wrapper reduces boilerplate and makes it harder to forget the audit step.

## Key Decisions

### Backend

| Decision                 | Choice                                          | Rationale                                                                                                  |
| ------------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Role model               | Add `admin` role (owner > admin > member)       | User wants audit access for non-owners. Admin shares owner permissions except can't remove other admins.   |
| What to log              | All household mutations                         | Full visibility into every change, not just management actions.                                            |
| Change detail            | Full before/after diff                          | Maximum auditability — users can see exactly what changed and what it was before.                          |
| Write mode               | Transactional (same DB transaction as mutation) | If audit write fails, mutation rolls back. Maximum integrity — no unaudited changes.                       |
| Immutability enforcement | Application-layer only                          | No update/delete methods exposed. Simple and sufficient for a planning app — no DB triggers needed.        |
| Auth events              | Separate from household log                     | Auth events remain user-scoped with existing fire-and-forget pattern. Not surfaced in household audit log. |
| Former members           | Keep entries, show name                         | `actorName` denormalised into each entry so names persist after member removal.                            |
| Retention                | Indefinite                                      | Never prune. Volume is modest for a planning app.                                                          |
| Pagination               | Cursor-based on `createdAt`                     | Stable cursors for append-only data. Newest entries first.                                                 |
| Query filters            | Time range + member + resource type             | Covers primary use cases without over-engineering. No free-text search.                                    |
| Action naming            | `VERB_RESOURCE` in SCREAMING_SNAKE_CASE         | Follows existing pattern (e.g. `CREATE_INCOME_SOURCE`, `UPDATE_COMMITTED_ITEM`, `INVITE_MEMBER`).          |
| Wrapper approach         | `audited()` helper function                     | Balances explicitness with reduced boilerplate. Naturally transactional.                                   |

### Frontend — Audit Log Viewer

| Decision           | Choice                                                    | Rationale                                                                                                                                                                           |
| ------------------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page location      | Settings subsection                                       | Audit log is a management/admin feature — fits naturally alongside Household settings. No nav bar changes needed.                                                                   |
| Layout             | Settings two-panel (left panel category, right panel log) | Follows existing Settings pattern. No new page shell required.                                                                                                                      |
| Entry presentation | Compact table with inline changes column                  | Dense but readable. No click-to-expand — all information visible in the row.                                                                                                        |
| Table columns      | When / Who / Action / Resource / Changes                  | Five columns covering all key information at a glance.                                                                                                                              |
| Action badge       | Neutral pill with `page-accent` tinted Lucide icon        | Icon shape distinguishes action type (Plus, Pencil, Trash2, UserPlus). All icons use `page-accent` — no colour-coding by action type. Badge background is `rgba(238,242,255,0.06)`. |
| Resource label     | Name + muted type below                                   | Resource name in `text-secondary`, type label in `text-muted` below (e.g. "British Gas" / "Committed Spend").                                                                       |
| Changes format     | `field old → new` with multi-field stacking               | Updates: `amount £98 → £122`. Creates: `amount £15.99` (no old value). Deletes: strikethrough on old values.                                                                        |
| Filters            | Three dropdowns: member, resource type, date range        | `Select` components with `surface-elevated` backgrounds, placed above the table.                                                                                                    |
| Pagination         | "Load older entries" link below the table                 | `page-accent` coloured link, cursor-based — consistent with append-only data.                                                                                                       |
| Page glow          | Inherit Settings glow                                     | Same neutral ambient glow as the rest of Settings — audit log is a subsection, not a distinct page.                                                                                 |
| Empty state        | Ghosted table rows + muted text                           | 2–3 fading skeleton rows matching the table layout, with "No changes recorded yet" message. No CTA.                                                                                 |
| Selected state     | `page-accent` left border + 14% background                | Matches Settings category selected pattern.                                                                                                                                         |
| Typography         | Timestamps in `font-numeric`, labels in `font-body`       | Consistent with design system roles. Action text and names in `font-body`, values in `font-numeric`.                                                                                |

### Visual Treatment Details

**Action icon map:**

| Action  | Icon       | Library |
| ------- | ---------- | ------- |
| Created | `Plus`     | Lucide  |
| Updated | `Pencil`   | Lucide  |
| Deleted | `Trash2`   | Lucide  |
| Invited | `UserPlus` | Lucide  |

All icons: 11px, `page-accent` (`#8b5cf6`) stroke, stroke-width 2.5.

**Changes column formatting:**

- **Update**: `field` in `text-tertiary`, old value in `text-muted`, `→` in `text-tertiary`, new value in `text-primary`. All in `font-numeric`.
- **Create**: `field` in `text-tertiary`, value in `text-primary`. No old value shown.
- **Delete**: `field` in `text-tertiary`, old value in `text-muted` with `text-decoration: line-through`.
- **Multi-field**: Each changed field stacks vertically within the cell.

## Out of Scope

- Auth event surfacing (login/logout/password change remain logged but not exposed)
- Database-level immutability enforcement (triggers, append-only DB roles)
- Audit log export (CSV, PDF)
- Notification/alerting on specific audit events
- Retention policies or cleanup jobs

## Visual Reference

- `audit-final-mockup.html` — complete audit log within Settings two-panel layout, showing table with action badges, resource labels, and inline changes
