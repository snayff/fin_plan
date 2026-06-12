# finplan — App Review: Bugs, Inconsistencies & Calculation Inaccuracies

**Date:** 2026-06-12
**Branch:** `claude/app-review-bugs-tpfmtr`
**Method:** Static review (calculations, backend correctness, cross-app consistency) plus a running full stack (Postgres + backend + frontend) used to confirm the headline findings end-to-end in the browser and via the API. Backend test suite passes 69/69 against a freshly migrated DB.

Severities: **Critical** (wrong money shown to users / cross-tenant data exposure), **High** (materially wrong numbers in common paths), **Medium** (wrong numbers in edge cases or self-inconsistent UI), **Low** (minor/rounding/observational).

Items marked **✅ runtime-confirmed** were reproduced against the running app, not just read.

---

## Critical

### C1. Synced gift budget is deducted ~12× — annual budget treated as a monthly amount ✅ runtime-confirmed

**Where:** `apps/backend/src/services/gifts.service.ts:56` (`spendType: "monthly"`) + `:74` (`amount: annualBudget`); also `:510`, `:1037`. Consumed at `apps/backend/src/services/waterfall.service.ts:344-345` via `toMonthlyAmount(amount, "monthly")` (identity).

When the gift planner is in **synced** mode, finplan creates a planner-owned "Gifts" `DiscretionaryItem` with `spendType: "monthly"` but stores the **annual** gift budget in its `ItemAmountPeriod.amount`. The waterfall then treats that annual figure as a monthly spend.

**Runtime proof:** With the seeded household I set a £1,200/year gift budget and enabled synced mode. Discretionary total jumped **£930 → £2,130** and surplus dropped **£4,035 → £2,835** — a £1,200 **per month** hit. Correct behaviour is +£100/month.

The design doc agrees this is wrong: `docs/5. built/discretionary/gifts/gifts-design.md:26` says the budget should appear "via a **yearly** `ItemAmountPeriod`". The cashflow projection is poisoned the same way (`cashflow.service.ts:356-369` amortises £1,200/month ≈ £39.45/day instead of ~£3.29/day), so dip detection and projected balances become far too pessimistic.

**Note:** the existing tests (`gifts.service.test.ts:425,447,521`) assert the _annual_ amount is written into the monthly item, so they currently encode the bug and will need updating alongside the fix.

**Fix:** create the synced item with `spendType: "yearly"` (so `toMonthlyAmount` divides by 12), and update the three period-amount writes + tests accordingly.

---

### C2. Cross-household member roster / PII leak (IDOR) ✅ runtime-confirmed

**Where:** `apps/backend/src/routes/households.ts:222-230` → `apps/backend/src/services/member.service.ts:71-79`.

`GET /api/households/:id/member-profiles` reads the household id straight from the URL and passes it to `listMembers(id)` with **no membership/ownership check** and no comparison against `req.householdId`. Every sibling route (`getHouseholdDetails`, the role/profile PATCH routes, create/update/delete) performs `assertMember` / `assertCallerIsOwner` — only this GET is unguarded.

**Runtime proof:** I registered a second user in a _different_ household and called `GET /api/households/<victim-household-id>/member-profiles`. It returned HTTP 200 with the victim household's full roster — member names, roles, dates of birth, retirement years, and each linked user's **name + email** (`owner@finplan.test`). Household ids are UUIDs but they leak elsewhere (the unauthenticated `GET /invite/:token` returns `householdId`, and switch/detail responses echo ids), so this is a real cross-tenant PII disclosure.

**Fix:** derive the household from `req.householdId!` (preferred per project convention) or call `assertMember(id, req.user!.userId)` before listing.

**Handling:** repo is public — do **not** describe this in a public GitHub issue. Fix on a branch; if any real user data exists in a deployed environment, treat as a private Security Advisory.

> Related lower-risk drift (not exploitable): the member-profile **mutation** routes (`households.ts:233-275`) also take `:id` from the URL rather than `req.householdId`. They're safe today only because the services re-assert ownership, but normalising all of these to `req.householdId!` is what would have prevented C2.

