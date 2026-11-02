---
feature: savings-contribution-limit
design_doc: docs/4. planning/savings-contribution-limit/savings-contribution-limit-design.md
creation_date: 2026-04-26
status: implemented
implemented_date: 2026-07-05
---

# Savings Contribution Limit

> **Purpose:** Captures _what_ the feature does and _why_ — user stories, acceptance criteria, and interface-level implementation constraints. This is the input to `/write-plan`. It is intentionally not a technical plan: no Prisma syntax, no route code, no component file paths.

## Intention

Many UK Savings products (regular savers, fixed-rate notice accounts, monthly bonus products) cap how much can be paid in each month. finplan currently lets a household link Discretionary "Savings" allocations to any eligible Wealth account but never models that ceiling. This feature adds a per-account monthly cap and a single arithmetic nudge so the user can see, mechanically, when their plan exceeds an account's limit or when they have headroom that could earn a higher rate elsewhere — without recommending action and without leaving the existing waterfall mental model.

## Description

A new optional `monthlyContributionLimit` is added to `Savings`-type Accounts only. The Account detail panel surfaces three derived states from the existing linked-contribution sum: spare capacity, fully used, and over-cap. When spare capacity is meaningful and a strictly higher-rate eligible Savings account exists for the same member, a single `NudgeCard` appears in the right panel with arithmetic-only language. The collapsed Savings row reuses the existing amber "noteworthy" dot when any of these conditions is active; the right panel disambiguates the cause. No new pages, no new visual language, no automated actions.

## User Stories

- As a household planner, I want to record the monthly contribution limit on a regular saver account so that finplan reflects the real-world cap on what I can pay in.
- As a household planner, I want to see at a glance whether my linked Discretionary contributions exceed an account's monthly cap so that I can revisit the plan before the cap rejects payments in real life.
- As a household planner with multiple Savings accounts at different rates, I want finplan to point out when I have unused headroom on a lower-rate account that I could redirect to a higher-rate one I already hold so that my plan earns the most interest available to me.
- As a household member who only owns one of the household's accounts, I want nudges to respect account ownership so that I don't see suggestions to redirect my allocation into another member's private account.
- As a household planner, I want the limit field to appear only on Savings accounts so that the form for Current / Pension / Stocks & Shares accounts isn't cluttered by a field that doesn't apply.

## Acceptance Criteria

- [ ] An `Account` carries an optional `monthlyContributionLimit` field (nullable float, ≥ 0). The field is meaningful only on accounts of type `Savings`; the API rejects non-null values on any other account type.
- [ ] The `AccountForm` renders a "Monthly contribution limit (optional)" input only when `type === "Savings"`. The input accepts blank (clears the limit) or a non-negative numeric value. Validation matches existing rate-input styling for parity.
- [ ] When a Savings account has `monthlyContributionLimit` set, the Account detail panel exposes a derived `spareMonthly = monthlyContributionLimit − monthlyContribution` value. `monthlyContribution` is the existing derived sum of linked Discretionary items normalised to monthly using the formulae already established in `asset-and-account-growth-and-contributions`.
- [ ] When `monthlyContribution > monthlyContributionLimit`, the detail panel shows an "Over cap by £X/mo" line using the `attention` colour. The state is informational only — no save is blocked, no input is disabled.
- [ ] When a single linked Discretionary item's _raw_ amount (before normalisation) exceeds the monthly cap (e.g. a £1,200 yearly top-up against a £200/mo cap), the lump-sum item is flagged in the detail panel with a small annotation noting the raw vs. normalised amount. Informational only.
- [ ] A `NudgeCard` appears in the Account detail right panel when **all** of the following hold:
  - The selected account is type `Savings` and has a `monthlyContributionLimit` set.
  - `spareMonthly ≥ £25`.
  - There exists at least one _other_ Savings account in the same household whose `memberId` matches the selected account's `memberId`, **or** whose `memberId` is `null` (household-owned), where the candidate's effective `growthRatePct` is strictly greater than the selected account's effective rate, and the candidate has either no limit or its own `spareMonthly > 0`.
- [ ] When eligible, the nudge picks the **single highest-rate** target. Ties are broken deterministically by account `name` ascending.
- [ ] The over-cap state renders its own `NudgeCard` (separate from the spare-capacity nudge — the two states are mutually exclusive on the same account). At most one `NudgeCard` is visible per right panel at any time.
- [ ] Nudge copy is arithmetic-only and follows these formats; both honour the household `showPence` setting for currency and display rates to 1 decimal place:
  - **Spare-capacity nudge:** "**£{spare}/mo spare** on this account. {Target.name} pays **{target.rate}%** vs **{current.rate}%** here — redirecting could earn ~**£{annualUplift}/yr** more." — where `annualUplift = round(spare × 12 × (target.rate − current.rate) / 100)`.
  - **Over-cap nudge:** "Linked contributions total **£{monthly}/mo** — **£{over} over** this account's **£{limit}/mo** limit. The cap is set on the account; review the linked Discretionary items if this is unintended."
