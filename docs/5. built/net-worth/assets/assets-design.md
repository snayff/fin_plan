---
feature: assets
status: approved
creation_date: 2026-03-30
status: implemented
implemented_date: 2026-07-05
---

# Assets — Design

> **Purpose:** Captures the approved product direction — the problem, the chosen approach, and the key decisions made during requirement refinement. This is the input to `/write-spec`. It is intentionally product-level: no Prisma syntax, no route shapes, no component trees.

## Problem

Users have no way to track what they own in the new app. Legacy asset code exists but needs to be replaced with a clean design that fits the current architecture. The assets feature is a hard dependency for the Financial Forecast page — net worth and retirement projections cannot be computed without account balances, growth rates, and member assignments.

## Approved Approach

A dedicated **Assets** page in the main nav following the established two-panel layout pattern. The left panel lists subcategories (types); the right panel shows the individual items within the selected type.

The page is split into two structural groups:

- **Assets** — things you own with no ongoing contributions: Property, Vehicle, Other
- **Accounts** — financial accounts with balances that grow over time: Savings, Pension, Stocks & Shares, Other

Both groups share the same core model (name, type, balance history, member assignment) but are structurally separated to allow future divergence in behaviour.

Balance tracking is point-in-time: the user records a value + date whenever they check. The most recent entry is the current balance. Staleness is flagged if no balance has been recorded recently.

## Key Decisions

| Decision               | Choice                                                                                         | Rationale                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Scope                  | Track what you own only — no liabilities                                                       | Equity-only model; debt tracking is out of scope                                         |
| Equity model           | User records equity (or value for debt-free items) directly                                    | No gross value + mortgage arithmetic — simpler and honest                                |
| Balance model          | Point-in-time entries (value + date) — history retained                                        | Enables growth tracking over time and feeds forecast projections                         |
| Balance fields         | Value, date (defaults to today), optional note                                                 | Minimal friction; note field for context without mandating it                            |
| Two groups             | Assets (Property, Vehicle, Other) and Accounts (Savings, Pension, Stocks & Shares, Other)      | Structural distinction reflects different future behaviour; shared model today           |
| Account subcategories  | Savings, Pension, Stocks & Shares, Other                                                       | Covers all account types needed for forecast projections                                 |
| Asset subcategories    | Property, Vehicle, Other                                                                       | Covers illiquid asset types; no growth rate projection needed                            |
| Member assignment      | All accounts and assets assignable to a member or Household                                    | Supports individual accounts (e.g. personal pension) and joint assets (e.g. family home) |
| Growth rate override   | Per-account nullable field, falls back to HouseholdSettings class default                      | Allows precision where needed without mandating it for every account                     |
| Growth rates on assets | Not applicable — Property and Vehicle do not project                                           | Static balance only; no growth rate field on asset types                                 |
| Staleness              | Same staleness system as the rest of the app                                                   | Consistent UX; amber dot signals balance hasn't been updated recently                    |
| Page layout            | Two-panel: subcategory list left, items right — matches Income/Committed/Discretionary pattern | Consistency; reuses existing TwoPanelLayout, SubcategoryList, ItemArea components        |
| Legacy code            | Remove all legacy asset code — do not carry forward                                            | Clean slate; legacy structure does not fit new architecture                              |

## Out of Scope

- Liability tracking (mortgages, loans, credit cards)
- Gross value + debt = equity calculation
- Growth rate fields on Property and Vehicle asset types
- Balance projections or charts on the Assets page itself (those live on the Forecast page)
- Monthly contribution tracking (not needed for balance-history model)
- Mobile layout (desktop-first per design anchors)

## Dependencies

All schema additions below are delivered as part of this feature's migration — no separate forecast prerequisite step needed.

- **HouseholdSettings — growth rate fields** (needed at creation time for account defaults):
  - `savingsRatePct` (Float)
  - `investmentRatePct` (Float)
  - `pensionRatePct` (Float)
  - `inflationRatePct` (Float, default 2.5)

- **HouseholdMember — retirement fields** (used by the Forecast page retirement projections):
  - `dateOfBirth` (Date, nullable) — used by the retirement year calculator helper
  - `retirementYear` (Int, nullable) — the stored target retirement year

## Visual Reference

- `assets-layout-v4.html` — approved two-panel layout: subcategory list left (Assets / Accounts groups), items in selected type right, accordion item detail with balance history
