---
feature: data_export_import
design_doc: docs/4. planning/data_export_import/data_export_import-design.md
creation_date: 2026-04-06
status: implemented
implemented_date: 2026-07-05
---

# Data Export & Import

> **Purpose:** Captures _what_ the feature does and _why_ — user stories, acceptance criteria, and interface-level implementation constraints. This is the input to `/write-plan`. It is intentionally not a technical plan: no Prisma syntax, no route code, no component file paths.

## Intention

Users need to back up their household data, migrate between environments (e.g. dev → prod), and exercise data portability. This requires a JSON-based export/import system — but the current member model (tightly coupled to user accounts) makes import impossible without first decoupling members from accounts. This feature delivers three things: standalone member management, general-purpose household creation, and full household export/import.

## Description

Introduces a new Member entity that exists independently of user accounts, allowing members to be created, edited, and deleted without requiring an invitation or login. The HouseholdSwitcher is reworked into an always-interactive dropdown with a "Create new household" option. A new Data section in Settings lets the household owner export all household data as a versioned JSON file, or import a file to either overwrite the current household or create a new one.

## User Stories

- As a household owner, I want to create members by name so that I can set up the full household plan before anyone else has an account.
- As a household owner, I want to edit a member's name, date of birth, and retirement year so that I can keep member details accurate.
- As a household owner, I want to delete an uninvited member and reassign their items so that I can clean up the household without losing data.
- As a household owner, I want to invite a user against an existing member so that they can log in and see items already assigned to them.
- As a user, I want to create a new household from the household switcher so that I can manage multiple households.
- As a user, I want to switch between households from the household switcher so that I can view different plans.
- As a household owner, I want to export my household data as a JSON file so that I have a backup I can store externally.
- As a household owner, I want to import a JSON file and choose whether to overwrite my current household or create a new one so that I can restore from backup or migrate data.
- As a household owner importing data, I want clear error messages when the file is invalid so that I know what went wrong and can fix it.

## Acceptance Criteria

### Member management

- [ ] Owner can create a member with a name (required), date of birth (optional), and retirement year (optional)
- [ ] Owner can edit any member's name, date of birth, and retirement year
- [ ] Owner can delete any uninvited member (no linked user account)
- [ ] Deleting a member with assigned items shows a reassignment prompt listing other members as destinations
- [ ] On reassignment confirmation, all items (income, committed, discretionary, assets, accounts) are reassigned to the chosen member before deletion
- [ ] Members with linked user accounts cannot be deleted — only removed via the existing "remove member" flow
- [ ] Inviting a user targets an existing uninvited member, linking the user account to that member record
- [ ] All waterfall items, assets, and accounts reference the Member entity (not the user account directly)
- [ ] Member CRUD is restricted to household owners

### Household creation

- [ ] HouseholdSwitcher is always an interactive dropdown, even with a single household
- [ ] Dropdown lists all households the user belongs to, with the active one indicated
- [ ] Dropdown includes a "Create new household" option
- [ ] Creating a household requires only a name
- [ ] On creation, the user becomes the owner, a member is created for them, and they are switched to the new household
- [ ] New households start empty with default settings

### Data export

- [ ] "Export" button appears in a "Data" section in Settings, visible only to the household owner
- [ ] Export generates a JSON file containing: schema version, household metadata (name, settings), members (name, date of birth, retirement year — no account data), subcategories, income sources, committed items, discretionary items, item amount periods, waterfall history, assets with balances, accounts with balances, purchase items, planner year budgets, gift persons with events and year records
- [ ] Export excludes: snapshots, audit logs, invitation records, user account details, wizard sessions
- [ ] File is named `finplan-export-<household-name>-<date>.json`
- [ ] Export triggers a browser download — no intermediate server storage
- [ ] The JSON file includes a top-level `schemaVersion` field set to `1`

### Data import

