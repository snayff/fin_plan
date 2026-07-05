---
feature: wealth-accounts
status: implemented
priority: high
deferred: false
phase: 8
implemented_date: 2026-07-05
---

# Wealth — Accounts

## Intention

Users need a single place to view all their financial accounts, understand their total wealth picture, and track how individual accounts are growing over time. This is not a transaction ledger — it tracks balances and intent, not individual transactions.

## Description

The Wealth page left panel shows total net worth, year-to-date change, and accounts grouped by asset class (Savings, Pensions, Investments, Property, Vehicles, Other) with a by-liquidity breakdown. The right panel shows individual account detail: balance, rate, contribution from waterfall, valuation date, 24-month history graph, and projected balance.

## User Stories

- As a user, I want to see all my financial accounts organised by asset class so that I have a complete picture of my wealth.
- As a user, I want to see my total net worth and how it has changed year-to-date so that I can track progress.
- As a user, I want to see a projected balance for each account based on its rate and contributions so that I can plan ahead.
- As a user, I want to record the valuation date of assets so that I know how current the figure is.
- As a user, I want to see a by-liquidity breakdown so that I understand the accessibility of my wealth.

## Acceptance Criteria

- [ ] Left panel shows total net worth + year-to-date change at the top
- [ ] By-liquidity breakdown shows: Cash & Savings / Investments & Pensions / Property & Vehicles
- [ ] Accounts grouped by asset class: Savings, Pensions, Investments, Property, Vehicles, Other
- [ ] Account list shows balance, rate (if applicable), and valuation date per account
- [ ] Right panel (account selected) shows: breadcrumb `← Asset Class / Account Name`, balance, rate, contribution from waterfall, valuation date, projected balance
- [ ] 24-month history graph in account detail
- [ ] Right panel (asset class selected) shows list of accounts in that class
- [ ] Breadcrumb navigation: `← Savings / Tandem ISA`
- [ ] Account list shows nudge card (savings only) when a higher-rate account has unused contribution capacity — one nudge maximum, silence if all optimised
- [ ] Asset class fields per class: Savings (provider, balance, interest rate, ISA flag, linked contribution); Pensions (provider, scheme ref, balance, owner); Investments (provider, holding name, balance, owner); Property (address/name, equity value, valuation date); Vehicles (name/reg, equity value, valuation date); Other (name, description, equity value, valuation date)
- [ ] "Update valuation" form collects balance + valuation date (defaults today, can be set to any past date)

## Open Questions

- [x] How are projections calculated for non-rate-bearing assets (property, vehicles)? **No projection shown** for property, vehicles, or other — projection is displayed for savings accounts only (requires interestRate).
- [x] Is valuation date required or optional when adding an account? **Defaults to today** — optional override; can be set to any past date.
- [x] Can contributions from multiple waterfall items link to one account? **Yes** — multiple SavingsAllocation records can reference the same wealthAccountId.

---

## Implementation

### Schema

```prisma
enum AssetClass {
  savings
  pensions
  investments
  property
  vehicles
  other
}

model WealthAccount {
  id                   String               @id @default(cuid())
  householdId          String
  assetClass           AssetClass
  name                 String
  provider             String?
  notes                String?              // class-specific: pension scheme ref, vehicle reg, property address, etc.
  balance              Float                @default(0)
  interestRate         Float?               // savings only
  isISA                Boolean              @default(false)
  isaYearContribution  Float?               // manually tracked: contributions this tax year
  ownerId              String?              // userId — for per-person ISA limit tracking
  isTrust              Boolean              @default(false)
  trustBeneficiaryName String?
  valuationDate        DateTime             @default(now())
  lastReviewedAt       DateTime             @default(now())
  createdAt            DateTime             @default(now())
  updatedAt            DateTime             @updatedAt
}

model WealthAccountHistory {
  id              String        @id @default(cuid())
  wealthAccountId String
  balance         Float
  valuationDate   DateTime
  createdAt       DateTime      @default(now())
  @@index([wealthAccountId, valuationDate])
}
```

### API

