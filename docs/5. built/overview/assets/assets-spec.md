---
feature: assets
design_doc: docs/4. planning/assets/assets-design.md
creation_date: 2026-03-30
status: implemented
implemented_date: 2026-07-05
---

# Assets

> **Purpose:** Captures _what_ the feature does and _why_ — user stories, acceptance criteria, and interface-level implementation constraints. This is the input to `/write-plan`. It is intentionally not a technical plan: no Prisma syntax, no route code, no component file paths.

## Intention

Users need a complete view of everything they own — property, vehicles, and financial accounts — with up-to-date point-in-time balances. This is the primary data source for financial forecasting: net worth and retirement projections cannot be computed without account balances, growth rates, and member assignments.

## Description

A dedicated **Assets** page in the main nav, following the established two-panel layout. The left panel lists seven fixed subcategories in two structural groups — Assets (Property, Vehicle, Other) and Accounts (Savings, Pension, Stocks & Shares, Other) — with per-type totals and a grand total footer. The right panel shows the items within the selected type. Each item stores a history of point-in-time balance entries; the most recent entry is the current balance. Staleness is flagged when no balance has been recorded within the configured threshold.

## User Stories

- As a user, I want to see all my assets and accounts in one place so that I have a complete picture of what I own.
- As a user, I want to record a balance whenever I check an account or asset so that the app reflects my current position.
- As a user, I want to see the history of my recorded balances so that I can track how values have changed over time.
- As a user, I want to assign each asset or account to a household member or the whole household so that joint and individual ownership is clear.
- As a user, I want to set an optional growth rate on each account so that I can customise projections without forcing every account to use a default.
- As a household owner, I want to set default growth rates in Settings so that I do not have to specify a rate on every account.
- As a user, I want stale items flagged so that I know which balances need updating.

## Acceptance Criteria

### Page structure

- [ ] Assets page is accessible from the main navigation
- [ ] Page uses the two-panel layout: left panel (360px fixed, bordered right) shows subcategory list; right panel fills remaining width and shows items for the selected type
- [ ] Left panel shows two group labels — "Assets" and "Accounts" — in muted uppercase style
- [ ] Left panel lists 7 fixed subcategories: Property, Vehicle, Other (Assets group); Savings, Pension, Stocks & Shares, Other (Accounts group)
- [ ] Each subcategory row shows: type name (left) and type total in JetBrains Mono (right)
- [ ] All 7 subcategories are always visible in the left panel regardless of whether they contain items; an empty type shows £0
- [ ] Selected subcategory row has a left violet border accent, highlighted name, and violet value
- [ ] Left panel footer shows "Total" label and grand total (all Assets + Accounts combined) in JetBrains Mono
- [ ] Page header (within left panel) shows "Assets" title and grand total in violet

### Right panel — item list

- [ ] Right panel header shows: type name, item count, type total, and "+ Add" button
- [ ] Items are shown as accordion rows; collapsed state shows: name (left), member assignment below name (left), current balance (right), balance date below balance (right)
- [ ] Clicking a row expands the accordion; only one row can be expanded at a time
- [ ] Expanded state shows: same collapsed header + "Balance History" section below + "Record Balance" and "Edit" action buttons
- [ ] Balance history entries are shown in reverse-chronological order (most recent first) with value and date per entry
- [ ] If no balance entries exist for an item, the history section shows "No balances recorded yet"
- [ ] If no items exist for the selected type, the right panel shows an empty state message with a "+ Add [Type]" CTA
- [ ] While data is loading, the right panel shows a skeleton/loading state
- [ ] On API error, the right panel shows an inline error state with a retry action
- [ ] Member display: shows the member's first name when assigned to a specific member; shows "Household" when unassigned
- [ ] Balance date display: shows the date of the most recent balance entry; shows "Never recorded" if no entries exist
- [ ] Current balance: the value from the most recent balance entry; £0 if no entries exist

### Recording and editing

- [ ] "+ Add" in the right panel header opens a form to create a new item in the currently selected type
- [ ] "Record Balance" in the expanded accordion opens a form collecting: value (required), date (defaults to today; any past or present date permitted), optional note
- [ ] On submission, the new balance entry is saved and lastReviewedAt is updated on the parent item
- [ ] "Edit" in the expanded accordion opens a form to update item metadata: name, member assignment; accounts additionally expose an optional growth rate override
- [ ] Deleting an item requires confirmation and removes all associated balance history

### Growth rates (Accounts only)

