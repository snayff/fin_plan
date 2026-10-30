---
feature: isa-allowance-indicator
status: approved
creation_date: 2026-04-26
status: implemented
implemented_date: 2026-07-05
---

# ISA Allowance Indicator — Design

> **Purpose:** Captures the approved product direction — the problem, the chosen approach, and the key decisions made during requirement refinement. This is the input to `/write-spec`. It is intentionally product-level: no Prisma syntax, no route shapes, no component trees.

## Problem

UK ISAs cap each individual at £20,000 of contributions per tax year (6 April to 5 April). Accidentally exceeding the cap creates HMRC penalties and is a real risk when a household has multiple ISAs and standing-order contributions running. finplan already models contributions to accounts (via `DiscretionaryItem.linkedAccountId`) and stores per-account ISA contribution figures, but it does not surface the resulting per-member position, nor does it warn when planned contributions are forecast to push a member past their cap before 5 April.

This feature closes that loop with a single quiet indicator on the Savings right panel — visible enough to be useful, calm enough not to nag.

This supersedes the older backlog spec at `docs/5. built/surplus/wealth-isa-tracking/wealth-isa-tracking-spec.md`, which was written before the `ownerId → memberId` rename (PR #45) and before the `savings-contribution-limit` design established the reusable `monthlyContribution` aggregation pattern.

## Approved Approach

Add an **ISA allowance indicator** to the right panel of `/assets` when `assetClass === 'savings'`, rendered below the existing account list. The indicator shows one horizontal bar per `Member` who owns at least one ISA, scaled to that member's £20,000 allowance.

Each bar displays:

- **Solid teal fill** = `isaYearContribution` already recorded for that member's ISAs.
- **Hatched teal fill** = forecast remaining contributions from `DiscretionaryItem`s linked to those ISAs, calculated by counting actual scheduled occurrences between today and 5 April (not amortised).
- **Vertical limit marker** = the £20,000 cap. Appears only when `used + forecast` exceeds the limit; the bar's max scale becomes `max(limit, used + forecast)` so the over-cap zone is visible.
- **Meta row** = "£X used of £20,000 · £Y remaining" + forecast figure + monthly contribution rate from linked items.

A single `NudgeCard` (existing component, anchor-#13 compliant — one nudge at a time) appears below the bars when **any** member's `forecastedYearTotal > isaAnnualLimit`. Copy is purely arithmetic ("Bob's planned contributions would reach £23,000 by 5 April — £3,000 over the £20,000 limit. Reducing the linked discretionary item by £375/mo would stay within."). No "should". No call-to-action button.

The deadline ("Resets 6 April · N days remaining") sits below the bars in muted text-tertiary.

**Why this approach:**

- Reuses the `monthlyContribution` aggregation pattern from the in-flight `savings-contribution-limit` design — same data plumbing, applied at member-aggregate level on an annual cap.
- Reuses the `NudgeCard` component, the amber row-dot pattern (a triggered ISA forecast becomes one more reason for the existing dot to appear on `AssetAccountRow`), and the existing `isaAnnualLimit` setting.
- Compliant with design anchors: #5 (UK locale), #9 (non-advisory — arithmetic only), #11 (calm by default, amber for attention), #12 (informational, never blocks), #13 (one nudge at a time per panel).
- Form-level enforcement that ISAs require a `memberId` removes a whole class of edge cases (no "Household ISA" rendering rule needed).

### Forecast calculation

Per Member with at least one ISA account:

```
forecastedYearTotal(member)
  = Σ isaYearContribution(member's ISAs)
  + Σ contributionsBeforeApril5(DiscretionaryItems linked to member's ISAs)
```

For each linked `DiscretionaryItem`, occurrences between today and 5 April are counted using `frequency` + `dueDate`:

| Frequency | With dueDate                                               | Without dueDate (fallback)                              |
| --------- | ---------------------------------------------------------- | ------------------------------------------------------- |
| monthly   | Count how many same-day-of-month dates fall in the window  | Pro-rate: amount × months remaining (flagged estimated) |
| weekly    | Count weekly occurrences in the window                     | Pro-rate: amount × weeks remaining                      |
| quarterly | Count quarterly occurrences in the window                  | Pro-rate: amount × quarters remaining                   |
| yearly    | Include full amount if dueDate is in the window; £0 if not | Exclude (cannot estimate without a date)                |
| one_off   | Include full amount if dueDate is in the window; £0 if not | Exclude                                                 |

Items with missing `dueDate` that fall back to pro-rating contribute "(estimated)" to the meta line so users know the figure is less precise.

This avoids the savings-contribution-limit smoothing approach, which would be wrong for an annual cap: a £3,000 yearly top-up dated 30 March must count as £3,000 if today < 30 March and £0 otherwise, never £250/mo.

## Key Decisions

| Decision                           | Choice                                                                                                                                                   | Rationale                                                                                                                                              |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Location                           | `/assets` Savings right panel, below the account list (only when `assetClass === 'savings'`)                                                             | Lives next to the data users edit. Matches the older built-spec placement and the savings-contribution-limit pattern of putting nudges in right panel. |
| Allowance source                   | `HouseholdSettings.isaAnnualLimit` (existing setting, default £20,000)                                                                                   | Already wired through IsaSection settings UI. HMRC has changed the cap historically — keep it data-driven.                                             |
| Grouping                           | Per `Member` (using `Account.memberId`)                                                                                                                  | ISAs are HMRC-individual. Member-level (not user-level) correctly covers partners who don't log in.                                                    |
| Member-less ISA handling           | Block at the form: `isISA = true` requires a non-null `memberId` in `AccountForm`                                                                        | Removes a "Household ISA" rendering edge case; matches HMRC reality. Only `isISA` paths are constrained — non-ISA Savings can still be Household.      |
| Single-member household            | One bar, no name label                                                                                                                                   | Naming yourself is noise.                                                                                                                              |
| Forecast data source               | Reuse `monthlyContribution` aggregation pattern from `savings-contribution-limit`, but count actual scheduled occurrences instead of normalising to £/mo | Correct for an annual cap. Avoids spurious smoothing of yearly/one-off lump sums.                                                                      |
| Items without `dueDate`            | Pro-rate as fallback for monthly/weekly/quarterly; exclude yearly and one-off; mark "(estimated)" in meta                                                | Best-effort accuracy when data is incomplete; honest about precision loss.                                                                             |
| Bar scale                          | `barMax = max(limit, used + forecast)`; vertical limit marker shown only when `forecast > limit`                                                         | Calm in the common case (no marker = nothing to worry about); single clear signal when over.                                                           |
| Visual treatment                   | Solid teal for `used`, hatched teal for `forecast`, amber meta + amber NudgeCard when over                                                               | Reuses tier-surplus colour (savings flow into surplus tier). Anchor #11 — amber is the only attention signal.                                          |
| Legend                             | Drop                                                                                                                                                     | Bar is self-evident. Hover tooltip can cover the rare confused user.                                                                                   |
| `£/mo planned` in meta             | Keep                                                                                                                                                     | Adds context for _why_ the forecast is what it is, without bloat.                                                                                      |
| Empty state — no ISAs at all       | Hide indicator entirely                                                                                                                                  | Don't surface a feature that has no data to show.                                                                                                      |
| Empty state — member with £0       | Show their bar empty ("£0 of £20,000 used · £20,000 remaining")                                                                                          | Visible headroom is informational and non-judgemental.                                                                                                 |
| Already-over from contributions    | Bar fills to limit + small over-spill; marker at limit; "£X over allowance" in meta in amber. No nudge.                                                  | Past-tense over-cap is not a forecast and not actionable; nudge would imply a forward-looking action that no longer exists.                            |
| Tax year rollover (April 6)        | Inherit the existing AccountDetailPanel "new tax year" banner pattern that prompts the user to zero `isaYearContribution`                                | No auto-reset (would lose audit trail and surprise users). Keeps user in control per anchor #12.                                                       |
| Lump-sum flagging (savings parity) | Not needed — occurrence-counting handles it correctly                                                                                                    | Different problem from monthly cap case where a £3k yearly item against a £200/mo cap was a real anomaly to flag.                                      |
| Nudge surface                      | Single `NudgeCard` below the bars; member name disambiguates which member is over                                                                        | Anchor #13 — one nudge at a time per panel. If multiple members were over, only the most-over is shown.                                                |

## Out of Scope

- Auto-reset of `isaYearContribution` on April 6 — explicitly rejected; user manually zeroes via the AccountDetailPanel banner
- Tracking historic ISA contributions across multiple tax years
- ISA type breakdown (Cash ISA / Stocks & Shares ISA / Lifetime ISA / Innovative Finance ISA share separate quirks of the £20k cap — out of scope; treat all `isISA = true` accounts as drawing from the same allowance)
- Lifetime ISA's £4,000 sub-cap and 25% government bonus — separate feature
- Junior ISAs and the separate £9,000 child cap
- Cross-member nudges ("Alice has spare allowance, redirect Bob's contribution") — anchor #13 (one nudge at a time) and complexity outweigh the benefit
- "Apply this nudge" buttons or automated rebalancing of linked discretionary items
- Household-wide ISA total roll-up (e.g. "household used £26.4k of £40k") — per-member is the meaningful unit for HMRC purposes
- Showing the indicator on `/surplus` — the data lives on `/assets`, and the duplication isn't worth it
- Changes to the existing IsaSection settings UI

## Visual Reference

- `mockups/isa-layouts.html` — Option A (selected: stacked per-member bars with hatched forecast and dynamic limit marker) shown alongside Option B (rejected: combined household bar) for comparison

## Open items for `/write-spec`

- **Tax-year-rollover prompt placement.** The existing built spec planned the rollover banner inside `AccountDetailPanel`. Consideration: the Review Wizard is a more natural place for an annual-cycle prompt — a yearly checkpoint is exactly what the wizard is for. Should the prompt live (a) in `AccountDetailPanel` only, (b) in the Review Wizard only, or (c) both? Spec phase to confirm.
- Confirm exact `NudgeCard` copy template for the over-forecast case (currency formatting respects `showPence`; "£X/mo" reduction figure rounded to nearest £25 to avoid spurious precision).
- Confirm tooltip / hover treatment on the bar itself (replaces the dropped legend).
- Confirm whether the amber row dot on `AssetAccountRow` should fire on ISA over-forecast (consistent with the staleness / over-cap dot pattern from savings-contribution-limit).
- Definitions copy for any new glossary terms exposed by the indicator (e.g. "ISA allowance forecast", "tax-year-end deadline" — most likely already covered by existing entries `isa`, `isa-allowance`, `tax-year`).