- [ ] "Import" button appears in the Data section in Settings, visible only to the household owner
- [ ] User selects a JSON file via file picker
- [ ] Backend validates the entire file against the expected schema before any write
- [ ] If validation fails, a clear error message describes the problem (e.g. "Missing required field 'name' in income source at index 3")
- [ ] If the file's `schemaVersion` is higher than the app supports, import is rejected with "This file was exported from a newer version of finplan"
- [ ] After validation, user chooses: "Overwrite current household" or "Create a new household"
- [ ] Overwrite shows a confirmation dialog warning that all existing data will be replaced
- [ ] Overwrite replaces all household data in a single transaction; the owner's account link and member record are preserved
- [ ] Create new uses the household creation flow; household name comes from the file; the importing user becomes the owner
- [ ] All imported members arrive as uninvited (no user account link), regardless of their state in the source
- [ ] Import preserves member-to-item assignments: imported items reference the correct imported member
- [ ] The entire import is transactional — if anything fails, nothing is written
- [ ] On success, a toast confirms the import and the user is viewing the imported household

## Open Questions

_(None — all questions resolved during design and spec refinement.)_

---

## Implementation

> Interface-level constraints for the implementor. Describes _what_ is needed — entities, operations, UI units — without specifying _how_ to build them. `/write-plan` makes the technical decisions (Prisma syntax, route shapes, file paths, component code).

### Schema

- **Member**: A first-class household entity. Key fields: id, householdId, name, dateOfBirth (optional), retirementYear (optional), userId (optional — null for uninvited members), role (owner/admin/member), joinedAt. Unique constraint on (householdId, userId) where userId is not null, to prevent duplicate account links. Replaces the current composite-PK HouseholdMember join table.

- **HouseholdMember (retired)**: The existing `(householdId, userId)` join table is replaced by the Member entity. Migration must preserve all existing data — every current HouseholdMember becomes a Member with its userId populated.

- **ownerId references updated**: All entities that currently reference a user via `ownerId` or `memberUserId` (IncomeSource, CommittedItem, Asset, Account) must reference the Member entity's id instead.

- **Household**: No schema change — already has name, timestamps, and relationships.

- **HouseholdSettings**: No schema change — included in export as-is.

- **All waterfall entities** (IncomeSource, CommittedItem, DiscretionaryItem, Subcategory, ItemAmountPeriod, WaterfallHistory): No schema changes beyond the ownerId reference update. All included in export.

- **Asset, AssetBalance, Account, AccountBalance**: No schema changes beyond the memberUserId reference update. All included in export.

- **PurchaseItem, PlannerYearBudget**: No schema changes. Included in export.

- **GiftPerson, GiftEvent, GiftYearRecord**: No schema changes. Included in export.

- **Excluded from export schema**: Snapshot, AuditLog, HouseholdInvite, RefreshToken, Device, ReviewSession, WaterfallSetupSession.

### API

**Member operations:**

- Create a member (name, optional dateOfBirth, optional retirementYear) — JWT-protected, household-scoped, owner-only
- Update a member (name, dateOfBirth, retirementYear) — JWT-protected, household-scoped, owner-only
- Delete a member (with reassignment target for items) — JWT-protected, household-scoped, owner-only, must be uninvited
- List members for a household — JWT-protected, household-scoped
- Invite a user against an existing uninvited member — JWT-protected, household-scoped, owner-only

**Household operations:**

- Create a household (name) — JWT-protected. Creates the household, a Member record for the creating user (role: owner), and switches the user's active household.
- List households for the current user — already exists
- Switch active household — already exists

**Export operation:**

- Export household data — JWT-protected, household-scoped, owner-only. Returns a JSON response containing the full household export. The frontend converts this to a file download.

**Import operations:**

- Validate an import file — JWT-protected. Accepts the JSON payload, validates against the schema, and returns success/failure with error details. Does not write anything.
- Execute import (overwrite mode) — JWT-protected, household-scoped, owner-only. Validates, then replaces all data in the current household within a transaction. Preserves the owner's Member record and account link.
- Execute import (create-new mode) — JWT-protected, owner-only. Validates, creates a new household, populates it with the import data, and switches the user to it. All within a transaction.

