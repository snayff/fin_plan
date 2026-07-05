---
feature: staleness-indicators
status: implemented
priority: high
deferred: false
phase: 12
implemented_date: 2026-07-05
---

# Staleness Indicators

## Intention

Users need to know when a financial value hasn't been reviewed recently and may no longer reflect reality. The staleness system surfaces this passively — ambient indicators that prompt action without blocking the user.

## Description

Every waterfall item and wealth account records a `lastReviewedAt` timestamp. A staleness threshold (configured per item type in Settings) defines how many months before an item is considered stale. When stale, a 5px amber dot (●) indicator appears inline on the item with amber detail text showing the age (e.g. "14mo ago"). When fresh, nothing is shown — silence means approval.

## User Stories

- As a user, I want to see at a glance which items haven't been reviewed in a while, so I know where to focus during a review.
- As a user, I want the indicator to be unobtrusive when everything is current, so the UI isn't noisy.
- As a user, I want to know how long ago something was last reviewed, so I can judge urgency.

## Acceptance Criteria

### StalenessIndicator component

- [ ] Renders nothing when the item is not stale
- [ ] Renders a 5px amber dot (●, `attention` token) when stale, with amber detail text showing age (e.g. "14mo ago") and tooltip: "Last reviewed: N months ago"
- [ ] Accepts `lastReviewedAt: string` (ISO date) and `thresholdMonths: number` as props

### Staleness utility (`staleness.ts`)

- [ ] `isStale(lastReviewedAt, thresholdMonths)` returns true when months elapsed >= threshold
- [ ] `stalenessLabel(lastReviewedAt)` returns:
  - "Last reviewed: this month" when 0 months ago
  - "Last reviewed: 1 month ago" when 1 month ago
  - "Last reviewed: N months ago" for N > 1

### Overview page placement

- [ ] Each tier row in WaterfallLeftPanel shows a tier-level attention badge (amber dot + stale count text, e.g. "● 3 stale") when ≥1 item in the tier is stale; absent when all items are current (silence = approval)
- [ ] Each item row in the right panel (State 2 item list) shows `<StalenessIndicator>` (5px amber dot before label + amber detail text) using the per-type threshold from HouseholdSettings
- [ ] ItemDetailPanel shows `stalenessLabel()` text below the item value; shown in amber (`attention` token) if stale

### Wealth page placement

- [ ] Each account row in AccountListPanel shows staleness state: amber dot (●) + amber detail text when stale; nothing when fresh (silence = approval)
- [ ] AccountDetailPanel shows `stalenessLabel()` below the balance

### Thresholds

- [ ] Staleness thresholds are read from `HouseholdSettings.stalenessThresholds` (per-type JSON)
- [ ] Defaults: income_source 12mo, committed_bill 6mo, yearly_bill 12mo, discretionary_category 12mo, savings_allocation 12mo, wealth_account 3mo

## Open Questions

- None

## Remaining Work

Core utility functions (`isStale`, `stalenessLabel`, `monthsElapsed`) and the per-item dot indicator are implemented. The following page-level integrations are outstanding:

- [ ] WaterfallLeftPanel tier-row staleness badge: amber "● N stale" count badge per tier (e.g. "● 3 stale")
- [ ] ItemDetailPanel: staleness label displayed in amber when item is stale (integration not wired)
- [ ] AccountListPanel: per-account staleness state rendering
- [ ] Read staleness thresholds from `HouseholdSettings` rather than hardcoded defaults
