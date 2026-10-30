---
feature: planner-gifts
status: implemented
priority: medium
deferred: false
phase: 9
implemented_date: 2026-07-05
---

# Planner — Gifts

## Intention

Gift-giving is a predictable, recurring expense that benefits from advance planning. Users want to budget per person and per occasion so that gifts are thoughtful and financially considered, not a surprise to the budget.

## Description

A gift planner organised by person, with predefined and custom event types, per-person budgets, and a year selector. The default view shows upcoming events chronologically and what is already done this year. A by-person view shows budgets per person. Prior years are read-only.

## User Stories

- As a user, I want to plan gifts by person and event so that I don't forget important occasions or overspend.
- As a user, I want to set a budget per person so that I can manage my total gift spending across the year.
- As a user, I want to add custom events for people so that non-standard occasions are tracked alongside standard ones.
- As a user, I want to view prior years' gift records so that I can reference past spending.

## Acceptance Criteria

- [ ] Default view shows upcoming events chronologically + done this year
- [ ] By-person view lists people with their combined budget
- [ ] Person detail view shows: events list with individual budget and notes
- [ ] Predefined event types: Birthday, Christmas, Mother's Day, Father's Day, Valentine's, Anniversary
- [ ] Custom events support: Annual (user-set date) or One-off (specific date)
- [ ] Year selector `‹ 2025 2026 ›` allows switching years
- [ ] Prior years are read-only
- [ ] Language uses "budgeted / planned / allocated" — never "spent"

## Open Questions

- [x] Can a gift event have multiple line items with individual costs, or just a single budget figure? **Single budget figure per event** — stored in GiftYearRecord.budget for that year.
- [x] Are gift budgets linked to the waterfall discretionary tier, or standalone? **Standalone** — the planner gift budget is a manually-set annual figure, separate from the discretionary waterfall.
- [x] Can people in the gift planner be linked to household members? **Not linked** — GiftPerson is independent of household user accounts; names are free text.

---

## Implementation

### Schema

```prisma
enum GiftEventType {
  birthday
  christmas
  mothers_day
  fathers_day
  valentines_day
  anniversary
  custom
}

enum GiftRecurrence {
  annual
  one_off
}

model GiftPerson {
  id          String    @id @default(cuid())
  householdId String
  name        String
  notes       String?
  sortOrder   Int       @default(0)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}

model GiftEvent {
  id           String         @id @default(cuid())
  giftPersonId String
  householdId  String
  eventType    GiftEventType
  customName   String?        // custom events only
  dateMonth    Int?           // 1–12 (annual events with user-set date)
  dateDay      Int?           // 1–31
  specificDate DateTime?      // one_off custom events only
  recurrence   GiftRecurrence @default(annual)
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt
}

model GiftYearRecord {
  id          String    @id @default(cuid())
  giftEventId String
  year        Int
  budget      Float     @default(0)
  notes       String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  @@unique([giftEventId, year])
}
```

### API

```
GET    /api/planner/gifts/upcoming            → all events with computed nextDate, sorted chronologically; includes GiftYearRecord for year
GET    /api/planner/gifts/persons             → persons with aggregated budget totals for year
GET    /api/planner/gifts/persons/:id         → person with all events + year records

POST   /api/planner/gifts/persons             → create { name, notes? }
PATCH  /api/planner/gifts/persons/:id         → update { name?, notes? }
DELETE /api/planner/gifts/persons/:id         → delete (cascades events + year records)

POST   /api/planner/gifts/persons/:id/events  → create { eventType, customName?, dateMonth?, dateDay?, specificDate?, recurrence? }
PATCH  /api/planner/gifts/events/:id          → update event fields
DELETE /api/planner/gifts/events/:id          → delete

PUT    /api/planner/gifts/events/:id/year/:year  → upsert GiftYearRecord { budget, notes? }
```

### Components

- `PlannerLeftPanel.tsx` — GIFTS section with budget + estimated total + over-budget indicator (amber `attention` token)
- Gifts right panel — `[Upcoming ▾]` / `[By person ▾]` dropdown toggle
- `GiftPersonDetailPanel.tsx` — breadcrumb `← Gifts / {Name}`; events list; expanding inline edit for each event; `[ + Add event ]` + `[ Edit person ]`

### Notes

**Gift date calculation** (server-side utilities in `apps/backend/src/utils/gift-dates.ts`):

```typescript
export function ukMothersDay(year: number): { month: number; day: number };
// UK Mothering Sunday = 4th Sunday of Lent (Lent starts 46 days before Easter)

export function ukFathersDay(year: number): { month: number; day: number };
// UK Father's Day = 3rd Sunday of June

export function nextEventDate(event: GiftEvent, year: number): Date | null;
// Fixed: christmas (Dec 25), valentines (Feb 14)
// Calculated: mothers_day, fathers_day
// User-set: birthday, anniversary, custom annual → use dateMonth/dateDay
// One-off custom → use specificDate
```

- Upcoming view: events sorted by `nextDate` ascending; split into "Coming up" and "Done this year"
- By person view: persons listed with combined budget for year; `··· N more` when > visible threshold
- Prior years: read-only (all mutations disabled when `year < currentYear`)
- Language: "budgeted / planned / allocated" — never "spent"
