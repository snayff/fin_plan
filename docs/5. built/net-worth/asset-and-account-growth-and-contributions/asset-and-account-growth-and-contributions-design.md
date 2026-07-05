---
feature: asset-and-account-growth-and-contributions
status: approved
creation_date: 2026-04-19
status: implemented
implemented_date: 2026-07-05
---

# Asset and Account Growth and Contributions — Design

> **Purpose:** Captures the approved product direction — the problem, the chosen approach, and the key decisions made during requirement refinement. This is the input to `/write-spec`.

## Problem

The Forecast's Growth chart projects Net Worth forward using two per-item inputs — **monthly contributions** (for Savings, S&S, Pension accounts) and **growth/depreciation rates** (for all accounts and assets). The schema already carries these fields and `forecast.service.ts` already consumes them, but users have no UI to set them, so projections are systematically wrong: no contributions are modelled, and assets with a null rate project flat.

A naive fix would add a "monthly contribution" field to `AccountForm`. That would violate the waterfall identity anchor — money would appear in an account without flowing through the waterfall. The right fix makes contributions a first-class product of the waterfall: money allocated to a Discretionary Savings item flows into a linked Account, which is what definitions.md's "Savings ↔ Waterfall Link Icon" and "Projection" tooltips already describe.

## Approved Approach

**Contributions are derived from the waterfall, not entered on the account.**

1. A new FK `DiscretionaryItem.linkedAccountId` optionally points to an Account. The existing `Account.monthlyContribution` free-typed field is dropped.
2. Linking is only available on Discretionary items in the **Savings** subcategory, and only to Accounts of type **Savings**, **StocksAndShares**, or **Pension**. (Current is a bank balance, not a contribution target.)
3. The Discretionary **Savings** subcategory becomes a locked default (`isLocked: true`), matching the Gifts pattern — it is seeded for new households and backfilled for existing ones, and cannot be renamed or deleted.
4. The Account's monthly contribution is computed at read time as the sum of current-amount linked Discretionary items. The Assets page shows this as a read-only stat with a back-link icon to the waterfall.
5. **Growth rate UX is unchanged** — Account overrides remain 0–100, Asset overrides remain −100..100. Negative rates are already valid for assets (vehicle depreciation). Placement (inside the existing edit form) is unchanged.
6. **Fallback defaults for assets** — `HouseholdSettings` gains `propertyRatePct` (seed 3.5), `vehicleRatePct` (seed −15), `otherAssetRatePct` (seed 0). A null `Asset.growthRatePct` falls back to the type's household default, mirroring the existing account-class behaviour.
7. **Forecast surfacing** — the Growth chart summary gains a `Monthly contributions: £X` stat row alongside Net worth / Real terms, making the input that drives the compounded line visible.

## Key Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Where contributions are set | On the waterfall item (Discretionary → Savings), with a `linkedAccountId` FK to an Account. Not on the Account | Upholds waterfall identity (anchor #2) — money cannot appear in an account without first being allocated in the waterfall. Aligns with existing `definitions.md` copy ("Savings ↔ Waterfall Link Icon", "Projection") |
| Source of truth for `Account.monthlyContribution` | Derived — drop the stored field | One source of truth. No risk of the Account value diverging from the sum of linked items. Safe to remove: no existing production usage of this field |
| Savings subcategory locking | `isLocked: true` on the Discretionary "Savings" subcategory; seeded + backfilled like Gifts | Required because the link model depends on this subcategory existing. Users may still freely add/edit items within it |
| Link scope | Discretionary items in the "Savings" subcategory → Accounts of type Savings / StocksAndShares / Pension | Semantically clean. Current accounts are a bank balance, not a contribution target. Asset-side linking deferred (see Out of Scope) |
| Depreciation UX | Negative growth rate on Assets (existing behaviour: `min(-100).max(100)`, placeholder `"e.g. 3.5 or -15"`) | Already settled in code. Asymmetric vs Accounts (0..100) is intentional — savings vehicles don't depreciate in this model |
| Fallback for null `Asset.growthRatePct` | Extend `HouseholdSettings` with `propertyRatePct` (3.5), `vehicleRatePct` (−15), `otherAssetRatePct` (0); null asset rate → type default | Consistent with existing account-class defaults. One mental model for the user. Seeded values are factual UK long-run averages, not advisory |
| Forecast annotation | `Monthly contributions: £X` stat row on the Growth chart summary | Makes the input that shapes the curve visible. Calm, non-advisory, single figure — complies with anchors #9 (non-advisory) and #11 (calm by default) |
| Growth rate input UX | Unchanged — fields already exist in `AccountForm` and `AssetForm` with correct scoping and defaults | Nothing to redesign; the gap was only contributions |

## Out of Scope

- **Asset-side contributions (e.g. mortgage overpayments to Property).** Linking a Discretionary Savings item to an Asset is deferred. Overpayment semantics (principal vs interest, amortisation) require the Liabilities feature to model properly. V1 link target is Accounts only.
- **Current accounts as contribution targets.** Link scope excludes the Current account type.
- **Manual override on `Account.monthlyContribution`.** Option B from the design conversation (keep the field with override) was rejected — fully derived is the only source of truth.
- **Reworking the existing growth-rate input UX.** Fields exist and behave correctly; this feature adds only the new asset-class defaults in `HouseholdSettings` and their fallback wiring.
- **Settings-page redesign.** The existing Settings → Growth rates section receives three additional fields; no structural change to the page.
- **Multiple-link UX.** A Discretionary item links to at most one Account (nullable FK). A single Account can, however, receive multiple Discretionary items — the contribution is the sum.

## Visual Reference

- `waterfall-linkage.html` — shows the Discretionary → Account flow and the read-only contribution display on the Assets side
- `account-form-addition.html` — earlier exploration of extending `AccountForm` with a contribution field; kept for context on why the waterfall-link approach was chosen instead
