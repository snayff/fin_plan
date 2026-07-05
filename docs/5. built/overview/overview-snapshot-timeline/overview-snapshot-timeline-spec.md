---
feature: overview-snapshot-timeline
design_doc: docs/plans/2026-03-25-overview-snapshot-timeline-design.md
status: implemented
priority: high
deferred: false
phase: 10
implemented_date: 2026-07-05
---

# Overview — Snapshot Timeline

## Intention

Users accumulate a history of financial snapshots over time. The timeline lets them browse that history directly from the overview, loading any past snapshot in read-only mode for comparison against their current plan.

## Description

A persistent strip above the overview waterfall, consisting of a meta row (date range label + save button) and a bar row (styled scroll arrows, scrollable dot track, Now button). Each dot represents a saved snapshot, positioned proportionally by time with a maximum gap cap so the track stays a reasonable width regardless of how many snapshots exist. The strip is always visible — even before the first snapshot is created. Clicking a dot enters snapshot mode, which transforms the page header into a read-only breadcrumb and hides edit controls throughout the overview.

## User Stories

- As a user, I want to see my saved snapshots as a timeline above the waterfall so that I can navigate to any point in my financial history.
- As a user, I want snapshot dots to be spaced by time so that the visual rhythm of the timeline reflects how often I've been saving.
- As a user, I want to scroll the timeline by dragging, using the scroll wheel, or clicking arrow buttons so that I can reach older snapshots easily.
- As a user, I want to click a snapshot dot to view my finances at that past date so that I can compare it to my live plan.
- As a user, I want the page to clearly communicate read-only mode so that I don't attempt to edit historical data.
- As a user, I want to jump between snapshots without exiting and re-entering snapshot mode so that comparison is quick.
- As a user with no snapshots yet, I want to see a clear prompt to save my first snapshot so that I understand the feature is available.

## Acceptance Criteria

- [ ] Snapshot timeline strip is always visible above the overview waterfall, even with zero snapshots
- [ ] Meta row shows `mm/yy – mm/yy` date range label on the left; updates dynamically as the visible window changes
- [ ] Meta row shows `[+ Save snapshot]` button right-aligned, 12px from container edge
- [ ] Bar row contains: styled `[◂]` button, scrollable track, styled `[▸]` button, `[Now]` button — all with 12px right padding from edge
- [ ] `[◂]` and `[▸]` are styled bordered buttons (28×28px, surface background, `radius` border-radius); disabled at scroll limits
- [ ] Dot positions are computed proportionally: `gap_px = min(days_between × 1.1, 130)`; gaps accumulate left to right
- [ ] Auto-generated snapshots (isAuto = true) render with a dashed ring dot; manual/wizard snapshots use a solid ring
- [ ] Selected (active) snapshot dot renders with `action` colour fill and a glow ring
- [ ] Hover over any dot shows a tooltip: snapshot name + full date (e.g. "10 April 2023"); tooltip uses `surface-overlay` background + `surface-overlay` border
- [ ] Dot click triggers a loading state on that dot (brief spinner or pulse animation) while `GET /api/snapshots/:id` is in flight
- [ ] If snapshot fetch fails, dot returns to unselected state and a toast error is shown; snapshot mode is not entered
- [ ] Year boundaries (1 January) are marked with a faint vertical line and year label at the bottom of the track
- [ ] Left and right edge fade masks indicate scrollable overflow
- [ ] Scroll wheel up = forward in time (towards Now); scroll wheel down = backward in time
- [ ] Click+drag on the track scrolls it horizontally
- [ ] `[Now]` button scrolls the track so the Now pip is visible at the right edge; dims/disables when already there
- [ ] **Empty state:** track shows "No snapshots yet" in `text-muted`; no dots, no date range, no year markers; `[+ Save snapshot]` still visible; Now is dimmed
- [ ] **Single snapshot:** date range label shows `mm/yy` only (no dash); no year markers unless the snapshot is in a different year from the current year
- [ ] Clicking a dot enters snapshot mode
- [ ] In snapshot mode: page header transforms to breadcrumb `Overview  ›  [name]  ·  Read only` with `[← Live view]` button right-aligned
- [ ] Snapshot name in breadcrumb is truncated at 40 characters with ellipsis if needed
- [ ] "Read only" tag uses `attention` amber token with low-opacity background
- [ ] In snapshot mode: overview waterfall panels display the snapshot's frozen `data` values
- [ ] In snapshot mode: all edit controls (Edit, Still correct, add/delete) are hidden from the waterfall panels
- [ ] In snapshot mode: `[+ Save snapshot]` button is hidden
- [ ] In snapshot mode: timeline strip remains visible; clicking another dot navigates to that snapshot (breadcrumb updates, no exit required)
- [ ] Clicking `[← Live view]` exits snapshot mode: restores page header, save button, edit controls; deselects dot
- [ ] Clicking `[Now]` in the bar row also exits snapshot mode (equivalent to `[← Live view]`)
- [ ] All dot selection transitions are 150–200ms ease-out; animations are suppressed when `prefers-reduced-motion: reduce` is set

## Open Questions

