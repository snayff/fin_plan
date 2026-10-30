---
feature: nudge-card
status: implemented
priority: high
deferred: false
phase: 7
implemented_date: 2026-07-05
---

# NudgeCard

## Intention

Users benefit from seeing mechanical observations about their finances — unused capacity, approaching limits, or cashflow shortfalls — without the app telling them what to do. The NudgeCard surfaces these opportunities contextually, using arithmetic and options, never recommendations.

## Description

A contextual prompt component that appears in the right panel when a mechanical observation is available. Each NudgeCard contains a single sentence combining information and arithmetic, with an optional action link. Nudges are never stacked — at most one appears per panel view. When no opportunity exists, the NudgeCard is absent (silence = approval).

## User Stories

- As a user viewing my yearly bills, I want to see a clear breakdown of any cashflow shortfall so I can decide how to address it.
- As a user with savings accounts, I want to see when I have unused contribution capacity at a higher rate so I can make informed decisions.
- As a user approaching my ISA limit, I want to see my remaining allowance and the deadline so I stay aware.

## Acceptance Criteria

### Component

- [ ] Renders in the right panel only — never in the left panel or inline in a list
- [ ] One NudgeCard at a time per panel view — never stacked
- [ ] Absent when no opportunity exists
- [ ] Background: `attention-bg` token (subtle amber tint); border: `attention-border` token — not a coloured alert box, not a warning banner
- [ ] Anatomy: single sentence (information + arithmetic) + optional action link
- [ ] Language: arithmetic and options only, never recommendations
- [ ] Positioned below the `ButtonPair` when both are present; absent otherwise

### Yearly Bills context (Overview — Item Detail)

- [ ] Appears on the Yearly Bills row detail when any cashflow shortfall exists
- [ ] Text pattern:
  > "{month} looks tight — {n} bills land ({total} total). Your pot will have {pot} by then.
  > Options:
  >
  > - Increase your monthly contribution by {x} to cover this
  > - Draw {abs(pot)} from existing savings when the bills fall due"
- [ ] One NudgeCard per shortfall month (shows the first/worst shortfall)
- [ ] Action link: "See cashflow calendar" (navigates to CashflowCalendar view)

### Savings context (Overview — Item Detail)

- [ ] Appears on Savings allocation row detail when an optimisation opportunity exists
- [ ] Higher-rate unused capacity: show arithmetic ("Redirecting {amount}/mo to this account could earn ~{gain} more per year")
- [ ] No NudgeCard on standard income, committed bill, or discretionary items

### Wealth context (Account Detail)

- [ ] Appears on savings-class account detail only
- [ ] Trigger rules:

| Situation                                            | Nudge?                                      |
| ---------------------------------------------------- | ------------------------------------------- |
| Higher-rate account has unused contribution capacity | Yes — show arithmetic                       |
| All contributions already at optimal rate            | No                                          |
| At ISA limit                                         | No                                          |
| Approaching ISA limit (within ~2,000)                | Yes — show remaining allowance and deadline |
| Under ISA limit with capacity                        | Yes — show remaining allowance              |

- [ ] One nudge maximum per panel — silence if all already optimised

### Cashflow Calendar context

- [ ] Appears when a shortfall month is detected
- [ ] Same text pattern as Yearly Bills context above
- [ ] Arithmetic-only — no recommendation about which option to choose

## Open Questions

- None

---

## Implementation

### Schema

No schema — client-side only. Nudge conditions are derived from existing data.

### API

No API — all nudge logic runs client-side using data already fetched for the parent view.

### Components

- `NudgeCard.tsx` — renders the card with message text and optional action link. Props: `message: string`, `options?: string[]`, `actionLabel?: string`, `actionHref?: string`
- `useNudge.ts` — hook per context that computes whether a nudge should appear and returns the nudge content (or null). Separate hooks or functions for each context: `useYearlyBillNudge`, `useSavingsNudge`, `useWealthAccountNudge`, `useCashflowNudge`

### Notes

- The NudgeCard shell component is built in Phase 7 (foundation). Contextual nudge logic is wired in during the relevant page phases:
  - Phase 8 (Overview): Yearly Bills and Savings nudges
  - Phase 9 (Wealth): Wealth account nudges
  - Phase 8 (Cashflow Calendar): Cashflow shortfall nudges
- Design system reference: `design-components.md` section "NudgeCard"
- Design anchor #12: "Nudges are one at a time, arithmetic-only, never stacked"
