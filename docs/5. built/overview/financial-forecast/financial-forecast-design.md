---
feature: financial-forecast
status: approved
creation_date: 2026-03-30
status: implemented
implemented_date: 2026-07-05
---

# Financial Forecast — Design

> **Purpose:** Captures the approved product direction — the problem, the chosen approach, and the key decisions made during requirement refinement. This is the input to `/write-spec`. It is intentionally product-level: no Prisma syntax, no route shapes, no component trees.

## Problem

Users have no forward-looking view of their finances. Overview shows the current waterfall plan as a snapshot, but cannot answer: "Where will I be in 10 years?", "Will I have enough at retirement?", or "How much surplus will I have accumulated if I don't touch it?" A dedicated Forecast page is needed to answer these questions.

## Approved Approach

A dedicated **Forecast** page in the main nav (after Surplus) with three independent projection lenses displayed simultaneously:

1. **Net worth** — projected over the selected time horizon, shown as a line chart with nominal and real (inflation-adjusted) lines
2. **Retirement** — projected asset breakdown (pension, savings, stocks & shares) at each household member's retirement year, shown as a stacked area chart with member tabs
3. **Surplus accumulation** — cumulative unspent surplus over the selected time horizon, purely additive with no interest applied

The page is controlled by a global **time horizon selector** (1y / 3y / 10y / 20y / 30y) that drives all three charts simultaneously.

## Key Decisions

| Decision               | Choice                                                                                          | Rationale                                                                                                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Three lenses           | Net worth, Retirement, Surplus — shown simultaneously                                           | Each answers a distinct question; showing together gives full forward picture without navigation                                                                                   |
| Surplus isolation      | Surplus accumulation is never included in net worth or retirement calculations                  | Surplus is unallocated cash by definition — including it would misrepresent the plan                                                                                               |
| Net worth composition  | Savings + investments + property + other assets. Pensions excluded.                             | Pensions are illiquid and retirement-specific; mixing them with net worth muddles the picture                                                                                      |
| Retirement composition | Pension pots + savings + stocks & shares. Property excluded.                                    | Retirement breakdown is about investable/accessible wealth, not illiquid assets                                                                                                    |
| Retirement scope       | Retirement only (not generic life event milestones)                                             | Scope control — retirement is the primary use case; generic milestones add complexity for low gain                                                                                 |
| Retirement target      | Stored as `retirementYear` (Int) per member                                                     | Year is the meaningful unit for projections; DOB + target age is a helper to derive it                                                                                             |
| Retirement year UX     | Target year input with DOB + retirement age calculator helper                                   | User sets the year directly, but the helper reduces friction for those who think in age                                                                                            |
| Retirement per member  | Each household member has their own `dateOfBirth` and `retirementYear`                          | Households have multiple earners with different retirement timelines                                                                                                               |
| Pension assignment     | Pension accounts assigned to a specific household member                                        | Enables per-member retirement breakdown; savings/investments are household-level aggregates                                                                                        |
| Growth rates           | Per-class defaults on HouseholdSettings, overridable per account                                | Lower friction than per-account-only; more control than global-only                                                                                                                |
| Inflation              | Single `inflationRatePct` on HouseholdSettings (default 2.5%)                                   | Household-level assumption; no need for per-account inflation                                                                                                                      |
| Real vs nominal        | Both lines shown simultaneously on net worth chart — no toggle                                  | Removes interaction cost; both lines are always informative                                                                                                                        |
| Surplus growth         | Purely additive, no interest                                                                    | Surplus is unallocated — applying a rate would imply a decision the user hasn't made                                                                                               |
| Retirement markers     | Shown as vertical dashed lines on net worth chart using `page-accent` (#8b5cf6)                 | Per-member markers show where each person retires on the trajectory. Amber is reserved for staleness/attention signals only — using `page-accent` keeps the colour semantics clean |
| Chart layout           | Three persistent panels: net worth full-width top, surplus bottom-left, retirement bottom-right | Net worth is the primary lens and earns the most space; bottom panels are co-equal                                                                                                 |
| Chart style            | Gradient area fills, charts run edge-to-edge within card (no horizontal padding on SVG)         | Gradient fills give depth without clutter; full-width charts feel immersive                                                                                                        |
| Data labels            | Start/end values displayed below each chart in a stat row, not inline on the chart              | Cleaner chart area; values are still immediately accessible                                                                                                                        |
| Retirement panel       | Stacked area chart (pension / savings / S&S) + legend with per-component values + total         | Shows composition over time, not just a point-in-time number                                                                                                                       |

## Out of Scope

- Generic life event milestones (only retirement is in scope)
- Scenario modelling ("what if my income drops £500/month")
- Property in the retirement breakdown
- Pensions in net worth
- Interest/returns on surplus accumulation
- Per-account inflation rates
- Mobile layout (desktop-first per design anchors)

## Dependencies

This feature cannot be built until the following are in place, in order:

### 1. Assets feature (separate design required)

- Wealth account types: savings, stocks & shares, pension, property, other
- Per-account: current balance, monthly contribution amount
- Pension accounts: assigned to a household member (`memberId`)
- Per-account growth rate override (nullable, falls back to HouseholdSettings class default)

### 2. HouseholdMember — retirement fields

Delivered as part of the **Assets** feature migration:

- `dateOfBirth` (Date, nullable) — used by the retirement year calculator helper
- `retirementYear` (Int, nullable) — the stored target retirement year

### 3. HouseholdSettings — rate fields

Delivered as part of the **Assets** feature migration:

- `inflationRatePct` (Float, default 2.5) — applied to produce real lines on all charts
- `savingsRatePct` (Float) — default growth rate for savings accounts
- `investmentRatePct` (Float) — default growth rate for stocks & shares accounts
- `pensionRatePct` (Float) — default growth rate for pension accounts

## Visual Reference

- `forecast-layout-b4.html` — approved layout: net worth full-width, surplus bottom-left, retirement stacked area bottom-right, gradient fills, edge-to-edge charts
