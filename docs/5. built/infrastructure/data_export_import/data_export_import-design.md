---
feature: data_export_import
status: approved
creation_date: 2026-04-06
status: implemented
implemented_date: 2026-07-05
---

# Data Export & Import — Design

> **Purpose:** Captures the approved product direction — the problem, the chosen approach, and the key decisions made during requirement refinement. This is the input to `/write-spec`. It is intentionally product-level: no Prisma syntax, no route shapes, no component trees.

## Problem

Users have no way to back up their household data, migrate between environments (e.g. dev → prod), or exercise data portability. There is also no way to create households beyond the initial setup, and members are tightly coupled to user accounts — making import of external data impossible without reworking the member model.

## Approved Approach

A minimal, JSON-based export/import system with three supporting changes: member management decoupled from user accounts, general-purpose household creation, and a reworked household switcher.

### Member management

Members become first-class household entities, independent of user accounts.

- **Create:** Owner adds a member by name from the Household section in Settings. The member exists immediately with no user account link.
- **Edit:** Owner can rename any member.
- **Delete:** Owner can delete any uninvited member (no linked user account). If the member has assigned items, a reassignment prompt appears (same pattern as subcategory deletion). Members with linked user accounts cannot be deleted — they use the existing "remove member" flow.
- **Invite rework:** The existing invite flow targets an existing uninvited member instead of creating a new one. The invitation links a user account to that member record.
- **Data model:** Member records gain an optional user account link (null for uninvited members). All item assignments reference the member record, not the user account.

### Household creation

- The `HouseholdSwitcher` is reworked into an always-interactive dropdown (even with one household). It shows all households plus a "Create new household" option.
- Creating a household requires only a name. The user becomes the owner and is switched to the new household automatically.
- New households start empty — no members beyond the owner, no items, default settings.

### Data export

- "Export" button in a new "Data" section in Settings, visible only to the household owner.
- Generates a single JSON file containing: schema version, household metadata (name, settings), members (names only — no account data), all waterfall tier data (income, committed, discretionary with subcategories), goals, assets, and liabilities.
- **Excluded:** Snapshots, audit log, invitation records, user account details.
- File naming: `finplan-export-<household-name>-<date>.json`.
- Backend generates the JSON; frontend triggers a browser download. No intermediate storage.

### Data import

- "Import" button in the same Data section, visible only to the household owner.
- Flow: user selects file → backend validates against schema → user chooses destination → import executes.
- **Destination choice:** "Overwrite current household" (with confirmation dialog) or "Create a new household" (uses household creation under the hood, name from file).
- **Overwrite:** Wipes and replaces current household data. Owner's account link is preserved. All imported members come in as uninvited.
- **Create new:** New household created with data from file. Owner is the importing user. All members come in as uninvited. User is switched to the new household.
- **All-or-nothing:** Entire import runs in a transaction. If anything fails, nothing is written.
- **Validation:** Full schema validation before any write. If the file is invalid, import is rejected with a clear error describing the problem.

### Schema versioning

- Top-level `schemaVersion` field in the export JSON, starting at `1`.
- On import, the backend checks the version. Files from newer versions are rejected with a clear message.
- Future versions can include migration logic to transform older schemas. For now, only version 1 exists — just the version check infrastructure.

## Key Decisions

| Decision           | Choice                                         | Rationale                                                                                                                     |
| ------------------ | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| File format        | JSON                                           | Human-readable, natural fit for TypeScript stack, easy to version. Data volume for one household without snapshots is modest. |
| Export scope       | Full household, no snapshots, single household | Covers backup/migration/portability use cases. Snapshots excluded to keep file size reasonable.                               |
| Import mode        | User chooses overwrite or create new           | Supports both restore (overwrite) and migration (create new) without merge complexity.                                        |
| Import validation  | All-or-nothing, validate before write          | Partial imports create confusing states. Fail fast with clear errors.                                                         |
| Access control     | Owner-only for both export and import          | Simple and safe. Export is read-only but keeping it owner-only avoids data leakage concerns.                                  |
| Member model       | Decouple from user accounts                    | Required for import (members arrive without accounts) and useful independently.                                               |
| Member deletion    | Reassignment prompt (subcategory pattern)      | Consistent with existing UX for subcategory deletion. Prevents orphaned items.                                                |
| Household creation | General-purpose via switcher dropdown          | Needed for import's "create new" path but valuable as a standalone feature.                                                   |
| Schema versioning  | Version field from day one                     | Low cost now, prevents painful migration issues later.                                                                        |

## Out of Scope

- Snapshots in export/import
- Selective/partial export (e.g. just income)
- Multi-household export in a single file
- Merge-based import (conflict resolution)
- Streaming/chunked upload for large files
- Background job processing for import/export
- Sharing or template functionality
- Audit log export
- User account data in exports (emails, passwords, etc.)

## Visual Reference

- `data-section-settings.html` — Data section in Settings (export/import rows), import destination dialog, and reworked HouseholdSwitcher dropdown
