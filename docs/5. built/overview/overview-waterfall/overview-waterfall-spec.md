---
feature: overview-waterfall
status: implemented
priority: high
deferred: false
phase: 5
implemented_date: 2026-07-05
---

# Overview — Waterfall Display

## Intention

The waterfall is the core mental model of FinPlan. Users need to see their income cascade through committed spend, discretionary spend, and surplus in a clear hierarchical layout — the closest analogue to a maintained personal spreadsheet.

## Description

A two-panel layout showing the waterfall from income through committed bills (monthly and yearly ÷12), discretionary spend, and surplus. The left panel displays tier headings and totals at a fixed width. The right panel fills the remaining space and updates based on selection.

## User Stories

- As a user, I want to see my income broken down into committed, discretionary, and surplus tiers so that I understand where my money is going at a glance.
- As a user, I want yearly bills shown as a monthly ÷12 figure so that annual costs feel equivalent to monthly ones.
- As a user, I want to see when my surplus falls below the common planning benchmark so that I have context for my financial picture.
- As a user with no data, I want a clear call to action so that I know how to get started.

## Acceptance Criteria

- [ ] Waterfall displays 4 tiers in order: Income, Committed (monthly + yearly ÷12), Discretionary, Surplus
- [ ] Left panel is fixed width with a border separator, never scrolls horizontally
- [ ] Right panel fills remaining space and shows empty state when nothing is selected
- [ ] Empty state shows CTA: "Set up your waterfall from scratch ▸"
- [ ] Surplus benchmark indicator (amber `attention` token — dot + "Below benchmark" text) is shown on the surplus tier row when surplus falls below the configured benchmark (default 10% of total income); absent otherwise (silence = approval)
- [ ] Income items support frequency: Monthly, Annual (÷12), One-off
- [ ] Yearly bills appear in the Committed tier as ÷12 virtual pot values
- [ ] WaterfallConnector lines (vertical line + annotation) appear between tiers
- [ ] Tier totals are shown next to each tier heading in the left panel
- [ ] Tier rows use the correct colour token: `tier-income`, `tier-committed`, `tier-discretionary`, `tier-surplus`

## Open Questions

- [x] Is the 10% surplus benchmark threshold configurable in Settings, or hardcoded? **Configurable** via `HouseholdSettings.surplusBenchmarkPct` (default 10%).

---

## Implementation

### Schema

