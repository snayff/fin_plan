---
feature: planner-purchases
status: implemented
priority: medium
deferred: false
phase: 9
implemented_date: 2026-07-05
---

# Planner — Purchases

## Intention

Users want to plan and track intended purchases — things they intend to buy — without conflating them with transactional spending. The planner captures intent and priority, not receipts.

## Description

A purchase list organised by status (planned / done), with a budget that can be manually set or derived from the sum of scheduled items. Each purchase records cost, priority, funding source, and optional notes. A left panel shows the budget total and an amber attention indicator when planned purchases exceed it.

## User Stories

- As a user, I want to record planned purchases with costs and priorities so that I can decide what to buy and when.
- As a user, I want to link a purchase to a funding source so that I know which account or surplus will cover it.
- As a user, I want to see an indicator when my planned purchases exceed my budget so that I'm aware of over-commitment.
- As a user, I want to mark a purchase as done so that I can track what I have already bought.

## Acceptance Criteria

- [ ] Purchases are shown by status: ● planned, ✓ done
- [ ] Each purchase has: name, cost, priority, scheduled flag, funding sources (multi-select), optional account link, status, reason, comment, added date
- [ ] Language uses "budgeted / planned / allocated / expected" — never "spent / paid / charged"
- [ ] Left panel shows: budget total, scheduled total, over-budget indicator (amber `attention` token) when scheduled > budget
- [ ] Budget can be set manually or derived from the sum of all scheduled items
- [ ] Right panel (item selected) shows full item detail

## Open Questions

- [x] What are the valid status enum values beyond planned and done? **not_started / in_progress / done** (no "planned" — the list uses not_started and in_progress as the active states).
- [x] Can funding sources include both surplus and specific wealth accounts simultaneously? **Yes** — `fundingSources` is a `String[]` (multi-select); `fundingAccountId` is a separate optional field pointing to a specific WealthAccount when "Savings" is in fundingSources.
- [x] Is "priority" a free text field or an enum (e.g. high / medium / low / want)? **Enum: lowest / low / medium / high.**

---

## Implementation

### Schema

```prisma
enum PurchasePriority {
  lowest
  low
  medium
  high
}

enum PurchaseStatus {
  not_started
  in_progress
  done
}

model PurchaseItem {
  id                String           @id @default(cuid())
  householdId       String
  yearAdded         Int              // calendar year
  name              String
  estimatedCost     Float
  priority          PurchasePriority @default(low)
  scheduledThisYear Boolean          @default(false)
  fundingSources    String[]         // e.g. ["savings", "bonus", "purchasing_budget"]
  fundingAccountId  String?          // optional link to WealthAccount (when fundingSources includes "savings")
  status            PurchaseStatus   @default(not_started)
  reason            String?
  comment           String?
  addedAt           DateTime         @default(now())
  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt
}

model PlannerYearBudget {
  id             String    @id @default(cuid())
  householdId    String
  year           Int
  purchaseBudget Float     @default(0)
  giftBudget     Float     @default(0)
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  @@unique([householdId, year])
}
```

### API

```
GET    /api/planner/purchases           → list PurchaseItem where yearAdded = year (defaults current year)
POST   /api/planner/purchases           → create { name, estimatedCost, priority?, scheduledThisYear?, fundingSources?, fundingAccountId?, status?, reason?, comment? }
PATCH  /api/planner/purchases/:id       → update any fields
DELETE /api/planner/purchases/:id       → delete

GET    /api/planner/budget/:year        → get PlannerYearBudget (auto-creates with defaults if missing)
PUT    /api/planner/budget/:year        → upsert { purchaseBudget?, giftBudget? }
```

### Components

- `PlannerLeftPanel.tsx` — PURCHASES section with budget + scheduled total + over-budget indicator (amber `attention` token); GIFTS section with budget + estimated total
- `PurchaseListPanel.tsx` — list of purchases grouped by status (active then done); `[ + Add purchase ]` button; clicking item → `PurchaseDetailPanel` with breadcrumb `← Purchases / {name}`

### Notes

- Budget shown in left panel is the manually-set `PlannerYearBudget.purchaseBudget`
- "Scheduled" total = sum of `estimatedCost` where `scheduledThisYear = true`
- Over-budget indicator (amber `attention` token) when scheduled total > budget
- Prior years: read-only (all mutations disabled when `year < currentYear`)
- Year selector `‹ 2025  2026 ›` in page header; defaults to current year
- Language: "budgeted / planned / allocated / expected" — never "spent / paid / charged"


## Remaining Work

Purchase list, inline editing, backend routes, and year budget are implemented. Outstanding:

- [ ] PurchaseDetailPanel: right-panel detail view for a selected purchase (spec requires dedicated right panel; current implementation uses inline editing within PurchaseListPanel instead)
- [ ] STATUS_LABELS enum mismatch: current implementation uses "planned" and "cancelled" which are not in the spec — should be "not_started", "in_progress", "done" per spec
- [ ] Priority enum: add "lowest" as the lowest priority option (currently lowest value is "low")