- [ ] The collapsed `AssetAccountRow` shows the existing amber `attention` dot when **any** of: stale review, over-cap, or (`spareMonthly ≥ £25` AND a higher-rate target exists). The dot remains a single amber pixel — no new colours, no badges, no inline text are added to the row.
- [ ] The Account detail panel shows a thin capacity meter under the "Monthly contributions" line when `monthlyContributionLimit` is set: `tier-discretionary` purple normally, `attention` amber when over-cap. The meter is not shown when no limit is set.
- [ ] Setting, changing, or clearing `monthlyContributionLimit` on an account is audited via the existing `audited()` helper, scoped to the household via `req.householdId!`, and triggers TanStack Query invalidation of the accounts list (so the row dot, capacity meter, and nudge update without a refresh).
- [ ] When a Savings account has no limit set, no derived spare/over-cap value, no capacity meter, and no nudge are produced for that account regardless of contribution sum. The feature is fully opt-in.
- [ ] When the only candidate higher-rate account is missing a `growthRatePct` value (neither override nor household default resolvable), it is excluded from candidacy. If that leaves no candidates, no nudge is shown.
- [ ] `definitions.md` gains a "Monthly contribution limit" entry with tooltip text used verbatim by the form helper line and any tooltip surface.

## Open Questions

- [x] ~~Should non-monthly linked items count against the monthly cap?~~ **Yes** — normalised to monthly using the existing formulae. A separate lump-sum flag surfaces individual items whose raw amount exceeds the cap.
- [x] ~~Which accounts are candidates for the higher-rate target?~~ **Same `memberId` plus household-owned (`memberId = null`) Savings accounts.** Cross-member suggestions are out of scope.
- [x] ~~When does the nudge fire?~~ **`spareMonthly ≥ £25` AND a strictly higher-rate eligible candidate exists.** Below that threshold the nudge stays silent.
- [x] ~~How is over-cap presented?~~ **As an informational `NudgeCard` plus an amber capacity meter.** Never blocks save (anchor #12).
- [x] ~~Does the peer-pool rule (household accounts as peers for any member) need a settings toggle?~~ **No — hard-coded.** YAGNI; revisit if a household reports it being wrong.
- [x] ~~Tooltip / helper copy?~~ **One new `definitions.md` entry**, "Monthly contribution limit", reused by the form's helper line.

---

## Implementation

> Interface-level constraints for the implementor. Describes _what_ is needed — entities, operations, UI units — without specifying _how_ to build them. `/write-plan` makes the technical decisions (Prisma syntax, route shapes, file paths, component code).

### Schema

- **Account**: gains an optional `monthlyContributionLimit` (nullable float, ≥ 0). Meaningful only on `type === "Savings"`. The validator rejects a non-null value on any other account type. No new index needed; the field is read together with the rest of the account.
- All entities remain household-scoped. The new field is read and mutated only via the existing household-scoped account endpoints.

### API

- **List accounts (existing endpoint, augmented)** — each returned Savings account additionally carries `monthlyContributionLimit`, the existing derived `monthlyContribution`, and two new derived booleans for the row indicator: `hasSpareCapacityNudge` (spare ≥ £25 AND a higher-rate eligible target exists) and `isOverCap` (`monthlyContribution > monthlyContributionLimit`). The derived target's `{ id, name, growthRatePct }` is included on the selected-account payload only — list-level payloads do not include the target object to keep payloads small. JWT-protected, household-scoped.
- **Get account detail (existing endpoint, augmented)** — extends the response with the derived spare-capacity / over-cap state and the higher-rate target (or `null`), plus a per-linked-item `lumpSumExceedsCap: boolean` flag for items whose raw amount exceeds the cap. JWT-protected, household-scoped.
- **Update account (existing endpoint, augmented)** — accepts `monthlyContributionLimit` as an optional input. Rejects non-null values when the account's type is not `Savings`. If a future update changes an account's `type` away from `Savings` (not currently exposed in the UI), the limit is nulled in the same write. JWT-protected, household-scoped, audited.
- **Create account (existing endpoint, augmented)** — accepts the same field with the same constraint. JWT-protected, household-scoped, audited.
- **No new endpoints.** All behaviour layers onto the existing accounts router.
- **Rate limits** — existing per-route limits apply.
- **Cross-household leakage protection** — the candidate-target search is scoped to `req.householdId!` only. The nudge can never reference an account outside the caller's household.

### Components

- **AccountForm (updated)** — renders a "Monthly contribution limit (optional)" input only when `type === "Savings"`. Field follows existing rate-input styling: small uppercase label, numeric input, helper line. Helper text is the canonical `definitions.md` tooltip. Validation: number ≥ 0 or blank. Reuses the form's existing error-display pattern.
- **AccountItemArea / AssetAccountRow (updated)** — when expanded, the right-panel detail section adds:
  - A capacity meter beneath the "Monthly contributions" line when a limit is set; uses `tier-discretionary` normally and `attention` when over-cap.
  - A "Total/mo" line that reads `£X / £Y` (used / limit) when the limit is set.
  - The amber `attention` dot in the collapsed row's existing dot column gains an additional trigger condition (over-cap OR spare-capacity-nudge-active). No new visual element is introduced; only the dot's truth condition is extended.
- **SavingsContributionNudge** — a thin wrapper around the existing `NudgeCard` component that selects the right copy template and substitutes the formatted values. Two templates: spare-capacity and over-cap. Mutually exclusive — at most one renders per panel. Uses existing currency-formatting helpers (`formatCurrency` with `showPence`) and a one-decimal rate formatter.
- **No new design tokens, no new colour roles.** All visuals reuse `attention`, `attention-bg`, `attention-border`, and `tier-discretionary`.

### Notes

- **Derived values live on the read path.** `spareMonthly`, `hasSpareCapacityNudge`, `isOverCap`, and the higher-rate target are computed in the accounts service from the existing `monthlyContribution` calculation. They are never persisted.
- **Higher-rate candidate selection algorithm.** Given a selected Savings account `S`:
  1. Resolve `S.effectiveRate = S.growthRatePct ?? householdSettings.savingsRatePct`.
  2. Build the candidate set = all other accounts in the same household where `type === "Savings"` and (`memberId === S.memberId` OR `memberId === null`).
  3. Resolve each candidate's effective rate the same way; drop any candidate whose effective rate cannot be resolved.
  4. Filter to candidates whose effective rate is strictly greater than `S.effectiveRate`.
  5. Filter to candidates whose `monthlyContributionLimit` is null OR `(monthlyContributionLimit − monthlyContribution) > 0`.
  6. Sort by effective rate descending, then `name` ascending. Pick the first.
  7. If no candidate survives, the nudge is silent.
- **Annual uplift formula.** `annualUplift = round(spare × 12 × (target.rate − current.rate) / 100)`. Always non-negative because the candidate set guarantees `target.rate > current.rate`. Rounded to the nearest pound for display; pence are not shown for this figure regardless of `showPence` (it is a coarse estimate, and the existing arithmetic-nudge convention rounds annualised projections).
- **Currency / rate formatting.** Spare, limit, monthly, and over-cap amounts use `formatCurrency(value, showPence)`. Rates display as `value.toFixed(1) + "%"`.
- **Threshold rationale.** £25/mo is the smallest delta worth surfacing without becoming noise. Below this the nudge stays silent — the row dot also stays off, so the row is fully calm.
- **Over-cap and spare-capacity are mutually exclusive on the same account** by construction (`spare > 0` ⟺ `monthlyContribution < limit`). The nudge logic chooses one or the other, never both.
- **Cache invalidation.** Mutations on the new field invalidate the accounts list and account detail queries. Mutations to linked Discretionary items already invalidate the accounts list per the contributions feature; nothing new is needed there.
- **`definitions.md` addition.** A single new entry — "Monthly contribution limit" — with tooltip text approximately: _"The most this account lets you pay in each month. finplan uses this to flag spare capacity and surface higher-rate alternatives among your other savings accounts."_ The exact wording is finalised in `/write-plan` against the prevailing tone of `definitions.md`.
- **Security posture.** The new field is mutated through the existing `updateAccount` and `createAccount` handlers, which already use `authMiddleware`, scope by `req.householdId!`, and wrap in `audited()`. No new auth surface. Higher-rate candidate computation is server-side and pulls only from the caller's household. Validation is done via Zod schemas in `packages/shared`.
- **PII / audit.** The audit trail records the value of `monthlyContributionLimit` before and after mutation alongside the existing account fields. No new PII is introduced.
- **Multi-tenancy.** The candidate-target query is constrained to the household; no cross-household account is ever readable.
- **CSRF / rate limiting.** No new endpoints, no new exposure; existing protections cover the change.