- [x] How many dots are visible before scrolling is needed? **No fixed limit — all dots are in the track, which scrolls.** Expected volume ~5/year.
- [x] Overflow strategy: scrollable, paginated, or capped? **Scrollable with proportional spacing and a 130px max gap.** See design doc.
- [x] Where does the read-only indicator live? **Page header breadcrumb — always visible, not a floating or conditional banner.**
- [x] Does the timeline stay visible during snapshot mode? **Yes — the user can navigate between snapshots without exiting.**
- [x] Where does `[+ Save snapshot]` live? **Meta row, right-aligned above `[Now]`.** Hidden during snapshot mode.

---

## Implementation

### Schema

```prisma
model Snapshot {
  id          String    @id @default(cuid())
  householdId String
  name        String
  isAuto      Boolean   @default(false)
  data        Json      // full serialised WaterfallSummary at creation time
  createdAt   DateTime  @default(now())

  @@unique([householdId, name])
}
```

### API

```
GET    /api/snapshots       → list (id, name, isAuto, createdAt — no data payload)
GET    /api/snapshots/:id   → full snapshot including data Json
POST   /api/snapshots       → create { name, isAuto? } — server populates data from current WaterfallSummary
PATCH  /api/snapshots/:id   → rename { name } — 409 if name already taken in household
DELETE /api/snapshots/:id   → delete
```

### Components

- `SnapshotTimeline.tsx` — full strip (meta row + bar row). Owns scroll state (`scrollX`). Computes dot positions from snapshot list using proportional gap algorithm. Renders year markers, dot wrappers, Now pip, edge fade masks. Emits `onSnapshotSelect(id | null)`.
- `SnapshotDot.tsx` — single dot: solid or dashed ring, selected state, hover tooltip with name and formatted date.
- `CreateSnapshotModal.tsx` — name input pre-populated with "Month YYYY" (editable); on 409 shows inline error "A snapshot with this name already exists — choose a different name."; on success closes and timeline refetches.
- `OverviewPageHeader.tsx` — renders either plain `"Overview"` heading (live mode) or the read-only breadcrumb: `Overview › [name] · Read only` + `[← Live view]` button. Receives `activeSnapshot: SnapshotMeta | null`.

### Notes

**Dot position algorithm:**

```typescript
const PAD_LEFT = 20; // px before first dot
const PAD_RIGHT = 60; // px after last dot (room for Now pip)
const PX_PER_DAY = 1.1;
const MIN_GAP_PX = 16; // prevents dot overlap when two snapshots share a date
const MAX_GAP_PX = 130;

function buildPositions(snapshots: SnapshotMeta[]): number[] {
  const positions = [PAD_LEFT];
  for (let i = 1; i < snapshots.length; i++) {
    const days = (snapshots[i].createdAt - snapshots[i - 1].createdAt) / 86400000;
    const gap = Math.max(MIN_GAP_PX, Math.min(days * PX_PER_DAY, MAX_GAP_PX));
    positions.push(positions[i - 1] + gap);
  }
  return positions;
}

// total inner width = last position + PAD_RIGHT
// Now pip x = last position (right edge of last dot gap)
```

**Year marker positions** are computed the same way — for each 1 Jan between the first and last snapshot, interpolate its x position between the surrounding two snapshot positions.

**Scroll behaviour:**

- Wheel: `scrollX -= event.deltaY * 0.8` (inverted — up = forward)
- Drag: `scrollX = dragStart + (mouseStartX - currentX)`
- Arrow buttons: pan by 200px per click
- Now button: `scrollX = totalInnerWidth - viewportWidth` (scroll to right edge)

**Snapshot mode — data flow:**

- `OverviewPage` holds `activeSnapshotId: string | null` in local state
- When set, `GET /api/snapshots/:id` is fetched; response `data` (WaterfallSummary) replaces the live summary in the left and right panels
- All waterfall panel components receive `isReadOnly: boolean`; when true they render values only — no Edit, no "Still correct", no add/delete controls

**Auto Jan 1 snapshot:**

- On the first `GET /api/waterfall` call of a new calendar year, the server checks whether a snapshot named `"January [YEAR] — Auto"` exists for the household
- If not, it creates one silently (isAuto = true) before returning the summary
- This logic lives in the waterfall summary handler, not a cron job

**`[+ Save snapshot]` visibility:**

- Hidden (`display: none`, not `visibility: hidden`) when `activeSnapshotId !== null`
- Clicking it opens `CreateSnapshotModal`

**Snapshot name truncation in breadcrumb:**

- CSS `max-width` + `overflow: hidden` + `text-overflow: ellipsis` on the name span
- Full name available in tooltip on hover

**Security:**

- All `/api/snapshots` routes are JWT-protected; `householdId` is always derived server-side from the token, never from the request body
- `GET /api/snapshots/:id` must verify `snapshot.householdId === req.user.householdId`; return **404** (not 403) on mismatch to prevent ID enumeration
- Snapshot `name` is validated via Zod in `packages/shared`: required string, trimmed, max 100 characters
- `GET /api/snapshots` list response returns only `id, name, isAuto, createdAt` — the full `data` JSON is never included in list responses