```prisma
enum IncomeFrequency {
  monthly
  annual
  one_off
}

model IncomeSource {
  id             String          @id @default(cuid())
  householdId    String
  name           String
  amount         Float
  frequency      IncomeFrequency
  expectedMonth  Int?            // 1–12, one_off only
  ownerId        String?
  sortOrder      Int             @default(0)
  endedAt        DateTime?       // set when income ceases
  lastReviewedAt DateTime        @default(now())
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt
}

model CommittedBill {
  id             String    @id @default(cuid())
  householdId    String
  name           String
  amount         Float
  ownerId        String?
  sortOrder      Int       @default(0)
  lastReviewedAt DateTime  @default(now())
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
}

model YearlyBill {
  id             String    @id @default(cuid())
  householdId    String
  name           String
  amount         Float
  dueMonth       Int       // 1–12
  sortOrder      Int       @default(0)
  lastReviewedAt DateTime  @default(now())
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
}

model DiscretionaryCategory {
  id             String    @id @default(cuid())
  householdId    String
  name           String
  monthlyBudget  Float
  sortOrder      Int       @default(0)
  lastReviewedAt DateTime  @default(now())
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
}

model SavingsAllocation {
  id              String    @id @default(cuid())
  householdId     String
  name            String
  monthlyAmount   Float
  sortOrder       Int       @default(0)
  wealthAccountId String?   // optional link to WealthAccount
  lastReviewedAt  DateTime  @default(now())
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

enum WaterfallItemType {
  income_source
  committed_bill
  yearly_bill
  discretionary_category
  savings_allocation
}

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
GET    /api/waterfall                        → WaterfallSummary (full calculation)
GET    /api/waterfall/income                 → list active IncomeSource (endedAt null or future)
GET    /api/waterfall/income/ended           → list ended sources (for Settings view)
POST   /api/waterfall/income                 → create { name, amount, frequency, expectedMonth?, ownerId?, sortOrder? }
PATCH  /api/waterfall/income/:id             → update; records WaterfallHistory on amount change
DELETE /api/waterfall/income/:id             → delete (permanent; only if no history)
POST   /api/waterfall/income/:id/end         → set endedAt (defaults to now); excluded from live waterfall
POST   /api/waterfall/income/:id/reactivate  → clear endedAt; source returns to live waterfall
POST   /api/waterfall/income/:id/confirm     → update lastReviewedAt only

GET    /api/waterfall/committed              → list
POST   /api/waterfall/committed              → create { name, amount, ownerId?, sortOrder? }
PATCH  /api/waterfall/committed/:id          → update; records history on amount change
DELETE /api/waterfall/committed/:id
POST   /api/waterfall/committed/:id/confirm

GET    /api/waterfall/yearly                 → list
POST   /api/waterfall/yearly                 → create { name, amount, dueMonth, sortOrder? }
PATCH  /api/waterfall/yearly/:id             → update; records history on amount change
DELETE /api/waterfall/yearly/:id
POST   /api/waterfall/yearly/:id/confirm

GET    /api/waterfall/discretionary          → list
POST   /api/waterfall/discretionary          → create { name, monthlyBudget, sortOrder? }
PATCH  /api/waterfall/discretionary/:id      → update; records history on budget change
DELETE /api/waterfall/discretionary/:id
POST   /api/waterfall/discretionary/:id/confirm

GET    /api/waterfall/savings                → list (includes linked wealthAccount name if set)
POST   /api/waterfall/savings                → create { name, monthlyAmount, wealthAccountId?, sortOrder? }
PATCH  /api/waterfall/savings/:id            → update; records history on amount change
DELETE /api/waterfall/savings/:id
POST   /api/waterfall/savings/:id/confirm

POST   /api/waterfall/confirm-batch          → { items: { type: WaterfallItemType, id: string }[] } — batch confirm
DELETE /api/waterfall/all                    → delete all waterfall items (used by Settings → Rebuild)
```

### Components

- `WaterfallLeftPanel.tsx` — tier headings with totals only (no individual items in the left panel); each tier row includes an attention badge (amber dot + stale count, e.g. "● 3 stale") when ≥1 item in the tier is stale
- `TwoPanelLayout.tsx` — shared layout: fixed-width left `<aside className="w-[360px]">` + flexible `<main>`

### Notes

**WaterfallSummary shape:**

```typescript
interface WaterfallSummary {
  income: {
    total: number;
    monthly: IncomeSource[];
    annual: (IncomeSource & { monthlyAmount: number })[]; // amount/12
    oneOff: IncomeSource[];
  };
  committed: {
    monthlyTotal: number;
    monthlyAvg12: number; // sum of yearlyBills / 12
    bills: CommittedBill[];
    yearlyBills: YearlyBill[];
  };
  discretionary: {
    total: number;
    categories: DiscretionaryCategory[];
    savings: { total: number; allocations: SavingsAllocation[] };
  };
  surplus: {
    amount: number; // income.total - committed.monthlyTotal - committed.monthlyAvg12 - discretionary.total
    percentOfIncome: number;
  };
}
```

- IncomeSource where `endedAt` is set and in the past is excluded from live summary
- `DELETE /api/waterfall/all` is called by Settings → Waterfall → "Rebuild from scratch" confirm flow
- Surplus benchmark indicator uses `HouseholdSettings.surplusBenchmarkPct`; uses amber `attention` token (dot + text); tooltip text: "A monthly surplus of around 10% of income is a common planning benchmark."
