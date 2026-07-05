---
feature: asset-and-account-growth-and-contributions
design_doc: docs/4. planning/asset-and-account-growth-and-contributions/asset-and-account-growth-and-contributions-design.md
creation_date: 2026-04-19
status: implemented
implemented_date: 2026-07-05
---

# Asset and Account Growth and Contributions

> **Purpose:** Captures _what_ the feature does and _why_ — user stories, acceptance criteria, and interface-level implementation constraints. This is the input to `/write-plan`. It is intentionally not a technical plan: no Prisma syntax, no route code, no component file paths.

## Intention

The Forecast's Growth chart compounds account and asset balances using per-item monthly contributions and growth rates, but users have no UI to set these inputs. Projections are therefore systematically understated. Beyond filling that gap, this feature enforces waterfall identity (design anchor #2): contributions to savings vehicles must flow through the waterfall, not appear on accounts from nowhere.

## Description

Contributions become a first-class product of the Discretionary → Savings tier. A new optional link on each Discretionary item points to a Savings, Stocks & Shares, or Pension account. The account's monthly contribution is derived from the sum of linked items' amounts (normalised to monthly). The Assets page shows each account's received contribution read-only, with a popover listing the linked waterfall items. Three new household-level default growth rates (Property / Vehicle / Other asset) give null-growth assets a sensible fallback, mirroring how account classes already work. The Growth chart summary shows the Monthly contributions feeding the active view.

## User Stories

- As a household planner, I want to allocate a portion of my Discretionary Savings to a specific account so that my Growth chart projection reflects money actually flowing into that account.
- As a household planner, I want my Property to appreciate in projections without having to manually set a rate so that my long-term Net Worth forecast is realistic out of the box.
- As a household planner, I want to record a Vehicle's depreciation rate so that its projected value falls over time.
- As a household planner, I want to see at a glance which accounts are receiving contributions from my plan so that I can verify my savings intent is actually being applied.
- As a household planner, I want to see the total monthly contribution feeding my Growth chart so that I can sanity-check the projected curve against my waterfall.
- As a household member, I want the Savings subcategory to always exist so that the app's link model can never be broken by renaming or removing it.

## Acceptance Criteria

- [ ] A Discretionary item can be linked to exactly one Account via a `linkedAccountId` field (nullable FK).
- [ ] Only Discretionary items in the "Savings" subcategory can carry a non-null `linkedAccountId`; any attempt to set one on an item in another subcategory is rejected at validation time.
- [ ] Only Accounts of type `Savings`, `StocksAndShares`, or `Pension` are selectable as link targets; `Current` and `Other` accounts are excluded.
- [ ] The "Savings" subcategory in the Discretionary tier is seeded with `isLocked: true` for new households and is backfilled to `isLocked: true` for existing households.
- [ ] A locked subcategory cannot be renamed or deleted via the Subcategory management UI or API.
- [ ] The Account's monthly contribution is computed at read time as the sum of linked Discretionary items' amounts normalised to monthly: `monthly` as-is, `annual` ÷ 12, `quarterly` ÷ 3, `weekly` × (52/12), `one_off` excluded.
- [ ] The `Account.monthlyContribution` field is removed from the schema; all reads use the derived value.
- [ ] Planner-owned Discretionary items (`isPlannerOwned: true`, e.g. Gifts-managed items) cannot be linked to an account; the dropdown hides or disables the link field for them.
- [ ] The Discretionary item edit form exposes a "Link to account (optional)" dropdown listing the household's Savings / S&S / Pension accounts by name; the field appears only for items in the Savings subcategory.
- [ ] When a Discretionary item is moved out of the Savings subcategory, its `linkedAccountId` is automatically nulled.
- [ ] When a linked Account is deleted, the `linkedAccountId` on every affected Discretionary item is nulled (the items themselves are preserved).
- [ ] On the Assets page, an account with at least one linked contribution shows a subtitle row reading `<link icon> £<total> /mo from waterfall`; accounts with no linked contributions do not show this row.
- [ ] Clicking the subtitle opens a popover listing each linked item with its name, normalised monthly amount, and assigned member (or "Household"); the popover contains an "Edit in waterfall →" link that navigates to the Overview page with that item selected.
- [ ] `HouseholdSettings` gains three fields — `propertyRatePct` (default 3.5), `vehicleRatePct` (default −15), `otherAssetRatePct` (default 0) — available in the Settings → Growth rates section alongside the existing account-class defaults.
- [ ] A null `Asset.growthRatePct` falls back to the asset type's household default (Property / Vehicle / Other).
- [ ] Asset growth rates remain valid in the range −100 .. 100; Account growth rates remain valid in 0 .. 100. Existing form validation is preserved.
- [ ] The Growth chart summary displays a `Monthly contributions: £<value>` stat row alongside Net worth / Real terms; the value is scoped to the active view — Net Worth view sums contributions to Savings + S&S accounts, Retirement view sums contributions to Pension + Savings + S&S accounts.
- [ ] When no contributions are linked anywhere, the stat row displays `£0` (it is shown, not hidden).
- [ ] The Forecast query reflects newly-linked items, rate changes, and settings changes without a page refresh (TanStack Query invalidation on every mutation that affects contributions or growth rates).
- [ ] All new or changed mutations are audited via the existing `audited()` helper.

