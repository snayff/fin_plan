---
feature: settings
status: implemented
priority: medium
deferred: false
phase: 12
implemented_date: 2026-07-05
---

# Settings

## Intention

Users need to configure household-specific parameters that affect calculations, thresholds, and display across the entire app. Settings centralise configuration that doesn't belong in the waterfall or wealth views.

## Description

A settings page covering: income source management, staleness thresholds, surplus benchmark, ISA tax year, household member management, snapshot management, trust account names, and access to the waterfall rebuild wizard.

## User Stories

- As a user, I want to configure staleness thresholds so that indicators appear at the right frequency for my lifestyle.
- As a user, I want to manage my income sources so that I can add, edit, or archive them as my situation changes.
- As a user, I want to manage household members and invites so that the right people have access to our shared plan.
- As a user, I want to rename and delete snapshots so that my history is clearly labelled and tidy.
- As a user, I want to configure trust account beneficiary names so that held-on-behalf accounts are correctly labelled.

## Acceptance Criteria

- [ ] Income sources: add, edit, archive
- [ ] Staleness thresholds: configurable (per-tier or global — see open questions)
- [ ] Surplus benchmark: configurable threshold that triggers the surplus benchmark indicator (amber `attention` token)
- [ ] ISA tax year: configurable April start date
- [ ] Household management: member list, roles, invite generation, member removal
- [ ] Snapshot management: view all snapshots, rename, delete
- [ ] Trust accounts: add and manage "held on behalf of" beneficiary names
- [ ] Waterfall rebuild wizard: trigger accessible from settings

## Open Questions

- [x] Are staleness thresholds set per-tier (income vs bills vs discretionary) or as a single global value? **Per item type** — separate thresholds for: income_source, committed_bill, yearly_bill, discretionary_category, savings_allocation, wealth_account. Stored as a JSON object in HouseholdSettings.
- [x] Is the surplus benchmark the same as the 10% threshold on the overview, or a separate configurable value? **The same value** — `HouseholdSettings.surplusBenchmarkPct` (default 10%) controls the surplus benchmark indicator on the Overview page.
- [x] Can income sources be deleted, or only archived? **Archived (ended)** via `POST /api/waterfall/income/:id/end`. Permanent delete is only offered for sources with no history. Ended sources appear in Settings → Income sources (ended list) and can be reactivated.

---

## Implementation

### Schema

```prisma
model HouseholdSettings {
  id                  String    @id @default(cuid())
  householdId         String    @unique
  surplusBenchmarkPct Float     @default(10)
  isaAnnualLimit      Float     @default(20000)
  isaYearStartMonth   Int       @default(4)   // UK: April
  isaYearStartDay     Int       @default(6)   // UK: 6th
  stalenessThresholds Json      @default("{\"income_source\":12,\"committed_bill\":6,\"yearly_bill\":12,\"discretionary_category\":12,\"savings_allocation\":12,\"wealth_account\":3}")
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt
}
```

### API

```
GET   /api/settings   → get HouseholdSettings (auto-create with defaults if missing)
PATCH /api/settings   → update { surplusBenchmarkPct?, isaAnnualLimit?, isaYearStartMonth?, isaYearStartDay?, stalenessThresholds? }
```

Profile updates reuse the existing auth endpoint: `PATCH /api/auth/me { name }`.

### Components

- `SettingsPage.tsx` — left nav with sections (Profile, Staleness, Surplus, ISA, Household, Snapshots, Trust accounts, Waterfall)

**Settings panels:**

| Section              | Fields                                                                                    | Endpoint                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Profile              | Name                                                                                      | `PATCH /api/auth/me { name }`                                                |
| Staleness thresholds | One `<input type="number">` per item type (months)                                        | `PATCH /api/settings { stalenessThresholds }`                                |
| Surplus benchmark    | Percentage (default 10%)                                                                  | `PATCH /api/settings { surplusBenchmarkPct }`                                |
| ISA settings         | Annual limit, tax year start month (1–12), tax year start day (1–31)                      | `PATCH /api/settings { isaAnnualLimit, isaYearStartMonth, isaYearStartDay }` |
| Household            | Members list, invite by email (QR + URL), remove member, rename household                 | Existing household API                                                       |
| Snapshots            | List all; rename inline; delete with confirm dialog                                       | `GET/PATCH/DELETE /api/snapshots`                                            |
| Trust accounts       | List `isTrust: true` WealthAccounts by beneficiary name; add/rename via WealthAccount API | Wealth API                                                                   |
| Waterfall → Rebuild  | Confirm dialog → `DELETE /api/waterfall/all` → redirect to `/overview`                    | Waterfall API                                                                |

### Notes

- `HouseholdSettings` record is auto-created with defaults when a new household is created (in `household.service.ts` post-create hook)
- ISA settings label: "UK default: 6 April. Only change if you are in a different jurisdiction."
- Staleness threshold labels: "Income sources", "Monthly bills", "Yearly bills", "Discretionary categories", "Savings allocations", "Wealth accounts"