```
GET    /api/wealth                           → WealthSummary (net worth, ytd change, by liquidity, by class, trust)
GET    /api/wealth/accounts                  → list all, include linked savings allocations
GET    /api/wealth/accounts/:id              → single account with history + projection to Dec 31
POST   /api/wealth/accounts                  → create { assetClass, name, provider?, balance, interestRate?, isISA?, ownerId?, isTrust?, trustBeneficiaryName? }
PATCH  /api/wealth/accounts/:id              → update metadata (name, provider, interestRate, isISA, etc.) — not balance
DELETE /api/wealth/accounts/:id              → delete; 409 if linked savings allocations exist
POST   /api/wealth/accounts/:id/valuation    → updateValuation({ balance, valuationDate })
POST   /api/wealth/accounts/:id/confirm      → update lastReviewedAt only
GET    /api/wealth/accounts/:id/history      → WealthAccountHistory[] last 24 months sorted by valuationDate asc
GET    /api/wealth/isa-allowance             → ISA allowance per person
POST   /api/wealth/accounts/confirm-batch    → { ids: string[] } → sets lastReviewedAt = now() for each
```

### Components

- `WealthLeftPanel.tsx` — total net worth + ytd change; by-liquidity breakdown (display only); asset class nav rows; "Held on behalf of" trust section
- `AccountListPanel.tsx` — list accounts for selected class; balance, rate, staleness per row; projection line; nudge card (savings only); ISA allowance bar (savings only, see wealth-isa-tracking spec)
- `AccountDetailPanel.tsx` — breadcrumb `← Asset Class / Account Name`; balance, rate, contribution, last updated; 24-month HistoryChart; projected balance; `[ Edit ]` + `[ Update valuation ]` buttons

### Notes

**WealthSummary shape:**

```typescript
interface WealthSummary {
  netWorth: number; // sum of non-trust account balances
  ytdChange: number; // netWorth now minus netWorth on Jan 1 (from WealthAccountHistory)
  byLiquidity: {
    cashAndSavings: number;
    investmentsAndPensions: number;
    propertyAndVehicles: number;
  };
  byClass: Record<AssetClass, number>;
  trust: {
    total: number;
    beneficiaries: { name: string; total: number }[];
  };
}
```

**Projection formula (savings only):**

```typescript
// monthlyRate = interestRate / 12 / 100
// months = monthsBetween(now, toDate)
// monthlyContrib = sum of linked SavingsAllocation.monthlyAmount
// projection = balance * (1 + monthlyRate)^months
//            + monthlyContrib * ((1 + monthlyRate)^months - 1) / monthlyRate
```

**Nudge rules (savings class only):**

| Situation                                            | Nudge?                                      |
| ---------------------------------------------------- | ------------------------------------------- |
| Higher-rate account has unused contribution capacity | Yes — show arithmetic                       |
| All contributions already at optimal rate            | No                                          |
| At ISA limit                                         | No                                          |
| Approaching ISA limit (within ~£2,000)               | Yes — show remaining allowance and deadline |
| Under ISA limit with capacity                        | Yes — show remaining allowance              |

One nudge maximum per panel — silence if all already optimised.

**ISA new tax year banner:** When `today >= April 6` and account's `updatedAt` predates the most recent April 6, show amber banner: "It's a new tax year — your ISA allowance has reset. Update your contributions for each ISA account."

**ytdChange calculation:** For each account, find the most recent `WealthAccountHistory` entry with `valuationDate <= Jan 1 of current year`. If no entry exists (new account), treat Jan 1 contribution as 0. ytdChange = 0 for brand-new households with no history.


## Remaining Work

Core account CRUD, history tracking, projections, balance summaries, and backend routes are fully implemented. Outstanding:

- [ ] AccountDetailPanel: display waterfall contribution amount in UI (calculated internally for projections but not shown to user)
- [ ] NudgeCard: detect higher-rate accounts with unused contribution capacity and surface nudge in AccountDetailPanel
- [ ] ISA new tax year banner: show amber banner when `today >= April 6` and `account.updatedAt` predates the most recent April 6
