---
feature: overview-item-detail
status: implemented
priority: high
deferred: false
phase: 6
implemented_date: 2026-07-05
---

# Overview — Item Detail Panel

## Intention

When a user selects a waterfall item, they need to see its current value, understand its history, and take action (edit or confirm staleness) without leaving the overview context.

## Description

The right panel displays the selected item's value prominently, a 24-month history graph, and a ButtonPair for editing or confirming the item. An optional NudgeCard may appear for contextual arithmetic suggestions. The savings row expands to show per-account allocations with optional links to Wealth.

## User Stories

- As a user, I want to see the full detail of a waterfall item when I click it so that I have context before acting.
- As a user, I want to view 24 months of an item's history so that I can understand how it has changed over time.
- As a user, I want to confirm an item is still correct without editing it so that staleness indicators are cleared quickly.
- As a user, I want to edit a waterfall item from its detail view so that updates are one click away.
- As a user, I want to see per-account savings allocations so that I know where my savings contributions go.

## Acceptance Criteria

- [ ] Selected item value is displayed at 30px, `font-numeric`, weight 800, `text-primary`
- [ ] 24-month history sparkline/graph is displayed below the value
- [ ] ButtonPair shows `[ Edit ]` on the left and `[ Still correct ✓ ]` on the right
- [ ] Still correct button is always the rightmost (affirmative) action
- [ ] NudgeCard appears in the right panel when applicable — one at a time, never stacked
- [ ] NudgeCard contains arithmetic and options only, never a recommendation
- [ ] Savings row expands to show per-account allocations with optional Wealth account link
- [ ] Right panel breadcrumb shows `← Tier / Item` when navigating to item detail

## Open Questions

- [x] What specific triggers cause a NudgeCard to appear in the overview item detail? **Yearly Bills row** (shows cashflow calendar link) and **Savings rows** (savings optimisation arithmetic). No NudgeCard on standard income, bill, or discretionary items.
- [x] Does the 24-month graph show raw values or changes? **Raw values.**

---

## Implementation

### Schema

```prisma
// WaterfallHistory — polymorphic history for all waterfall item types
model WaterfallHistory {
  id         String            @id @default(cuid())
  itemType   WaterfallItemType
  itemId     String
  value      Float
  recordedAt DateTime
  createdAt  DateTime          @default(now())
  @@index([itemType, itemId, recordedAt])
}
```

### API

```
GET  /api/waterfall/history/:type/:id   → WaterfallHistory[] last 24 months, sorted by recordedAt asc
POST /api/waterfall/income/:id/end      → set endedAt (defaults to now); source removed from live waterfall
POST /api/waterfall/income/:id/reactivate → clear endedAt
POST /api/waterfall/:type/:id/confirm   → update lastReviewedAt only (shared confirm for all item types)
```

### Components

- `ItemDetailPanel.tsx` — header: item name; value at 30px (`font-numeric`, weight 800); staleness label below value (amber `attention` token if stale); 24-month HistoryChart; `[ Edit ]` / `[ Still correct ✓ ]` ButtonPair; income sources only: "End this income source" secondary text link
- `HistoryChart.tsx` — Recharts `LineChart`; x=date, y=£ value; `snapshotDate` prop adds amber dashed `ReferenceLine`; `isAnimationActive={false}` when `prefers-reduced-motion`; empty state "No history yet" if `data.length < 2`

### Notes

- History graph shows **raw values** (not deltas)
- NudgeCard appears only on: Yearly Bills row (links to cashflow calendar) and Savings rows (savings optimisation hints). No NudgeCard on standard income/bill/discretionary items.
- "End this income source" opens inline prompt: "When did this income end?" with date input (defaults today). Submit calls `POST /api/waterfall/income/:id/end`. Source removed from live waterfall; history preserved. Reactivation available from Settings → Income sources (ended list).
- Edit opens inline form within the panel; submit calls PATCH then invalidates queries
- "Still correct" calls `POST /:id/confirm`; shows success toast
