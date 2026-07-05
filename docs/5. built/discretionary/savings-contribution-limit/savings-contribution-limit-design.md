---
feature: savings-contribution-limit
status: draft
creation_date: 2026-04-26
status: implemented
implemented_date: 2026-07-05
---

# Savings Contribution Limit — Design

## Problem

Some Savings accounts (regular savers, fixed-rate notice accounts, monthly bonus products) cap how much can be paid in each month. finplan currently lets users link discretionary "Savings" items to any account but doesn't model that ceiling, so the user has no mechanical signal when (a) their planned contribution exceeds the account's monthly cap, or (b) they have unused headroom that could earn a higher rate in another of their Savings accounts. The waterfall already encourages users to allocate surplus into Savings — this feature closes the loop by letting that allocation be rate-aware.

## Approved Approach

Add an optional `monthlyContributionLimit` to **Savings-type accounts only**. The existing `monthlyContribution` field (sum of linked discretionary items, already computed) is the actual usage. Spare capacity = `limit − monthlyContribution`. The Account detail panel (right panel) renders a single compliant `NudgeCard` when spare capacity is meaningful **and** a strictly higher-rate Savings account exists for the same member. The collapsed row gets a subtle amber dot indicating "noteworthy" — consistent with the existing staleness pattern; the right panel disambiguates the cause.

**Why this approach:** It reuses three existing systems — the linked-discretionary-item aggregation in `accounts.service`, the `NudgeCard` component, and the amber "noteworthy" dot pattern. No new pages, no new visual language, no automated transfers. Compliant with design-anchors #9 (non-advisory), #11 (calm by default), #13 (nudges arithmetic-only, one at a time, right panel only). The field is invisible on non-Savings types so the form doesn't bloat for Current/Pension/StocksAndShares/Other accounts.

### Spare-capacity calculation

- `monthlyContribution` (existing) normalises all linked discretionary items into a £/mo figure: monthly ×1, weekly ×4.333, quarterly ÷3, yearly ÷12, one_off excluded.
- `spareMonthly = monthlyContributionLimit − monthlyContribution` when the limit is set.
- **Lump-sum flag:** if any single linked item's raw amount (regardless of frequency) exceeds the monthly cap, flag it separately — e.g. a £3,000 yearly ISA top-up against a £200/mo cap. This is informational only; it does not block.
- **Over-cap state:** if `monthlyContribution > limit`, show "Over cap by £X/mo" in the detail panel. Informational only — never blocks save (anchor #12).

### Nudge trigger and target selection

Nudge appears when **all** of the following hold:

1. The account is type `Savings` and has a `monthlyContributionLimit` set.
2. `spareMonthly ≥ £25`.
3. There exists at least one _other_ Savings account belonging to the **same member set** (same `memberId`, with household-owned `memberId = null` accounts treated as a peer pool for everyone) where:
   - `growthRatePct` is strictly greater than the current account's effective rate, **and**
   - That account has either no limit set, or its own `spareMonthly > 0`.

The nudge picks the **single highest-rate eligible target** and renders a `NudgeCard` in the right panel:

> "**£75/mo spare** on this account. Marcus Easy Access pays **4.6%** vs. **3.5%** here — redirecting that allocation could earn ~**£10/yr** more."

Language is arithmetic only. No "should". No call-to-action button (no automated rebalance).

### Row indicator

The existing fixed-width amber-dot column on `AssetAccountRow` shows a dot when **any** of: stale review, over-cap, or (spare ≥ £25 + higher-rate target exists). The dot remains a single amber pixel — the right panel explains which condition triggered it. Consistent with design-system.md's "amber is one colour, one pattern" rule.

### Form UX

`AccountForm` renders an extra optional field labelled **"Monthly contribution limit (optional)"** with a help line "Used to flag spare capacity and rate-optimisation nudges." The field is only shown when `type === "Savings"`. Validation: number ≥ 0; blank means "no limit". Stored as `Float?` on the `Account` model.

## Key Decisions

| Decision             | Choice                                                                           | Rationale                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Limit shape          | Monthly cap only — single `Float?`                                               | Most regular savers are monthly. Yearly/duration windows can be added later if needed. YAGNI.                       |
| Limit scope          | Savings type only                                                                | Current/Pension have no monthly cap concept; ISA allowance is already a separate per-person annual limit.           |
| "Used" source        | Sum of linked discretionary items, normalised to £/mo                            | Reuses existing `monthlyContribution` field on `AccountItem`. No new tracking.                                      |
| Non-monthly handling | Normalise + flag oversized lump-sum items                                        | Avoids false "over-cap" on quarterly/yearly top-ups while still flagging if a single payment exceeds the cap.       |
| Target candidate set | Same `memberId`, with household-owned (`memberId = null`) treated as a peer pool | Doesn't suggest moving Alice's allocation into Bob's account, but household pots remain valid targets for everyone. |
| Target picker        | Single highest-rate eligible Savings account with capacity                       | Compliant with anchor #13 ("one at a time, never stacked"). Avoids menu of options.                                 |
| Nudge threshold      | `spareMonthly ≥ £25` AND strictly higher rate exists                             | £25/mo is the smallest delta worth surfacing without becoming noise.                                                |
| Nudge surface        | Right-panel `NudgeCard` only + subtle amber row dot (informational)              | Resolves design-anchors #13 conflict. Dot reuses existing "noteworthy" pattern, no new visual language.             |
| Over-cap behaviour   | Informational note in detail panel, never blocking                               | Anchor #12 — staleness/over-state is informational, never blocks.                                                   |
| Automated action     | None — user manually re-links discretionary items                                | Anchor #9 — non-advisory. Mechanics only, never recommendations.                                                    |

## Out of Scope

- Yearly contribution caps on non-ISA accounts (ISA already covered separately per-person)
- Fixed-term/duration windows for limits (e.g. "12-month bonus rate ends 2026-09")
- Limits on Current, Pension, StocksAndShares, or Other account types
- Multi-account nudge stacking (only one nudge per panel — anchor #13)
- Automated re-allocation, suggested re-linking, or "Apply this nudge" buttons
- Cross-member suggestions (Alice's spare → Bob's account)
- Tracking of historic monthly contributions or "limit used so far this calendar month" — finplan tracks intent, not transactions (anchor #3)
- Changes to ISA allowance tracking, surplus benchmark, or any other existing nudge surface

## Visual Reference

- `mockups/savings-contribution-limit.html` — four states: spare-capacity nudge, fully-used (silent), over-cap, and the AccountForm with the new "Monthly contribution limit" field.

## Open items for `/write-spec`

- Confirm exact NudgeCard copy (currency formatting respects `showPence`; rate display to 1 dp)
- Confirm tooltip copy on the new form field (likely a `definitions.md` addition: "Monthly contribution limit")
- Confirm whether the household-owned (`memberId = null`) "peer pool" rule needs a setting toggle, or is hard-coded behaviour
