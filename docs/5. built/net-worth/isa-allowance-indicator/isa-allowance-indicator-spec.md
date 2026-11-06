---
feature: isa-allowance-indicator
design_doc: docs/4. planning/isa-allowance-indicator/isa-allowance-indicator-design.md
creation_date: 2026-04-26
status: implemented
implemented_date: 2026-07-05
---

# ISA Allowance Indicator

> **Purpose:** Captures _what_ the feature does and _why_ — user stories, acceptance criteria, and interface-level implementation constraints. This is the input to `/write-plan`. It is intentionally not a technical plan: no Prisma syntax, no route code, no component file paths.

## Intention

UK ISAs cap each individual at £20,000 of contributions per tax year (6 April to 5 April). Exceeding the cap creates HMRC penalties. finplan already stores per-account ISA contributions and models contributions to accounts via linked discretionary items, but does not surface the resulting per-member position or warn when planned contributions are forecast to push a member past their cap before 5 April. This feature closes that loop with a single quiet indicator on the Savings right panel — visible enough to be useful, calm enough not to nag.

## Description

An **ISA allowance indicator** rendered in the right panel of `/assets` when `assetClass === 'savings'`, below the existing account list. One horizontal bar per Member who owns at least one ISA account, scaled to that member's £20,000 allowance. Each bar shows used contributions (solid teal), forecast remaining contributions (hatched teal), and a vertical limit marker that appears only when the forecast pushes over the cap. A single arithmetic-only `NudgeCard` appears below the bars when any member is forecast to exceed their cap. The Account form gains an "Is ISA?" toggle and a contribution figure input on Savings-type accounts; ISA accounts must have a `memberId` assigned. The `AccountDetailPanel` of an ISA account also shows a calm "new tax year" banner once the date passes 6 April, offering a single-click zeroing of the prior year's contribution.

## User Stories

- As a user, I want to see how much of my annual ISA allowance I have used so that I don't accidentally exceed the limit and trigger HMRC penalties.
- As a user, I want to see how much remaining allowance I have so that I can plan further contributions before the tax year ends.
- As a user with multiple ISAs, I want my contributions across all my ISA accounts to count towards one shared per-person allowance.
- As a user in a multi-member household, I want each member's ISA allowance tracked independently so that I can see Alice's and Bob's positions separately.
- As a user with standing-order contributions linked to an ISA, I want to be warned when those planned contributions are forecast to push me over the £20k cap before 5 April so that I can adjust the plan.
- As a user starting a new tax year, I want the AccountDetailPanel of each ISA to prompt me to zero last year's contribution so that this year's tracking starts fresh without losing the previous figure silently.
- As a user, I want the indicator hidden when I have no ISAs so that it doesn't clutter the Savings panel.

## Acceptance Criteria