---

### C3. Editing an item's amount (or income frequency) is silently dropped — the edit form and Review Wizard are no-ops for amounts ✅ runtime-confirmed

**Where:** `apps/frontend/src/components/tier/ItemForm.tsx:186-195` → `ItemAreaRow.tsx:114-116` → `useTierUpdateItem` (`apps/frontend/src/hooks/useWaterfall.ts:244-251`) → `PATCH /api/waterfall/{income|committed|discretionary}/:id`, validated by `updateCommittedItemSchema` / `updateIncomeSourceSchema` / `updateDiscretionaryItemSchema` (`packages/shared/src/schemas/waterfall.schemas.ts:76-84, 105-113, 134-143`), applied at `apps/backend/src/services/waterfall.service.ts:578-584`.

The edit form sends `{ name, amount, spendType, dueDate, ... }`, but **none of the update schemas accept `amount`** (amounts live in the separate `ItemAmountPeriod` table, edited via `createPeriod`), and income update expects `frequency`, not `spendType`. Zod strips the unknown keys, so the backend update only bumps `lastReviewedAt`. The mutation then invalidates tier-items, so the edited value visibly snaps back.

**Runtime proof:** `PATCH /api/waterfall/committed/<rent-id>` with `{"amount": 9999}` returned **HTTP 200** but the Rent amount stayed **£1,200** on re-fetch. The response body has no `amount` change.

This compiles only because the frontend **service** is typed against legacy inputs (`apps/frontend/src/services/waterfall.service.ts:42` uses `UpdateCommittedBillInput`, which still includes `amount`) while the **route** enforces the newer amount-less schema.

**Worse in the Review Wizard** (`apps/frontend/src/components/overview/ReviewWizard.tsx:314-328, 550-551`): it sends `{amount}` (stripped), records the change in the review session, and then shows the user a "from → to" summary claiming the amount changed when it did not.

Also dropped on the same path: `dueDate` on discretionary edits, and income **frequency** changes from the edit form.

**Fix:** route amount edits through the period system (`createPeriod` / a dedicated amount-update endpoint) from the edit form and wizard, or extend the update schemas + services to upsert the current period's amount. Re-type the frontend service against the actual route schemas so the drift can't recur. Update the wizard summary to reflect what actually persisted.

---

## High (materially wrong numbers in common paths)

### H1. Cashflow monthly recurrence skips February for day-29/30/31 due dates ✅ independently reproduced

**Where:** `apps/backend/src/services/cashflow.service.ts:156-172` (`cursor.setUTCMonth(+1)`).

`new Date(Date.UTC(y, month, 31))` then repeatedly `setUTCMonth(+1)` overflows: Jan 31 → "Feb 31" normalises to **Mar 3**, and the cursor then stays on the 3rd forever.

**Proof (reproduced the exact loop):** a payment due on the 31st over a Jan→Dec 2026 window emits **11 events, not 12** — `Jan 31, Mar 03, Apr 03 … Dec 03` — **no February payment at all**. A £2,000 mortgage due on the 31st makes the year's cashflow £2,000 too optimistic and shifts every projected dip date. Affects `getProjection`, the anchor replay, `getMonthDetail`, and `getShortfallItems`. No test covers due-day > 28.

