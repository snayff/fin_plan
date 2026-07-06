---
feature: snapshot-system
status: implemented
priority: high
deferred: false
phase: 10
implemented_date: 2026-07-05
---

# Snapshot System

## Intention

Snapshots let users track their financial progress over time by preserving point-in-time records of their plan. They provide a history without requiring manual effort, and serve as the output of the review wizard.

## Description

Named, timestamped snapshots are created automatically at key moments (1 Jan each year, review wizard completion, significant value changes) or manually. Snapshots are read-only. Per-item history (24 months) is independent of snapshots and always available.

## User Stories

- As a user, I want snapshots created automatically at key moments so that I have a history without manual effort.
- As a user, I want to manually save a snapshot at any time so that I can capture a meaningful moment.
- As a user, I want to give snapshots meaningful names so that I can identify them in the timeline.
- As a user, I want 24 months of per-item history available at all times, independent of snapshots, so that individual item changes are always visible.

## Acceptance Criteria

- [ ] Auto-creation triggers: 1 January each year, Review Wizard completion, significant value change, manual via `[+ Save snapshot]`
- [ ] Snapshot names are unique per household
- [ ] Auto-generated names are reserved and cannot be reused for manual snapshots
- [ ] Snapshots are read-only — no editing possible in snapshot mode
- [ ] Per-item history shows 24 months regardless of current snapshot view
- [ ] Timeline shows snapshot dots; gap navigation with ◂ / ▸
- [ ] Snapshots can be renamed and deleted in Settings

## Open Questions

- [x] What constitutes a "significant value change" that triggers an automatic snapshot? **Any change to an income source amount** (PATCH to IncomeSource where the amount field changes). Prompt shown before the update: "Save a snapshot before updating?" with Yes/No. If Yes: opens CreateSnapshotModal, then proceeds with the update.
- [x] What are the reserved auto-generated name formats? **"January [YEAR] — Auto"** (e.g. "January 2026 — Auto") for the automatic Jan 1 snapshot.
- [x] Is there a maximum number of snapshots per household? **No defined maximum.**

---

## Implementation

### Schema

```prisma
model Snapshot {
  id          String    @id @default(cuid())
  householdId String
  name        String
  isAuto      Boolean   @default(false)
  data        Json      // full serialised WaterfallSummary at creation
  createdAt   DateTime  @default(now())
  @@unique([householdId, name])
}
```

### API

```
GET    /api/snapshots       → list (id, name, isAuto, createdAt only — not full data)
GET    /api/snapshots/:id   → full snapshot including data
POST   /api/snapshots       → create { name, isAuto? } — data auto-populated by calling getWaterfallSummary()
PATCH  /api/snapshots/:id   → rename { name } — 409 on duplicate name (catch P2002)
DELETE /api/snapshots/:id   → delete
```

### Components

- `SnapshotTimeline.tsx` — proportional dot layout; `[+ Save snapshot]` button; ◂/▸ navigation
- `CreateSnapshotModal.tsx` — name input; 409 → inline error

### Notes

**Auto Jan 1 snapshot:** In the `GET /api/waterfall` handler, check: if today is Jan 1 and no "January [YEAR] — Auto" snapshot exists for this household → create it silently. Runs on first Overview page load of the new year.

**Snapshot creation triggers (summary):**

| Trigger                     | Mechanism                                            |
| --------------------------- | ---------------------------------------------------- |
| Jan 1 auto                  | Server-side check in waterfall summary endpoint      |
| Review Wizard completion    | Step 5 "Save & finish"                               |
| Income source amount change | Client-side prompt before PATCH; user chooses Yes/No |
| Manual                      | `[+ Save snapshot]` on SnapshotTimeline              |

**Income source change prompt:** detect in the Update mutation for income sources only. If the `amount` field changes: show prompt "Save a snapshot before updating?" before calling PATCH. No "Don't ask" option.

**Snapshot view behaviour:**

- `viewingSnapshot` state in `OverviewPage`; pass `snapshot.data` to `WaterfallLeftPanel` as override
- Pass `snapshotDate={viewingSnapshot.createdAt}` to all `HistoryChart` instances — adds amber dashed reference line at that date
- Per-item history display limit (24 months) does **not** change when viewing a snapshot
- All edit actions disabled (`disabled={true}` on all `ItemDetailPanel` instances)
