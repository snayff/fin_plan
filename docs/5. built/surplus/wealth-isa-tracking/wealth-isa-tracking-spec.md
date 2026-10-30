---
feature: wealth-isa-tracking
status: implemented
priority: medium
deferred: false
phase: 8
implemented_date: 2026-07-05
---

# Wealth — ISA Tracking

## Intention

UK residents have an annual ISA allowance that resets each April. Users need to track their remaining allowance per person to avoid exceeding the limit and to make the most of tax-free savings.

## Description

An allowance bar in the Wealth page showing per-person ISA contribution versus the annual limit, remaining allowance, and the April 5th deadline. Nudges appear when a person is approaching or at their limit.

## User Stories

- As a user, I want to see how much of my annual ISA allowance I have used so that I don't accidentally exceed the limit.
- As a user, I want to see the remaining allowance and deadline so that I can plan contributions before the tax year ends.
- As a user, I want a nudge when I am approaching or at my ISA limit so that I can make informed decisions.
- As a household with multiple members, I want separate ISA bars per person so that each person's allowance is tracked independently.

## Acceptance Criteria

- [ ] ISA allowance bar shown per person (not per household)
- [ ] Bar shows used amount, remaining amount, and total allowance
- [ ] April 5th deadline is shown with the bar
- [ ] Allowance resets on April 6th each year (UK tax year boundary)
- [ ] Nudge shown when approaching the limit (threshold TBD) and when at the limit
- [ ] Multiple household members each have their own independent bar
- [ ] ISA tax year is configurable in Settings

## Open Questions

- [x] What is the "approaching" threshold — 90% used? Should it be configurable? **Within ~£2,000 of the limit** — not configurable (hardcoded nudge threshold).
- [x] Does the ISA bar appear in a Savings sub-section or at the top of the Wealth page? **Below the account list in the Savings right panel** — only shown when assetClass === 'savings'.
- [x] Is the current allowance amount (£20,000) hardcoded or pulled from Settings? **From Settings** — `HouseholdSettings.isaAnnualLimit` (default £20,000).

---

## Implementation

### Schema

```prisma
// Fields on WealthAccount
model WealthAccount {
  isISA                Boolean  @default(false)
  isaYearContribution  Float?               // manually updated by user; no auto-reset
  ownerId              String?              // userId — drives per-person ISA allowance grouping
  ...
}

// Fields on HouseholdSettings
model HouseholdSettings {
  isaAnnualLimit      Float  @default(20000)
  isaYearStartMonth   Int    @default(4)   // UK: April
  isaYearStartDay     Int    @default(6)   // UK: 6th
  ...
}
```

### API

```
GET /api/wealth/isa-allowance   → { taxYearStart, taxYearEnd, annualLimit, byPerson: [{ ownerId, name, used, remaining }] }
```

### Components

- ISA allowance bar — rendered inside `AccountListPanel.tsx` when `assetClass === 'savings'`; one bar per person who owns ISA accounts; shows used / total with progress bar and April 5 deadline label

### Notes

**ISA allowance calculation:**

- Group ISA accounts (`isISA: true`) by `ownerId`
- For each owner: `used = sum(isaYearContribution)` across their accounts
- `remaining = isaAnnualLimit - used`
- Tax year boundaries derived from `HouseholdSettings.isaYearStartMonth` / `isaYearStartDay`

**`isaYearContribution` is manually maintained** — user updates this value when they make ISA contributions. There is no auto-reset; the user must manually zero it at the start of each new tax year (the new-tax-year banner in `AccountDetailPanel` prompts this).

**New tax year banner** (in AccountDetailPanel for ISA accounts): shown when `today >= April 6` and `account.updatedAt` predates the most recent April 6.