- [ ] An "Is ISA?" toggle appears on the Account form only when `type === 'Savings'`; toggling it on requires `memberId` to be set (non-null) for the form to save.
- [ ] An "ISA contribution this tax year" numeric input appears on the Account form only when `type === 'Savings'` and "Is ISA?" is on; defaults to £0; accepts values ≥ 0.
- [ ] The ISA allowance indicator is rendered in the Savings right panel below the account list whenever the household has ≥1 ISA account; otherwise it is hidden entirely.
- [ ] The indicator shows one bar per Member who owns ≥1 ISA account, ordered by member sort order.
- [ ] In a single-member household, the bar is shown without a name label.
- [ ] In a multi-member household, each bar is labelled with the member's name.
- [ ] Each bar's solid teal fill represents the sum of `isaYearContribution` across that member's ISA accounts.
- [ ] Each bar's hatched teal fill represents the forecast contribution from `DiscretionaryItem`s linked to that member's ISA accounts, calculated using occurrence-counting between today and 5 April.
- [ ] Bar max scale is `max(isaAnnualLimit, used + forecast)`; the vertical limit marker appears only when `used + forecast > isaAnnualLimit`.
- [ ] Each bar's meta row shows "£X used of £[limit] · £Y remaining", the forecasted year-end total, and the planned £/mo from linked items.
- [ ] When forecast figures include any pro-rated fallback (linked monthly/weekly/quarterly item missing `dueDate`), the meta row appends "(estimated)".
- [ ] Hovering the bar shows a tooltip with: "Used so far: £X · Forecast: £Y · Limit: £[limit]".
- [ ] When `used > isaAnnualLimit` from `isaYearContribution` alone, the meta line shows "£X over allowance" in amber; no NudgeCard appears for that case.
- [ ] When `forecastedYearTotal > isaAnnualLimit` for ≥1 member, a single `NudgeCard` is rendered below the bars, referencing the most-over member.
- [ ] The NudgeCard copy follows the template: `"[Member]'s planned contributions would reach £[forecast] by 5 April — £[over] over the £[limit] limit."` All currency formatted via `formatCurrency`, respecting `showPence`.
- [ ] No NudgeCard appears when no member is forecast to exceed their cap.
- [ ] The indicator shows a deadline line below the bars: "Resets 6 April · N days remaining" in `text-tertiary`.
- [ ] An ISA over-forecast triggers the existing amber dot on `AssetAccountRow` for each affected ISA account in the account list (consistent with the staleness / over-cap dot pattern).
- [ ] `AccountDetailPanel` renders a "New tax year" banner above the form on any ISA account where the current date is on or after 6 April **and** `isaYearContribution > 0` **and** `updatedAt` predates the most recent 6 April. The banner offers a "Zero this year's contribution" action that sets `isaYearContribution = 0` on that single account via the existing account update endpoint.
- [ ] The banner uses the established calm/amber treatment (no destructive language, no auto-action — the user must click the action).
- [ ] The banner disappears once the user actions it or once the account's `updatedAt` advances past the most recent 6 April.
- [ ] All currency display in the indicator and banner respects the `showPence` setting threaded from `HouseholdSettings`.
- [ ] When `HouseholdSettings.isaAnnualLimit` is changed, the indicator updates on its next render with the new limit (no hardcoded £20,000 in the indicator code).
- [ ] All API routes added by this feature are JWT-protected and household-scoped; ISA contribution totals can never be retrieved cross-household.
- [ ] While the ISA allowance summary is loading, the indicator slot renders a `SkeletonLoader` placeholder; on hard error with no cached data it renders `PanelError`; on background-refetch error with cached data it renders the existing `StaleDataBanner` over the last-known indicator (per the `loading-error-states` rules).

## Open Questions

- [x] ~~Where should the tax-year-rollover prompt live?~~ **`AccountDetailPanel` banner only** (option a). The Review Wizard is intentionally untouched by this feature; whether to add a wizard step there is a separate future consideration carried forward from the design's open items.
- [x] ~~NudgeCard copy and rounding granularity?~~ **First sentence only — no reduction suggestion.** "[Member]'s planned contributions would reach £[forecast] by 5 April — £[over] over the £[limit] limit."
- [x] ~~Bar hover tooltip content?~~ **Per-segment breakdown** — "Used so far: £X · Forecast: £Y · Limit: £[limit]".
- [x] ~~Should the amber row dot fire on ISA over-forecast?~~ **Yes** — consistent with the savings-contribution-limit / staleness pattern.
- [x] ~~New glossary entries needed?~~ **No** — `isa`, `isa-allowance`, and `tax-year` already exist and reference this feature in their `appearsIn` field.

---

## Implementation

> Interface-level constraints for the implementor. Describes _what_ is needed — entities, operations, UI units — without specifying _how_ to build them. `/write-plan` makes the technical decisions (Prisma syntax, route shapes, file paths, component code).

### Schema