### Components

- **MemberManagementSection** — lives within the existing Household section in Settings. Renders the list of members with create, edit, and delete actions. Shows member name, linked account status, and role. Delete triggers the reassignment prompt for members with assigned items. When only the owner exists, shows the owner row plus a "Create member" button — no special empty state needed.

- **MemberReassignmentPrompt** — dialog shown when deleting a member with assigned items. Same pattern as the existing subcategory ReassignmentPrompt: lists other members as reassignment destinations, requires selection before confirming deletion.

- **HouseholdSwitcher (reworked)** — always renders as an interactive dropdown. Shows all households with the active one checked. Includes a "Create new household" action at the bottom, separated by a divider.

- **CreateHouseholdDialog** — simple dialog with a name input and confirm/cancel. Triggered from the HouseholdSwitcher.

- **DataSection** — new section in the Settings page. Contains Export and Import rows, each with a description and action button. Only visible to the household owner.

- **ImportDestinationDialog** — dialog shown after file selection and successful validation. Presents two options: "Overwrite current household" (with current household name) and "Create a new household". Overwrite selection triggers a secondary confirmation.

- **ImportOverwriteConfirmDialog** — destructive action confirmation. Warns that all existing data will be replaced. Uses the existing ConfirmDialog pattern.

### Notes

- **Migration**: The HouseholdMember → Member migration is the most critical part. Every existing HouseholdMember row becomes a Member with its userId set. All `ownerId` and `memberUserId` foreign key references across the schema must be updated to point to the new Member id. This must be a single, tested migration.

- **Export of empty households**: Exporting a household with no items is valid — the file contains empty arrays. No special handling or warning needed.

- **Export file size**: A household without snapshots should produce a modest JSON file (likely under 1MB). No streaming or chunking is needed.

- **Import validation**: Validation should produce specific, actionable errors — not just "invalid JSON". The error should identify the section and index where validation failed (e.g. "committed items[3]: missing required field 'name'").

- **Overwrite import — owner preservation**: When overwriting, the owner's Member record is preserved (not deleted and recreated). Imported members are created alongside the preserved owner. If the export file contains a member that matches the owner by name, the owner's existing record is used rather than creating a duplicate.

- **Member assignment on import**: The import maps members from the export to newly created Member records by name. Item references (ownerId, memberUserId) are rewritten to point to the new Member ids.

- **Schema version migration**: Version 1 is the only version. The infrastructure should support a migration function pattern (e.g. `migrators[fileVersion]`) so that future versions can transform older exports. For now, the only check is: reject if `schemaVersion > 1`.

- **Invite flow change**: The existing invite flow currently creates a new HouseholdMember on acceptance. Post-migration, it must instead link the accepting user's account to an existing uninvited Member record. The invite should specify which Member it targets.

- **Security — file upload size**: Import should enforce a reasonable file size limit (e.g. 5MB) to prevent abuse. This is a backend concern, not a frontend validation.

- **Security — no account data in exports**: Exports must never include email addresses, password hashes, tokens, or any authentication data. Member records export name, dateOfBirth, and retirementYear only.

- **Security — household isolation**: Import operations must verify the user is the owner of the target household (for overwrite) or create a completely isolated new household (for create-new). No cross-household data leakage is possible.

- **Security — input validation**: The import JSON must be validated against a Zod schema in `packages/shared` before any database writes. This is the same pattern used for all API inputs.

- **Rate limiting**: Export and import operations should have stricter rate limits than standard CRUD (e.g. 10 per hour) to prevent abuse.

- **UX — loading states**: Export should show a brief loading indicator on the button while generating. Import should show progress states: "Validating..." → destination choice → "Importing..." → success toast. Error states should use inline messages in the dialog, not toasts (so the user can see the error alongside the file they selected).

- **UX — empty household after create**: When a user creates a new household (via switcher or import create-new), they land on the overview page which should show the existing empty state / setup CTA.
