---
feature: waterfall-creation-wizard
status: superseded
superseded_by: overview/overview-waterfall
superseded_date: 2026-07-05
priority: high
deferred: false
phase: 13
implemented_date:
---

> **Superseded** (2026-07-05): The step-by-step creation wizard has been removed and replaced by the **Full Waterfall** — a single dense, full-screen bulk-entry surface at `/waterfall` where users build every tier in one place rather than a guided 7-step flow. See `docs/5. built/overview/overview-waterfall/` for the shipped surface (and Anchor 17 for its full-screen exemption). Original spec retained below for historical context.

# Waterfall Creation Wizard

## Intention

New users face an empty, unfamiliar interface. The creation wizard guides them through building their waterfall step by step, in the correct order, so that their first experience is productive rather than intimidating.

## Description

A 7-step full-screen wizard guiding new users through: household setup, income, monthly bills, yearly bills, discretionary spending, savings allocations, and a summary. The user can exit and resume at any point. Completing the wizard optionally creates an opening snapshot.

## User Stories

- As a new user, I want a step-by-step setup flow so that I can build my waterfall without guessing the right order or format.
- As a user, I want to exit and resume the wizard later so that I am not forced to complete setup in one session.
- As a user, I want an optional opening snapshot at the end of setup so that I have a baseline to compare future snapshots against.

## Acceptance Criteria

- [ ] Full-screen mode (exempt from two-panel rule)
- [ ] 7 steps in order: Household, Income, Monthly Bills, Yearly Bills, Discretionary, Savings, Summary
- [ ] User can exit at any step and resume later with progress preserved
- [ ] Step 7 (Summary) shows all entered data for review before finalising
- [ ] Optional opening snapshot with editable name, pre-populated as "Initial setup — [Month Year]"
- [ ] Completing the wizard navigates to the Overview with the waterfall populated

## Open Questions

- [x] What triggers the wizard? Two entry points: (1) Overview empty state CTA "Set up your waterfall from scratch ▸" when waterfall has no income sources and no committed bills; (2) Settings → Waterfall → "Rebuild from scratch" (after confirm dialog that also calls DELETE /api/waterfall/all).
- [x] Can steps be navigated out of order? **Back navigation only** — user can go back to previous steps via a Back button; forward navigation only via Next button.
- [x] Is the Household step only shown to the first user, or to every new household member? **Shown to any user opening the wizard** — it shows the current household name (editable) and members list for context.

---

## Implementation

### Schema

```prisma
model WaterfallSetupSession {
  id          String    @id @default(cuid())
  householdId String    @unique
  currentStep Int       @default(0)
  // data is intentionally not stored — all entries are saved directly to their
  // respective tables (IncomeSource, CommittedBill, etc.) in real time.
  // Only currentStep is tracked here.
  startedAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}
```

### API

```
GET    /api/setup-session   → current session or null
POST   /api/setup-session   → create/reset
PATCH  /api/setup-session   → update { currentStep }
DELETE /api/setup-session   → clear
```

### Components

- `WaterfallSetupWizard.tsx` — full-screen overlay; `const STEPS = ['Household', 'Income', 'Bills', 'Yearly', 'Discretionary', 'Savings', 'Summary']`; `[✕ Exit]` closes without deleting session

### Notes

**Step content:**

| Step              | Content                                                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 — Household     | Household name (editable inline); current members list; link to invite flow in Settings                                                                                         |
| 1 — Income        | Inline "Add income source" form; list of added sources; edit/delete within step                                                                                                 |
| 2 — Monthly Bills | Same pattern — inline add form + list                                                                                                                                           |
| 3 — Yearly Bills  | Add form includes `dueMonth` select (Jan–Dec); list shows bill + due month                                                                                                      |
| 4 — Discretionary | Add spending categories with monthly budget; list + edit/delete                                                                                                                 |
| 5 — Savings       | Add savings allocations (name, monthly amount); optional "Link to Wealth account" dropdown (savings WealthAccounts); if none: "Add a savings account first on the Wealth page." |
| 6 — Summary       | Full read-only waterfall + calculated surplus; "Save opening snapshot?" checkbox (default checked); name pre-populated "Initial setup — {Month Year}" (editable); `[ Finish ]`  |

**Session lifecycle:**

- On open: `GET /api/setup-session`
  - If session exists → resume from `currentStep`
  - If not → `POST /api/setup-session`
- "Rebuild from scratch" entry: `DELETE /api/waterfall/all` first, then `POST /api/setup-session`
- On `[✕ Exit]` → close without deleting session; data entered is already persisted to real DB
- On Next/Back: `PATCH /api/setup-session { currentStep: newStep }`
- "Finish" (Step 6): if snapshot checkbox checked → `POST /api/snapshots { name }` → `DELETE /api/setup-session` → navigate to `/overview`

**All data is saved to the real DB immediately** — not buffered in the session. The session only tracks `currentStep`.
