---
feature: wealth-trust-savings
status: implemented
priority: medium
deferred: false
phase: 8
implemented_date: 2026-07-05
---

# Wealth — Trust Savings (Held on Behalf Of)

## Intention

Some household members hold savings on behalf of others (e.g. a parent managing a child's savings account). These funds need to be tracked and visible without inflating the household's own net worth.

## Description

A dedicated "Held on behalf of" section in the Wealth page for accounts where the household is custodian but not the beneficial owner. Full account tracking features are available, but these accounts are excluded from the household net worth total and clearly labelled with the beneficiary's name.

## User Stories

- As a user, I want to record savings I hold on behalf of someone else so that I can track them alongside my own accounts without mixing them up.
- As a user, I want trust savings excluded from my net worth so that my personal financial picture stays accurate.
- As a user, I want to see the beneficiary's name on trust accounts so that each account is clearly identified.

## Acceptance Criteria

- [ ] Trust accounts are shown in a separate "Held on behalf of" section in the Wealth left panel
- [ ] Trust accounts are excluded from the household net worth total
- [ ] Each trust account displays the beneficiary name as a label
- [ ] Trust accounts have the same features as regular accounts (balance, history graph, projected balance, valuation date)
- [ ] Beneficiary names are configurable in Settings (under Trust accounts)

## Open Questions

- [x] Can a trust account be linked to a waterfall savings allocation? **Yes** — `SavingsAllocation.wealthAccountId` can reference a trust account.
- [x] Can a trust account have an ISA flag and be tracked against an ISA allowance (e.g. JISA)? **Not explicitly specified** — trust accounts support the same fields as regular accounts including `isISA`, but JISA-specific allowance tracking is not implemented.
- [x] Is there a limit on how many trust beneficiaries can be configured? **No defined limit.**

---

## Implementation

### Schema

```prisma
// Fields on WealthAccount that make it a trust account
model WealthAccount {
  isTrust              Boolean  @default(false)
  trustBeneficiaryName String?  // displayed as the section name in left panel
  ...
}
```

### API

No dedicated trust endpoints — trust accounts are managed via the standard wealth accounts API. Filter by `isTrust: true` for display purposes.

```
POST  /api/wealth/accounts          → create with { isTrust: true, trustBeneficiaryName: "LR" }
PATCH /api/wealth/accounts/:id      → update trustBeneficiaryName or other fields
```

Settings → Trust accounts provides a convenience management view — it lists all `isTrust: true` accounts grouped by `trustBeneficiaryName` and allows renaming.

### Components

- Trust section in `WealthLeftPanel.tsx` — rendered below asset class list when trust accounts exist; labelled "Held on behalf of"; grouped by `trustBeneficiaryName`; excluded from net worth total
- Clicking a beneficiary name uses the same `AccountListPanel.tsx` / `AccountDetailPanel.tsx` as regular classes

### Notes

- Trust accounts support all the same features as regular accounts: balance history, staleness, projections, savings allocation links
- The only distinction is visual grouping + net worth exclusion
- `trustBeneficiaryName` is the display name used in the left panel section and on each account card
