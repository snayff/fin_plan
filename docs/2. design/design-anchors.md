# finplan — Design Anchors

> These are the non-negotiable invariants of finplan. They are the decisions that constrain all other decisions — if any of these are violated, the nature or integrity of the product changes. Read this document first when onboarding to the project or establishing context.
>
> These anchors do not change without a deliberate, explicit decision to do so. Features and specs can evolve; anchors should not drift.

---

## What finplan Is

1. **finplan is a personal planning tool — not a ledger, not an advisor.** It gives users a clear picture of where their money comes from, goes, and is heading. It does not track transactions, provide financial advice, or replace a bank.

2. **The waterfall is the mental model.** Money flows: Income → Committed Spend → Discretionary Spend → Surplus. Every design decision reinforces this cascade. The waterfall is not a feature — it is the identity of the app.

3. **finplan tracks intent (budgets), not transactions — with one scoped exception for Gifts.** The app holds the plan. Users reconcile actual spending through their bank for income, committed spend, and discretionary spend. Language in these tiers must reflect this: use "budgeted", "planned", "allocated"; never "spent", "paid", "charged".

   **Gifts exception:** The Gifts planner is the only place in the app where users may record actual amounts against a planned gift. Within the Gifts planner, "spent" is permitted and means _"the amount the user recorded against a specific planned gift"_. This exception is scoped:
   - It applies to per-gift actuals and aggregates computed from them (e.g. "£450 spent of £2,400 planned").
   - It does **not** apply to the waterfall. The waterfall always shows the annual gift _budget_, never the sum of actuals.
   - It does **not** apply to any other tier or feature.

4. **All income is net (take-home only).** Gross income, tax calculations, and employer contributions are out of scope. Users enter what arrives in their account.

---

## Scope Boundaries

5. **UK locale only.** Currency is GBP. The tax year runs April to April. All context, terminology, and defaults are UK-specific. No multi-currency support; no i18n.

6. **Desktop-first.** Desktop is the primary environment for setup, review, and analysis. The mobile experience is deferred — see the backlog specs.

7. **Dark theme only.** No light mode. No theme switching. If this changes in future, only the token layer needs updating — not component code.

8. **No bank sync, no receipt upload, no transaction tracking.** finplan is a planning tool only. All values are entered manually and kept current through periodic review.

---

## Behavioural Invariants

9. **Non-advisory.** finplan surfaces mechanics and arithmetic only — never recommendations. "£11,600 ISA allowance remaining before April" is acceptable. "You should use your ISA allowance" is not.

10. **Non-judgemental.** finplan does not colour-code financial positions as good or bad. Whether you have money or no money, the app shows the same neutral treatment. Financial values are never red (negative) or green (positive). The app helps — it does not grade.

11. **Calm by default.** The app is a trusted companion, not an alarm system. Silence means everything is fine. Amber is the only attention signal — a gentle "noteworthy" marker, never an alarm. Red is reserved for app errors only.

12. **Staleness is always informational, never blocking.** A stale value is flagged but never prevents the user from proceeding. The user is always in control.

13. **Nudges are one at a time, arithmetic-only, never stacked.** A nudge surfaces a mechanical opportunity. It never recommends. There is never more than one nudge visible in a panel simultaneously.

---

## Structural Invariants

14. **Surplus is the cascaded remainder of the waterfall.** Surplus = Income − Committed Spend − Discretionary Spend. There is no other definition.

15. **Yearly bills use a ÷12 virtual pot model.** Each month, one-twelfth of the annual bill amount accumulates in a virtual pot. Bills deduct from that pot when they fall due. Cashflow shortfalls are detected by comparing the pot balance to upcoming bills.

16. **Snapshots are read-only.** When viewing a historical snapshot, all editing is disabled. The current plan is always editable; historical states never are.

17. **Full-screen focused surfaces are exempt from the two-panel layout rule.** This class includes wizards (e.g. Review Wizard) and full-screen workbench surfaces (e.g. the Full Waterfall at `/waterfall` — a dense multi-tier bulk-entry surface). Every other page uses the two-panel layout. New surfaces may join this class only when (a) a two-panel shell would materially hurt the task — e.g. dense bulk entry across multiple related tables — and (b) the surface reinforces the waterfall mental model or another core anchor.
