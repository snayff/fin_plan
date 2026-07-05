---
feature: definition-tooltip
status: implemented
priority: medium
deferred: false
phase: 7
implemented_date: 2026-07-05
---

# Definition Tooltip

## Intention

Financial terms in FinPlan have specific meanings that may differ from everyday usage. Rather than a standalone glossary, every term is explained in-place via a hover tooltip at each location it appears — keeping context without requiring navigation.

## Description

A `<DefinitionTooltip>` component wraps any term with a shadcn Tooltip. The trigger uses a dotted underline to signal interactivity. Definitions are centralised in a single `DEFINITIONS` dictionary; the component accepts a `term` key and renders the matching definition. Placement is prescribed per component — not ad-hoc.

## User Stories

- As a user unfamiliar with financial terminology, I want to hover a term and see its definition so that I understand what I'm looking at without leaving the page.
- As a user who already knows the terms, I want the tooltip to be unobtrusive (triggered on hover only) so that it doesn't interrupt my workflow.

## Acceptance Criteria

- [ ] `<DefinitionTooltip term="..." >children</DefinitionTooltip>` wraps any text node
- [ ] Trigger renders with `border-b border-dotted cursor-help` styling
- [ ] Tooltip content is the definition string from the `DEFINITIONS` dictionary
- [ ] All 18 defined terms are present in the dictionary
- [ ] Tooltip is placed at every prescribed location (see Implementation → Notes)
- [ ] No other in-app glossary or definition mechanism exists

## Open Questions

- None

---

## Implementation

### Schema

None — client-side only.

### API

None — client-side only.

### Components

- `apps/frontend/src/components/common/DefinitionTooltip.tsx` — wraps children in a shadcn `<Tooltip>`; `term` prop keys into the `DEFINITIONS` dictionary

```tsx
interface Props {
  term: keyof typeof DEFINITIONS;
  children: React.ReactNode;
}

export function DefinitionTooltip({ term, children }: Props) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="border-b border-dotted border-current cursor-help">{children}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{DEFINITIONS[term]}</TooltipContent>
    </Tooltip>
  );
}
```

### Notes

**Definitions dictionary** (18 terms):

```typescript
const DEFINITIONS = {
  Waterfall:
    "The way FinPlan structures your finances — income at the top, committed spend deducted first, then discretionary spend, leaving your surplus at the bottom.",
  "Committed Spend":
    "Money you've contracted or obligated yourself to pay — outgoings you can't immediately choose to stop.",
  "Discretionary Spend":
    "Spending you choose to make each month and could choose to reduce or stop.",
  Surplus: "What's left after your committed and discretionary spend is deducted from your income.",
  "Net Income":
    "Your take-home pay after tax, National Insurance, and any other deductions — what actually arrives in your account.",
  "One-Off Income": "A single, non-recurring payment — for example, a bonus or an inheritance.",
  "Annual Income":
    "Income that recurs once a year. Shown in the waterfall divided by 12 so it contributes a fair monthly share.",
  "Amortised (÷12)": "An annual amount spread evenly across 12 months.",
  ISA: "Individual Savings Account — a UK savings or investment account where interest and gains are free from tax.",
  "ISA Allowance":
    "The maximum you can pay into ISAs in a single tax year — currently £20,000 per person.",
  "Tax Year": "The UK tax year runs from 6 April to 5 April the following year.",
  "Equity Value":
    "The portion of an asset you own outright — the market value minus any outstanding debt secured against it.",
  Liquidity: "How quickly and easily an asset can be converted to cash.",
  "Net Worth":
    "The total value of everything you own (your assets) minus everything you owe (your liabilities).",
  Snapshot: "A saved, read-only record of your waterfall at a specific point in time.",
  Staleness:
    "A signal that a value hasn't been reviewed or confirmed within the expected timeframe and may no longer be accurate.",
  "Held on Behalf Of": "Savings managed by your household but legally owned by someone else.",
  Projection:
    "An estimated future balance calculated from the current value plus the linked monthly contribution, compounded at the recorded interest rate.",
};
```

**Prescribed placements:**

| Component                              | Term(s)                                                                                                           |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `WaterfallLeftPanel`                   | "Committed Spend" on COMMITTED header; "Discretionary Spend" on DISCRETIONARY header; "Surplus" on SURPLUS header |
| `ItemDetailPanel`                      | "Net Income" label for income sources; "Amortised (÷12)" label for annual/yearly items                            |
| `AccountListPanel` (Savings)           | "ISA Allowance" bar label                                                                                         |
| `AccountDetailPanel`                   | "Equity Value" for property/vehicles/other; "Projection" label                                                    |
| `WealthLeftPanel`                      | "Net Worth" headline; "Liquidity" breakdown header                                                                |
| `SnapshotTimeline`                     | "Snapshot" label                                                                                                  |
| Any "Held on behalf of" section header | "Held on Behalf Of"                                                                                               |
| `StalenessIndicator`                   | "Staleness" tooltip trigger text                                                                                  |