- **Account** (existing entity — extended): add `isISA: Boolean` (default false) and `isaYearContribution: Float?` (nullable, defaults to 0 when ISA toggle is on). Both fields are meaningful only when `type === 'Savings'`. `Account.memberId` (existing) becomes a soft-required field whenever `isISA = true` — enforced at the form layer and the API validation layer; the database column itself remains nullable so non-ISA Savings accounts can still be Household-assigned (`memberId = null`).
- **HouseholdSettings** (existing entity — no schema change): `isaAnnualLimit` already exists with a default of 20000. The indicator reads from this; no other fields needed.
- **DiscretionaryItem** (existing entity — no schema change): `linkedAccountId` and `dueDate` are already present. Forecast calculation reads these.
- **Member** (existing entity — no schema change): `Account.memberId` already references `Member.id` (post PR #45 / member-attribution work). Per-member grouping uses this relation.
- No new entity is introduced by this feature.
- All entities remain household-scoped; no cross-household references.

### API

- **Update `Account` create/update operations** — accept new `isISA` and `isaYearContribution` fields; validate that `isISA = true` requires `memberId !== null` and `type === 'Savings'`; reject with a clear validation error otherwise. JWT-protected, household-scoped. The "Zero this year's contribution" banner action also flows through this endpoint (`PATCH /accounts/:id` with `{ isaYearContribution: 0 }`) — no separate batch endpoint is needed.
- **Get ISA allowance summary** — returns the indicator's full data: tax year start/end dates derived from current date + 6-April rule, `isaAnnualLimit` from settings, and a per-Member array containing `memberId`, `name`, `used` (sum of `isaYearContribution`), `forecast` (sum of forecast contributions), `forecastedYearTotal`, `monthlyPlanned` (sum of normalised £/mo from linked items, for display only), and an `estimatedFlag` boolean indicating whether any forecast input fell back to pro-rating. JWT-protected, household-scoped. Returns an empty `byMember` array when the household has no ISA accounts (the frontend uses this to hide the indicator).
- All operations validated via Zod schemas in `packages/shared`.

### Components

- **AccountForm** (existing — extended) — when `type === 'Savings'`, render an "Is ISA?" toggle. When the toggle is on, render an "ISA contribution this tax year" numeric input. Form-level validation rejects save when `isISA && !memberId`. Tooltip on the toggle uses the existing `isa-allowance` glossary entry. The "Assigned to" Select must be visibly required when "Is ISA?" is on.
- **AssetAccountRow** (existing — extended) — its existing amber-dot column gains ISA over-forecast as another trigger condition. The right panel disambiguates which condition triggered the dot (existing pattern from savings-contribution-limit).
- **IsaAllowanceIndicator** (new) — the indicator block. Renders one `IsaMemberBar` per member returned by the ISA allowance summary endpoint, the deadline line, and a single `NudgeCard` if any member's `forecastedYearTotal > isaAnnualLimit`. Hidden entirely when the summary returns no members. Mounted in the Savings right panel below the account list. Reuses tier-surplus colour and the existing `NudgeCard` component.
- **IsaMemberBar** (new) — a single horizontal bar with solid (used) and hatched (forecast) regions, an optional vertical limit marker, the meta line, and the hover tooltip. Reads its props directly from one entry in the summary's `byMember` array.
- **AccountDetailPanel** (existing — extended) — for ISA accounts (`type === 'Savings' && isISA === true`), render a "New tax year" banner above the form when the current date is on or after 6 April and the account's `updatedAt` predates the most recent 6 April and `isaYearContribution > 0`. Banner copy is calm/arithmetic ("A new tax year began on 6 April. Last year's contribution was £X — zero it to start tracking this year."). A "Zero this year's contribution" button calls the existing account-update endpoint with `{ isaYearContribution: 0 }`. The banner self-dismisses once the field is zeroed or the account is otherwise updated.
- **Review Wizard** — explicitly **out of scope** for this feature. The wizard is not modified. Whether to add a wizard step in addition to the AccountDetailPanel banner is carried forward as a future consideration.

### Notes

**Forecast calculation:**

For each Member with ≥1 ISA account, `forecastedYearTotal = sum(isaYearContribution across their ISAs) + sum(contributionsBeforeApril5 across DiscretionaryItems linked to their ISAs)`.

For each linked `DiscretionaryItem`, count occurrences between today (inclusive) and 5 April (inclusive of the next 5-April after today) using `frequency` + `dueDate`:

| Frequency | With dueDate                                              | Without dueDate (fallback)                                     |
| --------- | --------------------------------------------------------- | -------------------------------------------------------------- |
| monthly   | Count same-day-of-month occurrences in window             | Pro-rate: `amount × monthsRemaining` (sets `estimatedFlag`)    |
| weekly    | Count weekly occurrences in window                        | Pro-rate: `amount × weeksRemaining` (sets `estimatedFlag`)     |
| quarterly | Count quarterly occurrences in window                     | Pro-rate: `amount × quartersRemaining` (sets `estimatedFlag`)  |
| yearly    | Include full amount if dueDate is in window; £0 otherwise | Exclude; do **not** set `estimatedFlag` (correctly £0 unknown) |
| one_off   | Include full amount if dueDate is in window; £0 otherwise | Exclude; do **not** set `estimatedFlag`                        |

The "next 5-April" is determined by current date: if today is on or before 5 April of the current calendar year, the window ends at this year's 5 April; otherwise it ends at next year's 5 April. The `isaYearStartMonth` / `isaYearStartDay` fields from older specs are **not** used — the rollover boundary is hardcoded to 6 April per anchor #5 (UK locale only).

**Tax year start/end derivation:**

- `taxYearEnd` = the next 5 April from today.
- `taxYearStart` = the 6 April preceding `taxYearEnd` (i.e. one year minus one day earlier).
- `daysRemaining` = whole days between today and `taxYearEnd`, displayed in the deadline line.

**NudgeCard selection rule (anchor #13):**

When multiple members are over their forecast limit, only one nudge is shown — the member with the largest absolute over-cap amount (`forecastedYearTotal − isaAnnualLimit`). On equal overage, lowest member sort order wins.

**Past-tense over-cap:**

When `used > isaAnnualLimit` (i.e. `isaYearContribution` totals already exceed the cap regardless of forecast), the bar fills the used region past the limit marker, the meta line shows "£X over allowance" in amber, and **no NudgeCard is rendered for that member**. A nudge implies a forward-looking adjustment that no longer exists; the amber meta line is the correct calm signal.

**Estimated-flag display:**

If any forecast input fell back to pro-rating, append "(estimated)" to that member's meta line. The flag is per-member, not global.

**Bar visual treatment:**

- Used fill: `tier-surplus` solid at 70% opacity.
- Forecast fill: `tier-surplus` 45° hatched stripes at 40% opacity, immediately following the used fill.
- Limit marker: 2px vertical bar in `text-secondary`, only rendered when `used + forecast > isaAnnualLimit`.
- Over-forecast meta line: amber (`--attention`).
- Bar height: 8px, fully rounded.

**Amber row dot trigger:**

For each ISA account belonging to a Member whose `forecastedYearTotal > isaAnnualLimit`, the existing `AssetAccountRow` amber dot fires. The dot does **not** fire purely from `used > isaAnnualLimit` (past-tense over-cap), because that case is not actionable from the row context — the meta line on the indicator is sufficient. The dot also continues to fire from its existing triggers (stale review etc.), unchanged.

**Member display:**

Members in the summary's `byMember` array are ordered by `Member.sortOrder`. Members with zero ISA accounts are excluded entirely. Members with ISAs but `used = 0` and no linked items are still included with an empty bar — visible headroom is informational and non-judgemental (anchor #11).

**Performance:**

The ISA allowance summary endpoint runs on every Savings panel render. It must complete within the existing per-request budget; any computation across all linked `DiscretionaryItem`s should be done in a single query plan (e.g. include linked items when fetching ISA accounts), not N+1.

**Audit:**

- Toggling `isISA` on an existing account and changing `isaYearContribution` (including via the banner's zero action) are wrapped in `audited()` with `actorCtx(req)` per the existing `updateAccount` pattern. The audit row captures the prior `isaYearContribution` value so a user could restore manually if needed.

**Multi-tenancy:**

- The ISA allowance summary endpoint scopes all reads by `req.householdId!` (never accepts a household id from the URL).
- The existing `assertAccountOwned` check on `PATCH /accounts/:id` covers the banner's zero action — no new multi-tenancy logic is added.

**Validation (`packages/shared`):**

- Existing `createAccountSchema` and `updateAccountSchema` are extended with `isISA: boolean` and `isaYearContribution: number | null` fields, plus a refinement asserting `isISA → memberId !== null && type === 'Savings'`.
- New Zod schema for the ISA allowance summary response.

**Frontend data fetching:**

- A TanStack Query hook for the ISA allowance summary — invalidated by mutations to: any `Account` (create / update / delete) and any `DiscretionaryItem` whose `linkedAccountId` is set.
- The banner's zero action reuses the existing `useUpdateAccount` mutation; no new data-fetching primitives.