**Fix:** add a "clamp to end-of-month" month-stepping helper (set day from the original due day each iteration, clamped to that month's length) and add tests for due days 29–31.

### H2. Frontend "monthly equivalent" totals use a naive ÷12 for every non-monthly cadence

**Where:** `apps/frontend/src/components/tier/TierPage.tsx:66`, `apps/frontend/src/components/tier/ItemArea.tsx:122-123` & `:135-138`, `apps/frontend/src/components/waterfall/SubcategoryGroup.tsx:34`, and the Full Waterfall table `apps/frontend/src/components/waterfall/TierRow.tsx:159-161`.

Pattern: `spendType === "monthly" ? amount : Math.round(amount / 12)`. That is only correct for yearly items. Worked examples of what the UI shows vs. the correct monthly value:

- weekly £50 → shows **£4/mo**, correct is £216.67 (×52/12)
- quarterly £300 → shows **£25/mo**, correct is £100
- one-off £500 → shows **£42/mo**, correct is £0 (matches backend)
- In the Full Waterfall table, income rows show the **raw** amount (an annual £12,000 income displays as "£12,000/mo"; a monthly £1,200 bill displays as "£100/mo").

These page totals contradict the backend's `bySubcategory.monthlyTotal` (which uses the shared `toMonthlyAmount`) shown elsewhere on the same screens. The correct helper already exists at `apps/frontend/src/components/tier/formatAmount.ts` and `@finplan/shared`'s `toMonthlyAmount` — it just isn't used for these totals.

**Fix:** replace every `/12` fallback with `toMonthlyAmount(amount, spendType)`.

### H3. Full Waterfall page surplus & committed omit the yearly/quarterly average — disagrees with Overview/Surplus ✅ runtime-confirmed

**Where:** `apps/frontend/src/pages/FullWaterfallPage.tsx:123` (`committedTotal = summary.committed.monthlyTotal` only) → `apps/frontend/src/components/waterfall/SurplusStrip.tsx:11` (`income − committed − discretionary`). Backend surplus (`waterfall.service.ts:353`) and `SurplusPage.tsx:16` both also subtract `monthlyAvg12`.

**Runtime proof:** for the seeded household the **Overview** shows committed **£1,335** (with "incl. yearly ÷12 £65"), while the **Full Waterfall** page (`/waterfall`) shows committed **£1,270/mo** for the identical data — the £65/mo yearly-bill average is dropped, so its surplus is £65/mo too high. Three pages, same data, different committed totals.

**Fix:** include `summary.committed.monthlyAvg12` (the non-monthly average) in the Full Waterfall committed/surplus, matching the backend definition.

### H4. Staleness-threshold settings are written under new keys but read under legacy/hardcoded keys — the setting barely does anything

**Where:** Schema + Settings UI use `income_source, committed_item, discretionary_item, asset_item, account_item` (`packages/shared/src/schemas/settings.schemas.ts:3-9`; `apps/frontend/src/components/settings/StalenessSection.tsx:10-24`). Many readers use keys that no longer exist (so they always hit the hardcoded fallback): `CommittedBillsPanel.tsx:32` (`committed_bill`), `WaterfallLeftPanel.tsx:130-153` (`committed_bill`, `discretionary_category`, `yearly_bill`, `savings_allocation`, `wealth_account`), `ReviewWizard.tsx:226-257`, `ItemDetailPanel.tsx:73-78`. Others ignore the setting entirely: `TierPage.tsx` never passes `stalenessMonths` (→ default 12 for all tiers), `AccountItemArea.tsx:207` hardcodes 3, `AssetItemArea.tsx:186` hardcodes 12. Only `IncomeTypePanel.tsx:36` reads a valid key.

**User-visible:** changing staleness thresholds in Settings changes the "needs review" badges almost nowhere (only income-by-type). **Fix:** align every reader to the current `settings.schemas.ts` keys and thread `stalenessMonths` through `TierPage`/`AccountItemArea`/`AssetItemArea`.

### H5. Review Wizard shows the same items twice

**Where:** `ReviewWizard.tsx:148-167`. Step 1 uses `listCommitted`, which returns **all** committed items with no spendType filter (`waterfall.service.ts:520-526`); step 2 uses `listYearly` (the yearly subset, `:614-620`) → yearly items are reviewed in **both** steps. Step 3 concatenates `listDiscretionary` (all discretionary incl. the Savings subcategory, `:708-715`) with `listSavings` (the Savings subcategory, `:849-860`) → savings items appear **twice** within the step. Probable (logic confirmed; worth a runtime pass). **Fix:** exclude yearly items from the committed step and Savings items from the discretionary step (or dedupe by id).

---

## Medium

### M1. ISA contribution-occurrence counter has the same day-31 overflow ✅ reproduced

**Where:** `apps/backend/src/utils/isa-forecast.ts:105-124` (`countPeriodicOccurrences` via `setUTCMonth`). A monthly ISA contribution due on the 31st counts **11** occurrences over a 12-month window → ISA forecast understated by one month's contribution. Same root cause and fix as H1.

### M2. UK ISA tax-year boundary is off by one day — 5 April treated as the new tax year ✅ reproduced

**Where:** `apps/backend/src/utils/isa-tax-year.ts:15` compares a full timestamp against `Date.UTC(y, 3, 5)` (5 April **00:00 UTC**).

**Proof:** at `2026-04-05T00:00Z` the window is correct (`2025-04-06 → 2026-04-05`), but at `2026-04-05T12:00Z` — still 5 April, the **last day of the old tax year** — it returns `2026-04-06 → 2027-04-05`, i.e. the new year. So for all of 5 April except the midnight instant, used-allowance context and `daysRemaining` (jumps to ~365) are wrong.

**Fix:** truncate `today` to UTC midnight before the `<=` comparison (the comparison should be against end-of-day 5 April, or use `today_midnight <= 5-April`).

### M3. Overview committed doughnut: centre total ≠ sum of segments

**Where:** `apps/frontend/src/components/overview/FinancialSummaryPanel.tsx:148` passes `tierTotal = committed.monthlyTotal` (excludes `monthlyAvg12`) to `TierDoughnut` (centre label, `TierDoughnut.tsx:222`), while the **segments** come from drill items that _include_ yearly/quarterly items at monthly equivalent. The adjacent `TierSummaryCard` shows `toGBP(monthlyTotal + monthlyAvg12)` (`snapshot.service.ts:193`). Up to three different "committed" numbers can appear on one screen.

### M4. Committed doughnut drilldown under-weights weekly bills (~4.33×)

**Where:** `apps/frontend/src/utils/doughnutData.ts:16-21`. `bills` (backend includes **weekly** items here, `waterfall.service.ts:318-320`) use raw `b.amount`, while only `nonMonthlyBills` are converted. A £50/week bill appears as a £50 segment next to a £216.67 contribution to the tier total. The test only exercises monthly + yearly, so it misses this.

### M5. Cashflow "average monthly surplus" and "projected end" inflated by the partial current month ✅ runtime-confirmed

**Where:** `cashflow.service.ts` projection start; surfaced on the Forecast → Cashflow page.

**Runtime proof:** the seeded household's waterfall steady-state surplus is **£4,035**, but the Cashflow page headlines **"Average monthly surplus £4,218"** and **"Projected end £50,620"**. The current month (June, today = the 12th) reports `netChange = 6,300` with `monthlyDiscretionaryTotal: 0` — i.e. a full month of income but essentially **no recurring spend** is charged to the partial current month, pulling the 12-month average ~£183/mo above the true figure. Defensible as "future-dated events only", but labelling the skewed 12-month mean "average monthly surplus" invites the contradiction with the waterfall surplus users see elsewhere. Consider excluding the partial current month from the average, or relabelling.

### M6. Full Waterfall amount edits bypass cache invalidation

**Where:** `FullWaterfallPage.tsx:88-103` calls `waterfallService.createPeriod` directly instead of the `useCreatePeriod` hook, so neither the waterfall summary nor tier-items are invalidated after an amount edit; the window's focus handler (`:46-52`) refetches only `summary`, never tier-items. Result: totals and the surplus strip stay stale until a manual refresh. (This is the one place amounts _can_ actually be edited — see C3.) **Fix:** use the invalidating hook.

### M7. Subcategory name-length limits are inconsistent (24 vs 40) → valid quick-adds break the Settings save

**Where:** quick-add allows 40 chars (`waterfall.schemas.ts:438`, no `maxLength` on the `AddSubcategoryButton` input), but the settings batch editor caps at 24 (`SubcategoryRow.tsx:59`; `waterfall.schemas.ts:416`). A 25–40 char subcategory created via quick-add then makes the entire `PUT /subcategories/:tier` batch save reject with 400, and a >40 char quick-add surfaces a raw Zod error toast. **Fix:** pick one limit and apply it to both paths.

---

## Low / observational

- **L1. Money rounding (`packages/shared/src/utils/toGBP.ts:9`).** Float-based half-up is input-dependent: `toGBP(1.005) = 1.00` and `toGBP(8.825) = 8.82`, but `toGBP(10.555) = 10.56`. Already flagged in-repo as interim pending a pence-integer migration; noting for completeness.
- **L2. Inconsistent rounding stages in the waterfall summary (`waterfall.service.ts`).** `income.total`, `monthlyAvg12`, `surplus.amount` are rounded; `committed.monthlyTotal`, `discretionary.total`, `byType[].monthlyTotal` are returned unrounded; `bySubcategory` rounds per-subcategory. Displayed parts can disagree with displayed totals by a penny.
- **L3. Local-time vs UTC drift.** `period.service.ts:36` builds a reference date with local-time `new Date(y, m-1, 1)` while everything else uses `Date.UTC`; `snapshot.service.ts:138` (`ensureJan1Snapshot`) uses local `getMonth()/getDate()`. On a non-UTC server these are a day off.
- **L4. Cashflow starting balance mixes balance dates.** `cashflow.service.ts:522-534` sums latest balances across linked accounts (possibly weeks apart) but replays only from the youngest date. The API exposes `oldestLinkedBalanceDate`, so this may be accepted; flagging the correctness wrinkle.
- **L5. Forecast vs cashflow disposal proceeds differ.** `forecast.service.ts:78` adds `monthlyContribution * 12` at year-end with no intra-year growth and gives the disposal year a full year of growth + contributions regardless of month, while cashflow's liquidation compounds to the day with no contributions. Same disposal → different proceeds. Marked accepted granularity in comments; observation only.
- **L6. `formatCurrency` / `showPence` threading gaps.** Project rule requires `showPence` be threaded to every `formatCurrency` call. 7 waterfall call sites omit it (`TierRow.tsx:160-161`, `SubcategoryGroup.tsx:62`, `WaterfallTierTable.tsx:106`, `SurplusStrip.tsx:21`, `FullWaterfallPage.tsx:174,189`) and ~21 sites (gifts module, help visuals) use raw `toLocaleString()`/`toFixed()` that ignore the setting entirely. Default is "no pence", so this is invisible until a user enables pence — then the waterfall and gifts pages won't honour it. Low severity, real inconsistency.
- **L7. Audit-coverage gaps.** `confirmIncome/Committed/Yearly/Discretionary/Savings` and `confirmBatch` (`waterfall.service.ts`) write `lastReviewedAt` with no `audited()` wrapper; `importService.restoreFromBackup` (`import.service.ts:692`) calls `importHousehold(..., "overwrite")` **without `ctx`**, so a destructive full-household restore writes no `IMPORT_DATA` audit row.
- **L8. Logout access-token blacklist is in-process only** (`middleware/auth.middleware.ts:35`). In a multi-instance deployment a logged-out access token stays valid on other instances until natural (short) expiry. Refresh tokens are revoked in the DB. Bounded impact; note only.
- **L9. Dead, drifted duplicates in `apps/frontend/src/lib/utils.ts`.** `:18-23` defines a second `formatCurrency(value, currency='£')` with no `showPence`; `:35-45` `ACCOUNT_TYPE_OPTIONS` uses values (`'current'`, `'isa'`, `'credit'`, `'loan'`, …) that don't exist in `accountTypeSchema` (`packages/shared/src/schemas/assets.schemas.ts:4-10`: `Current/Savings/Pension/StocksAndShares/Other`). Nothing imports them today (only `cn`), but an editor auto-import could silently pick the wrong `formatCurrency`. Delete the dead exports.
- **L10. Dead invalidation key.** `useSettings.ts:349` invalidates `["household-members"]`, which no query uses (members live under `["household", id]`). Harmless — the correct key is invalidated on the next line — but misleading.

---

## Type / schema consistency notes (non-bugs, worth tracking)

- **Frequency enum drift is _managed_, not broken.** `IncomeFrequencyEnum` uses `"annual"`; `SpendTypeEnum` uses `"yearly"`. The frontend normalises `"annual" ↔ "yearly"` (`useWaterfall.ts:144-150, 287-293`) and `cashflow.service.ts:148` accepts a union of both and handles them identically. Functionally correct but loosely typed — worth consolidating or documenting to prevent a future ÷12-style mistake (it's adjacent to C1).
- Service-layer local types (`auth`, `household`, `assets` frontend services) intentionally reshape responses and are not API contracts — checked, consistent.
- All other entity seams (accounts/assets enums, cashflow event item types, committed/discretionary `spendType`) align across frontend/backend/shared.

---

## Areas checked and found sound

- **`frequency.ts`** conversions (weekly ×52/12, quarterly ×4/÷3, annual ÷12, one-off → 0) are mutually consistent, round-trip exactly, and match their tests.
- **Backend waterfall surplus & percentage:** division-by-zero guarded, negative-surplus signs handled, tests match hand calculation. This is the canonical/correct surplus — the frontend divergences above are where to align.
- **Period semantics** (`start <= ref && (end === null || end > ref)`, end-exclusive) applied identically across `period.service`, `waterfall.service`, and cashflow; neighbour-trimming keeps periods non-overlapping.
- **Cashflow weekly expansion** is weekday-anchored and correct; forward/backward replay branches are symmetric.
- **Forecast maths** (rate selection/overrides, pension exclusion from net worth, real-terms deflation, disposal-proceeds routing) hand-verify against tests; forecast surplus reuses the backend waterfall surplus (single source).
- **Backend scoping** (outside C2): `waterfall`, `assets`, `snapshot`, `planner`, `gifts`, `cashflow`, `settings`, `subcategory` services all assert household ownership on by-id reads/updates/deletes and return `NotFoundError` for cross-household ids (no existence leak).
- **Import/export integrity:** owner-only; overwrite wipes + reloads inside a single `$transaction` with FK-ordered deletes and a pre-overwrite backup; name-based references resolve within the caller's household, so a crafted export file **cannot** inject into another household; schema-version ceiling enforced. Roundtrip tests pass.
- **Auth lifecycle:** zero-trust membership recheck per request, `householdId` resolved server-side, refresh-token rotation with family-wide reuse-detection revocation, generic login/register error messages.
- **Backend test suite:** 69/69 files pass against a fresh migrate + seed.
- **API client vs routes:** ~150 endpoints across all services match on path/verb/params/response envelope (guarded by `service-endpoints.test.ts`). Form validation matches shared schemas for assets/accounts, gifts, household/member, password (min 12), settings ranges, planner. Household switching invalidates the whole cache on switch, so query keys lacking `householdId` don't leak cross-household data. Gifts query keys are properly parameterised. (`GoalsPage` is a "coming soon" stub — no backend.)

---

## Suggested fix order

1. **C1/C2/C3** — all confirmed at runtime, all materially wrong, mostly small fixes: C2 (IDOR/PII), C1 (12× gift overstatement), C3 (amount edits silently dropped).
2. **H1/M1** — introduce one shared "add-months-clamped" date helper and reuse it; add due-day 29–31 tests.
3. **H2/H3/M3/M4/L6** — route all frontend monthly-equivalent and currency formatting through the shared `toMonthlyAmount` / `formatCurrency(showPence)`; delete the local `/12` and `toLocaleString` paths.
4. **H4/H5** — realign staleness-setting keys to the schema; dedupe Review Wizard steps.
5. **M2** — UTC-midnight truncation in the ISA tax-year boundary.
6. **M5–M7 + L1–L10** — as capacity allows.

---

## How this review was run (for reproduction)

- Started Postgres 16, created `finplan_dev` + `finplan_test`, ran `prisma migrate deploy` + seed, booted backend (`:3001`) and frontend (`:3000`).
- Seeded login: `owner@finplan.test` / `BrowserTest123!`.
- Runtime confirmations used the REST API directly and the app in a headless Chromium.
- Three parallel static reviewers covered (a) financial calculations, (b) backend correctness/data-integrity, (c) cross-app consistency; their findings were then verified against the running app where feasible.