- [ ] Each Account has an optional growth rate override (percentage)
- [ ] When the growth rate override is null, the account falls back to the applicable HouseholdSettings default: currentRatePct (Current), savingsRatePct (Savings), pensionRatePct (Pension), investmentRatePct (Stocks & Shares), null (Other)
- [ ] The Edit form for an account shows the growth rate field with placeholder or helper text indicating the effective household default when the override is empty
- [ ] Asset types (Property, Vehicle, Other) do not expose a growth rate field anywhere

### HouseholdSettings — growth rate defaults

- [ ] Settings page (owner/admin only) exposes five fields under a "Growth Rates" section: Default current account rate (%), Default savings rate (%), Default investment rate (%), Default pension rate (%), Inflation rate (%)
- [ ] Inflation rate defaults to 2.5%; current, savings, investment, and pension rates default to null (blank until set)
- [ ] All four fields accept positive decimal percentages; negative values and values above 100 are rejected
- [ ] All inputs are validated via Zod schemas in packages/shared before reaching the database

### HouseholdMember — retirement fields

- [ ] Each household member record supports an optional date of birth and optional target retirement year
- [ ] These fields are editable from the Household Members section in Settings (any member may edit their own; owner/admin may edit any member's)
- [ ] Date of birth and retirement year are not displayed on the Assets page itself — they are consumed by the Forecast page

### Staleness

- [ ] Each Asset and Account item has a lastReviewedAt timestamp; it is updated when a balance is recorded or the item is confirmed
- [ ] Stale items show the StalenessIndicator (amber dot + age label) per the staleness-indicators spec
- [ ] HouseholdSettings.stalenessThresholds gains two new keys: `asset_item` (default 12 months) and `account_item` (default 3 months)
- [ ] Each subcategory row in the left panel shows an amber dot + stale item count (e.g. "● 2 stale") when any item in that type is stale; nothing is shown when all items in the type are current

### Legacy removal

- [ ] All legacy asset models, API routes, and frontend code are removed as part of this feature's migration

## Open Questions

_None._

---

## Implementation

> Interface-level constraints for the implementor. Describes _what_ is needed — entities, operations, UI units — without specifying _how_ to build them. `/write-plan` makes the technical decisions (Prisma syntax, route shapes, file paths, component code).

### Schema

- **Asset**: name, type (enum: Property | Vehicle | Other), householdId, memberUserId (nullable String — references a HouseholdMember userId; null means "Household"/joint), lastReviewedAt, timestamps. Household-scoped; memberUserId must be a member of the same household when set.
- **AssetBalance**: assetId, value (positive Float), date (the date the value was observed — not a timestamp), note (nullable String). Many per Asset. Ordered by date descending for display. No deletion permitted — incorrect entries are corrected by recording a new entry.
- **Account**: name, type (enum: Savings | Pension | StocksAndShares | Other), householdId, memberUserId (nullable String — same semantics as Asset.memberUserId), growthRatePct (nullable Float — overrides HouseholdSettings class default when set), lastReviewedAt, timestamps. Household-scoped.
- **AccountBalance**: accountId, value (positive Float), date, note (nullable String). Same rules as AssetBalance.
- **HouseholdSettings additions**: currentRatePct (nullable Float), savingsRatePct (nullable Float), investmentRatePct (nullable Float), pensionRatePct (nullable Float), inflationRatePct (Float, default 2.5). All stored as percentage values (e.g. 4.5 = 4.5%).
- **HouseholdMember additions**: dateOfBirth (nullable Date), retirementYear (nullable Int).
- **HouseholdSettings.stalenessThresholds** default JSON gains `asset_item: 12` and `account_item: 3`.

### API

- Get assets page summary (totals per type, Assets group total, Accounts group total, grand total) — JWT-protected, household-scoped
- List assets by type — JWT-protected, household-scoped; returns items with most-recent balance entry included
- Create asset (name, type, memberUserId?) — JWT-protected, household-scoped; memberUserId must be a member of the household if provided
- Update asset (name, memberUserId?) — JWT-protected, household-scoped
- Delete asset — JWT-protected, household-scoped; cascades to all AssetBalance entries
- Record asset balance (assetId, value, date, note?) — JWT-protected, household-scoped; appends AssetBalance; sets asset.lastReviewedAt = now()
- List accounts by type — JWT-protected, household-scoped; returns items with most-recent balance entry included
- Create account (name, type, memberUserId?, growthRatePct?) — JWT-protected, household-scoped
- Update account (name, memberUserId?, growthRatePct?) — JWT-protected, household-scoped
- Delete account — JWT-protected, household-scoped; cascades to all AccountBalance entries
- Record account balance (accountId, value, date, note?) — JWT-protected, household-scoped; appends AccountBalance; sets account.lastReviewedAt = now()
- Confirm asset (assetId) — JWT-protected, household-scoped; sets lastReviewedAt = now() without adding a balance entry
- Confirm account (accountId) — JWT-protected, household-scoped; same as above
- Update HouseholdSettings growth rate defaults (currentRatePct, savingsRatePct, investmentRatePct, pensionRatePct, inflationRatePct) — JWT-protected, owner/admin role required
- Update HouseholdMember retirement fields (dateOfBirth, retirementYear) — JWT-protected; a member may update their own fields; owner/admin may update any member's fields

### Components

- **AssetsPage** — page shell; renders TwoPanelLayout with AssetsLeftPanel (left) and the active-type item area (right); owns selected-type state
- **AssetsLeftPanel** — two group sections (Assets / Accounts) with muted uppercase headings; seven subcategory rows showing type name and type total; selected-row styling (left violet border, highlighted text); amber stale-count badge per row when stale items exist; grand total footer
- **AssetItemArea** — right panel content for a selected Asset type (Property, Vehicle, Other); header with type name, item count, type total, "+ Add" button; renders list of AssetAccountRow components or empty state
- **AccountItemArea** — right panel content for a selected Account type; same structure as AssetItemArea; passes account-specific props (growth rate display) to rows
- **AssetAccountRow** — accordion row shared by both assets and accounts; collapsed: name + member label (left), balance + date label (right), StalenessIndicator when stale; expanded: same header + balance history list + "Record Balance" + "Edit" buttons
- **RecordBalanceForm** — collects value (required), date (default today, any past or present date), optional note; used for both assets and accounts; validates date is not in the future
- **AddEditAssetModal** — create/edit form for an Asset; fields: name, member assignment (dropdown of household members + "Household" option); type is locked to the current subcategory for new items
- **AddEditAccountModal** — create/edit form for an Account; fields: name, member assignment, optional growth rate override (shows effective household default as placeholder/helper text when empty); type is locked for new items

### Notes

- **Current balance resolution:** The current balance for display is the AssetBalance / AccountBalance entry with the largest date value. If two entries share the same date, use the one with the most recent createdAt. If no entries exist, display £0 and "Never recorded".
- **Balance entries are append-only:** No delete or edit operation is exposed for individual balance history entries. Users correct errors by recording a new entry with a corrected value and the same (or a later) date.
- **Growth rate resolution for Accounts:** resolved rate = account.growthRatePct if set; else HouseholdSettings.currentRatePct (Current), HouseholdSettings.savingsRatePct (Savings), HouseholdSettings.pensionRatePct (Pension), HouseholdSettings.investmentRatePct (Stocks & Shares), null (Other). The resolved rate is not computed on the Assets page — it is consumed by the Forecast page.
- **memberUserId semantics:** null = "Household" (joint/shared); any non-null value must resolve to a userId that is a current member of the same household. Display as the member's first name, or "Household" when null.
- **Staleness thresholds migration:** The default value for HouseholdSettings.stalenessThresholds must be updated in the migration to include `asset_item: 12` and `account_item: 3`. Existing rows must also be backfilled.
- **HouseholdMember composite key:** HouseholdMember uses a composite primary key [householdId, userId]; the new dateOfBirth and retirementYear fields are nullable additions to this model.
- **Legacy removal scope:** WealthAccount, WealthAccountHistory, all associated API routes (GET/POST/PATCH/DELETE /api/wealth/…), and all frontend Wealth page components are removed. Any SavingsAllocation.wealthAccountId foreign key reference must be resolved (set to null or removed) before removal.
- **Security — memberId validation:** All create and update operations that accept a memberUserId must validate server-side that the provided userId is a current member of the requesting user's household. This prevents referencing members from other households.
- **Security — cross-household isolation:** All asset and account queries must include a `householdId` filter matching the authenticated user's household. Balance recording operations must verify the target asset/account belongs to the user's household before appending.
- **HouseholdSettings growth rate changes** are owner/admin-only; member-role users must not be able to call the update growth rates endpoint.
- **Audit log:** All mutating operations (create/update/delete asset or account, record balance, update HouseholdSettings growth rates, update HouseholdMember retirement fields) must use the `audited()` wrapper so changes appear in the household audit log.