## Open Questions

- [x] ~~Should non-monthly Discretionary items be allowed to link?~~ **Yes**, amortised to monthly. `one_off` excluded from the sum.
- [x] ~~Where is the link set?~~ **Inside the Discretionary item edit form**, as a dropdown scoped to Savings/S&S/Pension accounts.
- [x] ~~How is the Growth chart stat scoped?~~ **Matched to the active chart view** (Net Worth vs Retirement).
- [x] ~~How is the received contribution surfaced on the Assets page?~~ **Subtitle + clickable popover**, with an "Edit in waterfall →" navigation link.
- [x] ~~Asset-side contributions (mortgage overpayments)?~~ **Deferred** to the future Liabilities feature.

---

## Implementation

> Interface-level constraints for the implementor. Describes _what_ is needed — entities, operations, UI units — without specifying _how_ to build them. `/write-plan` makes the technical decisions (Prisma syntax, route shapes, file paths, component code).

### Schema

- **DiscretionaryItem**: gains an optional `linkedAccountId` referring to an Account. The reference is nullable; `SET NULL` on Account delete. Constraint: the referenced Account must be of type `Savings`, `StocksAndShares`, or `Pension`; the item must belong to the household's "Savings" subcategory; and the item must not be planner-owned. Violations reject the write.
- **Account**: the stored `monthlyContribution` field is removed. Contribution is derived at read time.
- **HouseholdSettings**: gains three new rate fields — `propertyRatePct` (default 3.5), `vehicleRatePct` (default −15), `otherAssetRatePct` (default 0). Stored as floats; UI-level validation mirrors existing rate settings.
- **Subcategory**: the seeded "Savings" row in the Discretionary tier has `isLocked: true`. A backfill sets `isLocked: true` on this row for existing households. No new column is added.
- All entities remain household-scoped. A Discretionary item may only link to an Account in the same household.

### API

- **List accounts (including received contribution)** — existing endpoint augmented: each returned account includes a derived `monthlyContribution` (sum of linked items, normalised to monthly) and a `linkedItems` array with `{ id, name, memberId, normalisedMonthlyAmount, spendType }`. JWT-protected, household-scoped.
- **Create / Update Discretionary item** — accept an optional `linkedAccountId`. Reject the link if: item is not in the Savings subcategory; target account is not Savings/S&S/Pension; target account is in a different household; item is planner-owned. Changing subcategory out of "Savings" during update must null the field in the same write. JWT-protected, household-scoped, audited.
- **List discretionary items** — each item's payload includes `linkedAccountId` and a lightweight `linkedAccount: { id, name, type } | null` for UI rendering without a second fetch.
- **Move item subcategory** — when a move takes an item out of "Savings", the API must null `linkedAccountId` atomically.
- **Delete Account** — nulls `linkedAccountId` on every affected Discretionary item as part of the same transaction; the items themselves are preserved. JWT-protected, household-scoped, audited.
- **Subcategory rename / delete** — any existing subcategory mutation endpoints must reject attempts to rename or delete a locked subcategory, returning the same error shape already used for the Gifts subcategory.
- **Update HouseholdSettings** — existing settings endpoint accepts the three new fields; validated as floats in the appropriate range (Property/Other 0..100, Vehicle −100..100 — `/write-plan` picks exact validator).
- **Get forecast** — existing endpoint continues to return Net Worth / Retirement / Surplus projections. Response additionally includes `monthlyContributionsByScope: { netWorth: number, retirement: number }` to power the Growth chart stat row.
- **Rate limits** — no new endpoints; existing per-route limits apply.

### Components

- **DiscretionaryItemForm (updated)** — gains an additional field "Link to account (optional)" rendered as a dropdown. Field is visible only when the item's subcategory is "Savings" and the item is not planner-owned. Dropdown lists the household's Savings / S&S / Pension accounts; a "None" option clears the link. Reuses the existing form-field styles (label, input, help-text pattern from `AccountForm`).
- **LinkedAccountPicker** — the dropdown control itself; responsible for fetching the eligible accounts (Savings / S&S / Pension in the current household), rendering them with account type as secondary text, and surfacing any backend validation errors.
- **AssetAccountRow (updated)** — for accounts with non-zero derived contribution, renders a subtitle line using the existing "Savings ↔ Waterfall Link Icon" followed by `£<total> /mo from waterfall`. The subtitle is a button that opens `LinkedContributionsPopover`. When derived contribution is zero, the subtitle is not rendered. The icon reuses the same component the definitions.md tooltip references; the tooltip text comes from `definitions.md` verbatim. Accessibility: the subtitle button exposes its purpose via `aria-label` ("View waterfall contributions linked to <account name>").
- **LinkedContributionsPopover** — popover listing each linked Discretionary item for the account: item name, normalised monthly amount, member (firstName or "Household"), and originating subcategory. Footer contains an "Edit in waterfall →" link that navigates to the Overview page with the selected item preselected. Dismissible via backdrop click, Escape key, and the in-popover close control.
- **GrowthChartSummary (updated)** — adds a `Monthly contributions: £<value>` stat row alongside Net worth / Real terms. The displayed figure is taken from `monthlyContributionsByScope[activeView]`. When zero, the row shows `£0`.
- **Settings → Growth rates (updated)** — gains three new inputs for Property / Vehicle / Other asset defaults. Follows the existing rate-input pattern (label, percentage suffix, help text). Vehicle input must accept negative values (visual and validation parity with `AssetForm`).
- **SubcategoryManager (updated)** — existing subcategory management must treat the "Savings" subcategory as locked (rename and delete disabled), matching current Gifts behaviour.

### Notes

- **Normalisation formulae** — the derived monthly contribution uses these divisors: `monthly → ×1`, `annual → ÷12`, `quarterly → ÷3`, `weekly → ×(52/12)` ≈ 4.333, `one_off → excluded`. Definition applies identically in forecast projections and Assets page display so the two figures always match.
- **Navigation from the Assets popover** — "Edit in waterfall →" navigates to the Overview page and scrolls/selects the target Discretionary item using the same selection mechanism the existing "Increase savings ▸" link uses in the Surplus row.
- **Backfill for `Account.monthlyContribution` removal** — the column has no existing UI surface and all values are expected to be default zero; the migration drops the column without data preservation. The `/write-plan` step must verify via a data audit before committing.
- **Subcategory lock backfill** — a one-time migration sets `isLocked = true` on every existing Discretionary "Savings" subcategory row. Idempotent.
- **Planner-owned items** — Gifts creates `DiscretionaryItem` rows with `isPlannerOwned: true`. The link field must be absent for these, and the API must reject link mutations on them.
- **Retirement projection scope** — the existing `forecast.service.ts` retirement logic per member includes pension + household savings + household S&S. The Growth chart Retirement stat must sum linked contributions across exactly those account classes to stay consistent with the curve.
- **Cache invalidation** — TanStack Query keys touched: accounts list, discretionary items list, forecast, household settings. A mutation that changes any linked item, account, or new settings field must invalidate the forecast query so the Growth chart recomputes immediately.
- **Security posture** — every new or changed mutation must use `authMiddleware`, scope by `req.householdId!`, and be wrapped in `audited()` per project convention. Cross-household link attempts (item in household A referencing account in household B) must be rejected as `NotFoundError` to avoid leaking existence.
