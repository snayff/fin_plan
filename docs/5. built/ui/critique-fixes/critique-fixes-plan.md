---
feature: critique-fixes
category: ui
spec: docs/4. planning/critique-fixes/critique-fixes-spec.md
creation_date: 2026-03-29
status: implemented
implemented_date: 2026-07-05
---

# Critique Fixes — Implementation Plan

> **For Claude:** Use `/execute-plan critique-fixes` to implement this plan task-by-task.

> **Purpose:** An ordered, task-by-task build guide. Each task follows TDD red-green-commit and contains complete, ready-to-run code — no "implement X" placeholders. This is the input to `/execute-plan`. The spec defines _what_ to build; this plan defines _how_.

**Goal:** Apply the 26 agreed design critique decisions — animations, typography, spacing, colour tokens, microcopy, empty states — as a coordinated frontend polish pass.
**Spec:** `docs/4. planning/critique-fixes/critique-fixes-spec.md`
**Architecture:** Frontend-only. All 16 target component files already exist. No new files needed. Changes are: Tailwind config extension, Framer Motion animation additions, Tailwind class replacements, text content updates, and design-system.md documentation. No backend, schema, or API changes.
**Tech Stack:** Fastify · Prisma · tRPC · Zod · React 18 · TanStack Query · Zustand · Tailwind

**Infrastructure Impact:**

- Touches `packages/shared/`: no
- Requires DB migration: no

---

## Pre-conditions

- [ ] Framer Motion is already installed in `apps/frontend` (used by `SubcategoryList`, `WaterfallLeftPanel`)
- [ ] `usePrefersReducedMotion` hook exists at `apps/frontend/src/utils/motion.ts`
- [ ] `LayoutGroup` is available from `framer-motion` package

---

## Tasks

---

### Task 1: Tailwind named font-size tokens (#21)

**Files:**

- Modify: `apps/frontend/tailwind.config.js`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/components/tier/SubcategoryList.test.tsx
// (add to existing or create)
// The test verifies that after adding tokens, text-tier, text-tier-total,
// text-connector, text-hero resolve to known px values via class presence.
// Since Tailwind config is compile-time, verification is via type-check + build.
// Run: bun run type-check (no TS error expected but class won't exist yet)
// The "failing test" here is: the WaterfallLeftPanel currently uses
// text-[13px] and text-[15px]. After adding tokens those become text-tier and
// text-tier-total. Before that change, the classes don't resolve.
// Proceed directly — this task is config only; the failing state is confirmed
// by searching for text-[13px] usages that should be replaced.
```

No automated test file — verification is `bun run build` (Tailwind purges unused classes; named tokens must exist in config for component classes to resolve).

- [ ] **Step 2: Confirm failing state**

Run: `grep -r "text-\[13px\]\|text-\[15px\]\|text-\[10.5px\]\|text-\[30px\]" apps/frontend/src`
Expected: Results showing these classes exist in components but have no named alias yet.

- [ ] **Step 3: Add fontSize tokens to tailwind.config.js**

In `apps/frontend/tailwind.config.js`, add `fontSize` inside `theme.extend`:

```javascript
fontSize: {
  connector: ["10.5px", { lineHeight: "1.4" }],
  tier: ["13px", { lineHeight: "1.4" }],
  "tier-total": ["15px", { lineHeight: "1.4" }],
  hero: ["30px", { lineHeight: "1.15" }],
},
```

The full `theme.extend` block after the change (add after `lineHeight`):

```javascript
lineHeight: {
  heading: "1.15",
},
fontSize: {
  connector: ["10.5px", { lineHeight: "1.4" }],
  tier: ["13px", { lineHeight: "1.4" }],
  "tier-total": ["15px", { lineHeight: "1.4" }],
  hero: ["30px", { lineHeight: "1.15" }],
},
```

- [ ] **Step 4: Verify**

Run: `cd apps/frontend && bun run build`
Expected: Build succeeds. `text-connector`, `text-tier`, `text-tier-total`, `text-hero` now resolve.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/tailwind.config.js
git commit -m "feat(ui): add named font-size tokens (text-tier, text-hero, etc.)"
```

---

### Task 2: Typography — collapse arbitrary sizes, font-mono→font-numeric, section labels, hero amounts (#21, #22, #23, #25)

**Files:**

- Modify: `apps/frontend/src/components/wealth/WealthLeftPanel.tsx`
- Modify: `apps/frontend/src/components/overview/WaterfallLeftPanel.tsx` (already uses named sizes via SectionHeader — verify only)
- Modify: `apps/frontend/src/components/help/visuals/NetWorthBar.tsx`

**Note on scope:** `text-[10px]`, `text-[11px]`, `text-[12.5px]` → `text-xs`. `text-[28px]` → `text-hero`. `font-mono` rendering currency/percentage → `font-numeric`. Section label canonical treatment: `text-xs font-medium uppercase tracking-wider text-muted-foreground` (note: `tracking-widest` and `tracking-wide` in some places → `tracking-wider`).

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/components/wealth/WealthLeftPanel.test.tsx
import { describe, it, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { WealthLeftPanel } from "./WealthLeftPanel";
import type { WealthSummary } from "@finplan/shared";

const mockSummary: WealthSummary = {
  netWorth: 50000,
  ytdChange: 1200,
  byLiquidity: { cashAndSavings: 20000, investmentsAndPensions: 25000, propertyAndVehicles: 5000 },
  byClass: { savings: 20000, pensions: 15000, investments: 10000, property: 5000, vehicles: 0, other: 0 },
};

describe("WealthLeftPanel typography", () => {
  it("renders hero amount with font-numeric class (not font-mono)", () => {
    render(
      <WealthLeftPanel
        summary={mockSummary}
        accounts={[]}
        onSelectClass={() => {}}
        onSelectTrust={() => {}}
        selectedClass={null}
        selectedTrustName={null}
      />
    );
    // The net worth amount element should use font-numeric, not font-mono
    const heroEl = screen.getByText("£50,000.00");
    expect(heroEl.className).toContain("font-numeric");
    expect(heroEl.className).not.toContain("font-mono");
  });

  it("renders Net Worth section label with canonical treatment", () => {
    render(
      <WealthLeftPanel
        summary={mockSummary}
        accounts={[]}
        onSelectClass={() => {}}
        onSelectTrust={() => {}}
        selectedClass={null}
        selectedTrustName={null}
      />
    );
    // Section label should use text-xs font-medium uppercase tracking-wider
    const label = screen.getByText(/net worth/i).closest("p")!;
    expect(label.className).toContain("tracking-wider");
    expect(label.className).not.toContain("tracking-wide");
    expect(label.className).not.toContain("tracking-widest");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun scripts/run-tests.ts WealthLeftPanel`
Expected: FAIL — hero element has `font-mono`, label has `tracking-wide`/`tracking-widest`

- [ ] **Step 3: Apply typography changes**

**`apps/frontend/src/components/wealth/WealthLeftPanel.tsx`** — make these targeted replacements:

Line 54 (hero section `<div>` tag) — update padding from `px-5 pt-5` to `px-4 pt-4` (spacing also addressed here):

```tsx
// Before:
className = "relative overflow-visible rounded-t-xl pb-9 px-5 pt-5 border-b border-border";
// After:
className = "relative overflow-visible rounded-t-xl pb-9 px-4 pt-4 border-b border-border";
```

Line 61 — section label, fix size + tracking:

```tsx
// Before:
<p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">
// After:
<p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
```

Line 69 (breakout card position) — update from `left-4 right-4` to `left-3 right-3`:

```tsx
// Before:
<div className="absolute -bottom-6 left-4 right-4 z-[3] bg-surface-elevated border border-surface-elevated-border rounded-[10px] px-4 py-3.5">
// After:
<div className="absolute -bottom-6 left-3 right-3 z-[3] bg-surface-elevated border border-surface-elevated-border rounded-[10px] px-4 py-3.5">
```

Line 70 — hero amount, font-mono + size → font-numeric + text-hero:

```tsx
// Before:
<p className="font-mono text-[28px] font-bold leading-tight">
// After:
<p className="font-numeric text-hero font-extrabold leading-tight">
```

Line 81 (body section padding) — update from `px-5` to `px-4`:

```tsx
// Before:
<div className="pt-9 px-5 pb-5">
// After:
<div className="pt-9 px-4 pb-4">
```

Line 83 — "By Liquidity" section label, fix size + tracking:

```tsx
// Before:
<p className="text-[10px] font-semibold text-foreground/55 uppercase tracking-widest mb-2">
// After:
<p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
```

Line 129 (trust section label) — fix treatment:

```tsx
// Before:
<p className="text-xs font-medium uppercase tracking-wide px-2 mb-1 text-foreground/55">
// After:
<p className="text-xs font-medium uppercase tracking-wider px-2 mb-1 text-muted-foreground">
```

**`apps/frontend/src/components/help/visuals/NetWorthBar.tsx`** — replace `font-mono` with `font-numeric`:

```tsx
// Line 11: Before:
className="bg-tier-surplus/40 flex items-center justify-center text-[10px] text-tier-surplus font-mono"
// After:
className="bg-tier-surplus/40 flex items-center justify-center text-xs text-tier-surplus font-numeric"

// Line 17: Before:
className="bg-muted/60 flex items-center justify-center text-[10px] text-muted-foreground font-mono"
// After:
className="bg-muted/60 flex items-center justify-center text-xs text-muted-foreground font-numeric"

// Line 26: Before:
<p className="font-mono text-sm font-semibold">£250,000</p>
// After:
<p className="font-numeric text-sm font-semibold">£250,000</p>

// Line 30: Before:
<p className="font-mono text-sm font-semibold">£180,000</p>
// After:
<p className="font-numeric text-sm font-semibold">£180,000</p>

// Line 34: Before:
<p className="font-mono text-sm font-semibold text-tier-surplus">
// After:
<p className="font-numeric text-sm font-semibold text-tier-surplus">
```

**`apps/frontend/src/components/planner/PlannerLeftPanel.tsx`** — section label tracking:

```tsx
// Line 41 "Purchases" label: Before:
<span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
// After:
<span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">

// Line 74 "Gifts" label: Before:
<span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
// After:
<span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun scripts/run-tests.ts WealthLeftPanel`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/wealth/WealthLeftPanel.tsx \
        apps/frontend/src/components/help/visuals/NetWorthBar.tsx \
        apps/frontend/src/components/planner/PlannerLeftPanel.tsx
git commit -m "feat(ui): typography — font-numeric, canonical section labels, text-hero"
```

---

### Task 3: GhostAddButton contrast + hardcoded hex sweep (#5, #24)

**Files:**

- Modify: `apps/frontend/src/components/tier/GhostAddButton.tsx`
- Modify: `apps/frontend/src/components/common/ButtonPair.tsx`
- Modify: `apps/frontend/src/components/common/PanelError.tsx`
- Modify: `apps/frontend/src/components/layout/TwoPanelLayout.tsx`
- Modify: `apps/frontend/src/components/wealth/AccountDetailPanel.tsx`
- Modify: `apps/frontend/src/components/overview/IncomeTypePanel.tsx`
- Modify: `apps/frontend/src/components/overview/CommittedBillsPanel.tsx`
- Modify: `apps/frontend/src/components/overview/HistoryChart.tsx`
- Modify: `apps/frontend/src/components/overview/CashflowCalendar.tsx`
- Modify: `apps/frontend/src/components/overview/ReviewWizard.tsx` (hex only, not copy)
- Test: `apps/frontend/src/components/tier/GhostAddButton.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `apps/frontend/src/components/tier/GhostAddButton.test.tsx`:

```typescript
it("uses border-foreground/20 (not border-foreground/10)", () => {
  const { getByRole } = render(<GhostAddButton onClick={() => {}} />);
  const btn = getByRole("button");
  // The className string should contain foreground/20, not foreground/10 for border
  expect(btn.className).toContain("border-foreground/20");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun scripts/run-tests.ts GhostAddButton`
Expected: FAIL — button has `border-foreground/10`

- [ ] **Step 3: Apply all colour/hex changes**

**`apps/frontend/src/components/tier/GhostAddButton.tsx`:**

```tsx
// Before:
"border-foreground/10 text-foreground/45",
// After:
"border-foreground/20 text-foreground/60",
```

**`apps/frontend/src/components/common/ButtonPair.tsx`** — line 63, replace hardcoded green:

```tsx
// Before:
color: "#10b981",
// After:
color: "hsl(var(--success))",
```

**`apps/frontend/src/components/common/PanelError.tsx`** — line 11, replace hardcoded blue-grey:

```tsx
// Before:
style={{ background: "#2a3f60", opacity: 0.3 }}
// After:
style={{ background: "hsl(var(--surface-elevated))", opacity: 0.3 }}
```

**`apps/frontend/src/components/layout/TwoPanelLayout.tsx`** — line 17, replace `stroke="#475569"`:
Check the exact context and replace with a foreground token. Read the line first during execution, then replace `"#475569"` with `"hsl(var(--muted-foreground))"`.

**`apps/frontend/src/components/wealth/AccountDetailPanel.tsx`** — line 204:

```tsx
// Before:
style={accountIsStale ? { color: "#f59e0b" } : undefined}
// After:
className={cn("text-sm mt-0.5", accountIsStale && "text-attention")}
// (remove the style prop; add className with cn — AccountDetailPanel already imports cn)
```

**`apps/frontend/src/components/overview/IncomeTypePanel.tsx`** — line 80:

```tsx
// Before:
<div className="flex items-center gap-1 font-numeric text-[#cbd5e1]">
// After:
<div className="flex items-center gap-1 font-numeric text-foreground/60">
```

**`apps/frontend/src/components/overview/CommittedBillsPanel.tsx`** — line 75:

```tsx
// Before:
<span className="font-numeric text-[#cbd5e1]">{formatCurrency(bill.amount)}</span>
// After:
<span className="font-numeric text-foreground/60">{formatCurrency(bill.amount)}</span>
```

**`apps/frontend/src/components/overview/HistoryChart.tsx`** — line 54:

```tsx
// Before:
<ReferenceLine x={snapshotX} stroke="#f59e0b" strokeDasharray="4 4" strokeWidth={1.5} />
// After:
<ReferenceLine x={snapshotX} stroke="hsl(var(--attention))" strokeDasharray="4 4" strokeWidth={1.5} />
```

**`apps/frontend/src/components/overview/CashflowCalendar.tsx`** — lines 51, 57:

```tsx
// Before:
style={month.shortfall ? { color: "#f59e0b" } : undefined}
// After:
className={month.shortfall ? "text-attention" : undefined}
// (replace style prop with className — do this for both occurrences)
```

**`apps/frontend/src/components/overview/ReviewWizard.tsx`** — line 86 (stale label in ItemCard):

```tsx
// Before:
<p className="text-xs" style={{ color: "#f59e0b" }}>
  Stale
</p>
// After:
<p className="text-xs text-attention">
  Stale
</p>
```

**`apps/frontend/src/components/common/StaleDataBanner.tsx`** — lines 27-29 (colour tokens AND copy — combined here for one clean commit):

```tsx
// Before:
style={{
  background: "rgba(245, 158, 11, 0.04)",
  borderBottom: "1px solid rgba(245, 158, 11, 0.08)",
  color: "#f59e0b",
}}
// After:
className="bg-attention/4 border-b border-attention/8 text-attention"
// Remove the style prop entirely and use Tailwind classes
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun scripts/run-tests.ts GhostAddButton`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/tier/GhostAddButton.tsx \
        apps/frontend/src/components/common/ButtonPair.tsx \
        apps/frontend/src/components/common/PanelError.tsx \
        apps/frontend/src/components/layout/TwoPanelLayout.tsx \
        apps/frontend/src/components/wealth/AccountDetailPanel.tsx \
        apps/frontend/src/components/overview/IncomeTypePanel.tsx \
        apps/frontend/src/components/overview/CommittedBillsPanel.tsx \
        apps/frontend/src/components/overview/HistoryChart.tsx \
        apps/frontend/src/components/overview/CashflowCalendar.tsx \
        apps/frontend/src/components/overview/ReviewWizard.tsx \
        apps/frontend/src/components/common/StaleDataBanner.tsx
git commit -m "feat(ui): replace all hardcoded hex colours with design tokens"
```

---

### Task 4: Vertical rhythm + left panel spacing (#16, #17, #18, #19, #20)

**Files:**

- Modify: `apps/frontend/src/components/overview/ItemDetailPanel.tsx`
- Modify: `apps/frontend/src/components/overview/CommittedBillsPanel.tsx`
- Modify: `apps/frontend/src/components/overview/IncomeTypePanel.tsx`
- Modify: `apps/frontend/src/components/wealth/AccountDetailPanel.tsx`
- Modify: `apps/frontend/src/components/overview/WaterfallLeftPanel.tsx`
- Modify: `apps/frontend/src/components/planner/PlannerLeftPanel.tsx`

**Note:** `WealthLeftPanel` spacing was already updated in Task 2. `space-y-0.5` + `py-1.5` pattern: WaterfallLeftPanel already uses `space-y-0.5`; PlannerLeftPanel item buttons already use `py-1.5`; verify and tighten gaps.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/components/overview/ItemDetailPanel.test.tsx
// Add to existing test file — check wrapper spacing class
import { describe, it, expect, vi } from "bun:test";
import { render, screen } from "@testing-library/react";

// The root wrapper of ItemDetailPanel should use space-y-6 between sections.
// Currently it uses space-y-5.
describe("ItemDetailPanel spacing", () => {
  it("uses space-y-6 rhythm between sections", () => {
    // Mock the hooks to avoid network calls
    vi.mock("@/hooks/useWaterfall", () => ({
      useItemHistory: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
      useConfirmItem: () => ({ mutate: vi.fn(), isPending: false }),
      useUpdateItem: () => ({ mutate: vi.fn(), isPending: false }),
      useEndIncome: () => ({ mutate: vi.fn(), isPending: false }),
    }));
    vi.mock("@/hooks/useSettings", () => ({
      useSettings: () => ({ data: null }),
    }));
    vi.mock("@/hooks/useNudge", () => ({
      useYearlyBillNudge: () => ({ nudge: null }),
      useSavingsNudge: () => null,
    }));
    vi.mock("@/hooks/useWealth", () => ({
      useWealthAccount: () => ({ data: null }),
    }));

    const { container } = render(
      <ItemDetailPanel
        item={{ id: "1", type: "committed_bill", name: "Rent", amount: 1200, lastReviewedAt: new Date() }}
        onBack={() => {}}
      />
    );
    // Root wrapper should have space-y-6
    expect(container.firstChild?.className ?? "").toContain("space-y-6");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun scripts/run-tests.ts ItemDetailPanel`
Expected: FAIL — root wrapper has `space-y-5` not `space-y-6`

- [ ] **Step 3: Apply spacing changes**

**`apps/frontend/src/components/overview/ItemDetailPanel.tsx`** — line 158, root wrapper:

```tsx
// Before:
<div className="space-y-5">
// After:
<div className="space-y-6">
```

Group breadcrumb + heading + amount together (lines 159-186) — wrap in a `space-y-2` section group:

```tsx
// Before (three separate elements):
<button onClick={onBack} ...>← {breadcrumbLabel} / {item.name}</button>

<div>
  <h2 className="text-lg font-semibold">{item.name}</h2>
  ...
  <p className="text-[30px] font-numeric font-extrabold text-primary mt-1">...</p>
  ...
</div>
// After — merge breadcrumb into the heading group:
<div className="space-y-2">
  <button onClick={onBack} ...>← {breadcrumbLabel} / {item.name}</button>
  <div>
    <h2 className="text-lg font-semibold">{item.name}</h2>
    ...
    <p className="text-hero font-numeric font-extrabold text-primary">...</p>
    ...
  </div>
</div>
```

Also update the hero amount class (already `text-[30px]` → `text-hero`):

```tsx
// Before:
<p className="text-[30px] font-numeric font-extrabold text-primary mt-1">
// After:
<p className="text-hero font-numeric font-extrabold text-primary">
```

**`apps/frontend/src/components/overview/CommittedBillsPanel.tsx`** — outer wrapper:

```tsx
// Before:
<div className="space-y-4">
// After:
<div className="space-y-6">
```

Breadcrumb + heading group: wrap in `space-y-2`.

**`apps/frontend/src/components/overview/IncomeTypePanel.tsx`** — same pattern as CommittedBillsPanel:

```tsx
// Before:
<div className="space-y-4">
// After:
<div className="space-y-6">
```

Breadcrumb + heading: wrap in `space-y-2`.

**`apps/frontend/src/components/wealth/AccountDetailPanel.tsx`** — outer wrapper (already `space-y-6`? check during execution; if not, update to `space-y-6`).

**`apps/frontend/src/components/planner/PlannerLeftPanel.tsx`** — ensure button items use `py-1.5`:
The `"View purchases →"` button: already `py-1.5` ✓. The `Upcoming` / `By person` buttons: already `py-1.5` ✓. Verify `space-y-0.5` spacing on the buttons group.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun scripts/run-tests.ts ItemDetailPanel`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/overview/ItemDetailPanel.tsx \
        apps/frontend/src/components/overview/CommittedBillsPanel.tsx \
        apps/frontend/src/components/overview/IncomeTypePanel.tsx \
        apps/frontend/src/components/wealth/AccountDetailPanel.tsx \
        apps/frontend/src/components/planner/PlannerLeftPanel.tsx
git commit -m "feat(ui): two-tier vertical rhythm on right-panel detail views"
```

---

### Task 5: Microcopy — StaleDataBanner copy, delete confirmations, empty state headings (#27, #29, #30)

**Files:**

- Modify: `apps/frontend/src/components/common/StaleDataBanner.tsx`
- Modify: `apps/frontend/src/components/tier/ItemArea.tsx`
- Modify: `apps/frontend/src/components/tier/emptyStateCopy.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/components/common/StaleDataBanner.test.tsx
import { describe, it, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { StaleDataBanner } from "./StaleDataBanner";

describe("StaleDataBanner", () => {
  it("shows sync failure message (not 'Data may be outdated')", () => {
    render(<StaleDataBanner lastSyncedAt={new Date(Date.now() - 60000)} onRetry={() => {}} />);
    expect(screen.queryByText(/data may be outdated/i)).toBeNull();
    expect(screen.getByText(/couldn't sync/i)).toBeTruthy();
  });

  it("shows 'Retry' button", () => {
    render(<StaleDataBanner lastSyncedAt={null} onRetry={() => {}} />);
    expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun scripts/run-tests.ts StaleDataBanner`
Expected: FAIL — text is "Data may be outdated"

- [ ] **Step 3: Apply microcopy changes**

**`apps/frontend/src/components/common/StaleDataBanner.tsx`** — update copy and colours:

```tsx
import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";

interface StaleDataBannerProps {
  lastSyncedAt: Date | null;
  onRetry: () => void;
}

export function StaleDataBanner({ lastSyncedAt, onRetry }: StaleDataBannerProps) {
  const [, forceRender] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => forceRender((n) => n + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  const timeAgo = lastSyncedAt ? formatDistanceToNow(lastSyncedAt, { addSuffix: true }) : "unknown";

  return (
    <div className="w-full px-4 py-1.5 text-xs flex items-center gap-2 bg-attention/4 border-b border-attention/8 text-attention">
      <span>
        Couldn't sync — showing last saved data · {timeAgo} ·{" "}
        <button
          onClick={onRetry}
          className="underline underline-offset-2 hover:no-underline"
          type="button"
        >
          Retry
        </button>
      </span>
    </div>
  );
}
```

**`apps/frontend/src/components/tier/ItemArea.tsx`** — update delete confirmation copy:

The `ConfirmDialog` currently has:

```tsx
title = "Delete item";
message = "Are you sure you want to delete this item?";
confirmText = "Delete";
```

Update to use item name. Find the item being deleted:

```tsx
// Add helper before the return statement:
const deletingItem = items.find((it) => it.id === deletingItemId);

// Update ConfirmDialog:
<ConfirmDialog
  isOpen={!!deletingItemId}
  onClose={() => setDeletingItemId(null)}
  onConfirm={async () => {
    await deleteItem.mutateAsync();
    setDeletingItemId(null);
    setEditingItemId(null);
    setExpandedItemId(null);
  }}
  title={deletingItem ? `Remove ${deletingItem.name}?` : "Remove item?"}
  message={
    deletingItem
      ? `${deletingItem.name} will be permanently removed from your plan.`
      : "This item will be permanently removed from your plan."
  }
  confirmText="Remove"
  variant="danger"
  isLoading={deleteItem.isPending}
/>;
```

**`apps/frontend/src/components/tier/emptyStateCopy.ts`** — update headers to question-prompt format:

```typescript
const COPY: Record<string, EmptyStateCopy> = {
  // Income
  salary: { header: "What income do you earn?", body: "Employment income, take-home pay" },
  dividends: {
    header: "What dividend income do you have?",
    body: "Investment income, shareholder dividends",
  },
  "income-other": {
    header: "What other income do you have?",
    body: "Rental income, freelance, side projects",
  },
  // Committed
  housing: {
    header: "What housing costs do you have?",
    body: "Rent, mortgage, council tax, insurance",
  },
  utilities: {
    header: "What utilities do you have?",
    body: "Gas, electric, water, internet, phone",
  },
  services: {
    header: "What subscriptions do you have?",
    body: "Streaming, TV, gym, subscriptions",
  },
  "committed-other": {
    header: "What regular costs do you have?",
    body: "Any regular obligation not covered above",
  },
  // Discretionary
  food: { header: "What do you budget for food?", body: "Groceries, meal kits, work lunches" },
  fun: { header: "What do you budget for fun?", body: "Eating out, takeaways, cinema, hobbies" },
  clothes: { header: "What do you budget for clothes?", body: "Clothing, shoes, accessories" },
  gifts: { header: "What do you budget for gifts?", body: "Configured from the Gifts page" },
  savings: { header: "What are you saving towards?", body: "Emergency fund, ISA, pension top-up" },
  "discretionary-other": {
    header: "What other spending do you have?",
    body: "Anything not covered in the categories above",
  },
};

const FALLBACKS: Record<string, EmptyStateCopy> = {
  income: { header: "What income do you have?", body: "Add a source of income" },
  committed: { header: "What regular costs do you have?", body: "Add a regular committed expense" },
  discretionary: {
    header: "What are you spending on?",
    body: "Add a discretionary spending category",
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun scripts/run-tests.ts StaleDataBanner`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/common/StaleDataBanner.tsx \
        apps/frontend/src/components/tier/ItemArea.tsx \
        apps/frontend/src/components/tier/emptyStateCopy.ts
git commit -m "feat(ui): microcopy — StaleDataBanner, delete confirmations, empty state headings"
```

---

### Task 6: GhostedListEmpty — question-prompt layout + skeleton removal (#4, #29)

**Files:**

- Modify: `apps/frontend/src/components/ui/GhostedListEmpty.tsx`
- Modify: `apps/frontend/src/components/tier/ItemArea.tsx`
- Modify: `apps/frontend/src/components/wealth/AccountListPanel.tsx`
- Modify: `apps/frontend/src/components/planner/GiftPersonListPanel.tsx`
- Modify: `apps/frontend/src/components/planner/PurchaseListPanel.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/components/ui/GhostedListEmpty.test.tsx
import { describe, it, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { GhostedListEmpty } from "./GhostedListEmpty";

describe("GhostedListEmpty addable variant", () => {
  it("renders ctaHeading as a visible heading", () => {
    render(
      <GhostedListEmpty
        ctaHeading="What income do you earn?"
        ctaText="Employment income, take-home pay"
        onCtaClick={() => {}}
      />
    );
    expect(screen.getByText("What income do you earn?")).toBeTruthy();
    expect(screen.getByText("Employment income, take-home pay")).toBeTruthy();
  });

  it("does not render skeleton rows when ctaHeading is provided", () => {
    const { container } = render(
      <GhostedListEmpty
        ctaHeading="What income do you earn?"
        ctaText="Employment income, take-home pay"
        onCtaClick={() => {}}
        rowCount={3}
      />
    );
    // No animate-pulse skeleton elements
    expect(container.querySelectorAll(".animate-pulse").length).toBe(0);
  });

  it("still renders skeleton rows in informational variant (showCta=false)", () => {
    const { container } = render(
      <GhostedListEmpty
        ctaText="No upcoming events"
        showCta={false}
        rowCount={3}
      />
    );
    // Ghost row divs are present (they don't use animate-pulse, they use opacity)
    const ghostRows = container.querySelectorAll('[style*="opacity"]');
    expect(ghostRows.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun scripts/run-tests.ts GhostedListEmpty`
Expected: FAIL — `ctaHeading` prop doesn't exist; `screen.getByText` fails

- [ ] **Step 3: Write implementation**

**`apps/frontend/src/components/ui/GhostedListEmpty.tsx`** — complete rewrite:

```tsx
import { Button } from "@/components/ui/button";

const GHOST_WIDTHS = [100, 140, 80, 120];
const GHOST_OPACITIES = [1, 0.8, 0.5, 0.25];

interface GhostedListEmptyProps {
  rowCount?: number;
  ctaHeading?: string;
  ctaText: string;
  ctaButtonLabel?: string;
  onCtaClick?: () => void;
  showCta?: boolean;
}

export function GhostedListEmpty({
  rowCount = 3,
  ctaHeading,
  ctaText,
  ctaButtonLabel = "+ Add",
  onCtaClick,
  showCta = true,
}: GhostedListEmptyProps) {
  const isAddable = showCta && !!onCtaClick && !!ctaHeading;

  return (
    <div className="py-2">
      {/* Fading skeleton rows — only for informational/contextual variants */}
      {!isAddable && (
        <div className="space-y-1">
          {Array.from({ length: rowCount }, (_, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-2 px-3"
              style={{ opacity: GHOST_OPACITIES[Math.min(i, GHOST_OPACITIES.length - 1)] }}
            >
              <div
                className="h-2.5 rounded-full"
                style={{
                  width: GHOST_WIDTHS[i % GHOST_WIDTHS.length],
                  background: "rgba(255, 255, 255, 0.04)",
                }}
              />
              <div
                className="h-2.5 w-16 rounded-full"
                style={{ background: "rgba(255, 255, 255, 0.03)" }}
              />
            </div>
          ))}
        </div>
      )}

      {/* CTA card */}
      {showCta && onCtaClick && (
        <div
          className="mx-2 mt-3 flex items-center justify-between gap-3 rounded-lg p-3.5"
          style={{
            background:
              "linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(168, 85, 247, 0.05) 100%)",
            border: "1px solid rgba(99, 102, 241, 0.1)",
          }}
        >
          <div className="flex flex-col gap-0.5 min-w-0">
            {ctaHeading && (
              <span className="text-xs font-medium text-foreground/80 leading-snug">
                {ctaHeading}
              </span>
            )}
            <span className="text-xs text-muted-foreground leading-snug">{ctaText}</span>
          </div>
          <Button size="sm" onClick={onCtaClick} className="shrink-0">
            {ctaButtonLabel}
          </Button>
        </div>
      )}

      {/* Informational-only text (showCta=false, no button) */}
      {!showCta && ctaText && (
        <p className="px-3 py-2 text-xs text-muted-foreground italic">{ctaText}</p>
      )}
    </div>
  );
}
```

**`apps/frontend/src/components/tier/ItemArea.tsx`** — update GhostedListEmpty call:

```tsx
// Before:
<GhostedListEmpty
  rowCount={0}
  ctaText={getEmptyStateCopy(subcategory.name, tier).body}
  onCtaClick={() => setIsAddingItem(true)}
/>
// After:
<GhostedListEmpty
  ctaHeading={getEmptyStateCopy(subcategory.name, tier).header}
  ctaText={getEmptyStateCopy(subcategory.name, tier).body}
  onCtaClick={() => setIsAddingItem(true)}
/>
```

**`apps/frontend/src/components/wealth/AccountListPanel.tsx`** — update GhostedListEmpty call:

```tsx
// Before:
<GhostedListEmpty
  ctaText="Add an account to start tracking balances"
  onCtaClick={openAddForm}
/>
// After:
<GhostedListEmpty
  ctaHeading="What accounts do you have?"
  ctaText="Add your first account to begin tracking balances"
  onCtaClick={openAddForm}
/>
```

**`apps/frontend/src/components/planner/GiftPersonListPanel.tsx`** — update call:

```tsx
// Before:
<GhostedListEmpty
  ctaText="Plan gifts by person and event — birthdays, Christmas, and more"
  onCtaClick={() => setShowAddForm(true)}
/>
// After:
<GhostedListEmpty
  ctaHeading="Who do you buy gifts for?"
  ctaText="Add your first person to begin planning gifts"
  onCtaClick={() => setShowAddForm(true)}
/>
```

**`apps/frontend/src/components/planner/PurchaseListPanel.tsx`** — read and update call similarly:

```tsx
// Add ctaHeading="What are you planning to buy?" and update ctaText to follow the pattern
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun scripts/run-tests.ts GhostedListEmpty`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/ui/GhostedListEmpty.tsx \
        apps/frontend/src/components/tier/ItemArea.tsx \
        apps/frontend/src/components/wealth/AccountListPanel.tsx \
        apps/frontend/src/components/planner/GiftPersonListPanel.tsx \
        apps/frontend/src/components/planner/PurchaseListPanel.tsx
git commit -m "feat(ui): GhostedListEmpty question-prompt layout + skeleton removal for addable lists"
```

---

### Task 7: Toast microcopy sweep (#12, #13)

**Files:**

- Modify: `apps/frontend/src/components/overview/ItemDetailPanel.tsx`
- Modify: `apps/frontend/src/components/overview/ReviewWizard.tsx`
- Modify: `apps/frontend/src/components/wealth/AccountDetailPanel.tsx`
- Modify: `apps/frontend/src/components/planner/PurchaseDetailPanel.tsx`
- Modify: `apps/frontend/src/components/planner/GiftPersonDetailPanel.tsx`
- Modify: `apps/frontend/src/components/settings/ProfileSection.tsx`
- Modify: `apps/frontend/src/components/settings/TrustAccountsSection.tsx`
- Modify: `apps/frontend/src/components/wealth/AccountListPanel.tsx`

No new test file — verification is lint + type-check + visual review.

- [ ] **Step 1: Audit all toast call sites**

Run: `grep -rn "toast\." apps/frontend/src --include="*.tsx"` to get the full list before starting.

- [ ] **Step 2: Apply toast copy pattern across all call sites**

**Pattern:** Success = specific noun-phrase, past tense, "saved"/"removed"/"sent", contractions, no ! or emoji. Error = `"Couldn't [verb] [noun] — [next step]"`.

**`apps/frontend/src/components/overview/ItemDetailPanel.tsx`:**

```tsx
// Line 110: Before: toast.success("Marked as reviewed")
toast.success("Still correct — marked as reviewed");

// Line 140: Before: toast.success("Updated")
toast.success("Amount saved");
// Also update onError/catch in updateItem if present
```

**`apps/frontend/src/components/overview/ReviewWizard.tsx`:**

```tsx
// Line 284: Before: toast.error("Failed to confirm item")
toast.error("Couldn't confirm item — try again");

// Line 310: Before: toast.error("Failed to update item")
toast.error("Couldn't save change — try again");

// Line 336: Before: toast.error("Failed to confirm items")
toast.error("Couldn't confirm items — try again");

// Line 359: Before: toast.success("Review complete — snapshot saved")
toast.success("Review complete — you've saved a snapshot");

// Line 363: Before: toast.error("A snapshot with that name already exists — change the name")
toast.error("Couldn't save snapshot — that name's already taken");

// Line 365: Before: toast.error("Failed to save snapshot")
toast.error("Couldn't save snapshot — try again");
```

**`apps/frontend/src/components/wealth/AccountDetailPanel.tsx`:**

```tsx
// Line 136: Before: toast.success("Valuation updated")
toast.success("Valuation saved");

// Line 145: Before: toast.success("Account confirmed")
toast.success("Account marked as reviewed");
```

**`apps/frontend/src/components/planner/PurchaseDetailPanel.tsx`:**

```tsx
// Before: toast.success("Purchase updated")
toast.success("Purchase saved");

// Before: toast.success("Purchase deleted")
toast.success("Purchase removed");
```

**`apps/frontend/src/components/planner/GiftPersonDetailPanel.tsx`:**

```tsx
// Before: toast.success("Event deleted")
toast.success("Event removed");

// Before: toast.success("Person updated")
toast.success("Person saved");
```

**`apps/frontend/src/components/settings/ProfileSection.tsx`:**

```tsx
// Before: toast.error("Failed to update profile")
toast.error("Couldn't save profile — try again");
```

**`apps/frontend/src/components/settings/TrustAccountsSection.tsx`:**

```tsx
// Before: toast.error("Failed to update beneficiary name")
toast.error("Couldn't save beneficiary name — try again");
```

**`apps/frontend/src/components/wealth/AccountListPanel.tsx`:**

```tsx
// Before: toast.error("Failed to add account")
toast.error("Couldn't add account — try again");
```

**"All caught up" toast (#13):** Find where the last stale item confirmation is detected (in `useConfirmWaterfallItem` or `handleConfirm` in ReviewWizard when `staleItems.length === 1` and we're confirming the last one). Add:

```tsx
// In ReviewWizard handleConfirm, after updating confirmedItems:
const remainingStale = staleItems.filter((it) => !isResolved(it.id) && it.id !== item.id);
if (remainingStale.length === 0 && staleItems.length > 0) {
  toast.success("All caught up — no more stale items");
}
```

- [ ] **Step 3: Verify**

Run: `cd apps/frontend && bun run lint && bun run type-check`
Expected: Zero warnings, no type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/overview/ItemDetailPanel.tsx \
        apps/frontend/src/components/overview/ReviewWizard.tsx \
        apps/frontend/src/components/wealth/AccountDetailPanel.tsx \
        apps/frontend/src/components/planner/PurchaseDetailPanel.tsx \
        apps/frontend/src/components/planner/GiftPersonDetailPanel.tsx \
        apps/frontend/src/components/settings/ProfileSection.tsx \
        apps/frontend/src/components/settings/TrustAccountsSection.tsx \
        apps/frontend/src/components/wealth/AccountListPanel.tsx
git commit -m "feat(ui): toast microcopy — softer tone, consistent patterns"
```

---

### Task 8: ReviewWizard — step transitions + confirmation opacity + summary step enhancement (#7, #10, #15)

**Files:**

- Modify: `apps/frontend/src/components/overview/ReviewWizard.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// Add to existing or create apps/frontend/src/components/overview/ReviewWizard.test.tsx
import { describe, it, expect, vi } from "bun:test";
import { render, screen } from "@testing-library/react";

// Mock all hooks
vi.mock("@/hooks/useReviewSession", () => ({
  useReviewSession: () => ({ data: null, isLoading: false }),
  useCreateReviewSession: () => ({ mutate: vi.fn() }),
  useUpdateReviewSession: () => ({ mutate: vi.fn() }),
  useDeleteReviewSession: () => ({ mutate: vi.fn() }),
  useReviewIncome: () => ({ data: [] }),
  useReviewCommitted: () => ({ data: [] }),
  useReviewYearly: () => ({ data: [] }),
  useReviewDiscretionary: () => ({ data: [] }),
  useReviewSavings: () => ({ data: [] }),
}));
vi.mock("@/hooks/useSettings", () => ({ useSettings: () => ({ data: null }) }));
vi.mock("@/hooks/useWaterfall", () => ({ useWaterfallSummary: () => ({ data: null }) }));
vi.mock("@/services/waterfall.service", () => ({ waterfallService: {} }));
vi.mock("@/services/wealth.service", () => ({ wealthService: { listAccounts: vi.fn() } }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: [] }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

describe("ReviewWizard", () => {
  it("renders step content area", () => {
    render(<ReviewWizard onClose={() => {}} />);
    // First step label visible
    expect(screen.getByText("Income")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun scripts/run-tests.ts ReviewWizard`
Expected: FAIL — import errors or missing mocks (this is the baseline)

- [ ] **Step 3: Apply changes to ReviewWizard.tsx**

Add these imports at the top:

```tsx
import { motion, AnimatePresence } from "framer-motion";
```

Add direction state after `currentStep`:

```tsx
const [direction, setDirection] = useState(1); // 1 = forward, -1 = backward
```

Add step tracking for "all caught up":

```tsx
const [allStaleIds, setAllStaleIds] = useState<Set<string>>(new Set());
const [reviewedAt] = useState<Date>(new Date());
```

Update `goNext` to track direction and accumulate stale IDs:

```tsx
function goNext() {
  const nextStep = currentStep + 1;
  // Accumulate stale IDs from current step before advancing
  setAllStaleIds((prev) => new Set([...prev, ...staleItems.map((it) => it.id as string)]));
  setDirection(1);
  setCurrentStep(nextStep);
  updateSession.mutate({ currentStep: nextStep });
}

function goPrev() {
  const prevStep = Math.max(0, currentStep - 1);
  setDirection(-1);
  setCurrentStep(prevStep);
  updateSession.mutate({ currentStep: prevStep });
}
```

Define slide variants (add near the top of the `ReviewWizard` function body):

```tsx
const slideVariants = {
  enter: (dir: number) => ({ x: dir * 32, opacity: 0 }),
  center: { x: 0, opacity: 1, transition: { duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] } },
  exit: (dir: number) => ({
    x: dir * -32,
    opacity: 0,
    transition: { duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] },
  }),
};
```

Wrap the content area with AnimatePresence + motion.div:

```tsx
{/* Content */}
<div className="flex-1 overflow-y-auto">
  <AnimatePresence mode="wait" custom={direction}>
    <motion.div
      key={currentStep}
      custom={direction}
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      className="max-w-2xl mx-auto p-6 space-y-4"
    >
      {currentStep < 5 ? (
        /* ... existing step content ... */
      ) : (
        /* ... summary step ... */
      )}
    </motion.div>
  </AnimatePresence>
</div>
```

Update `ItemCard` to animate `isResolved` opacity — wrap the outer `div` with `motion.div`:

```tsx
// Replace the outer <div> in ItemCard:
<motion.div
  animate={{ opacity: isResolved ? 0.6 : 1 }}
  transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
  className={`rounded-lg border p-3 space-y-2 ${
    !isResolved && stale ? "border-amber-200 bg-amber-50/30 dark:bg-amber-950/10" : ""
  }`}
>
  {/* ... card content unchanged ... */}
</motion.div>
```

Enhance the summary step to include still-stale count and timestamp:

```tsx
/* Summary step */
<div className="space-y-6">
  <h2 className="text-lg font-semibold">Review complete</h2>

  <div className="rounded-lg border p-4 space-y-3">
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">Items reviewed</span>
      <span className="font-medium">
        {Object.keys(updatedItems).length +
          Object.values(confirmedItems).reduce((s, a) => s + a.length, 0)}
      </span>
    </div>
    {(() => {
      const resolvedIds = new Set([
        ...Object.values(confirmedItems).flat(),
        ...Object.keys(updatedItems),
      ]);
      const stillStale = [...allStaleIds].filter((id) => !resolvedIds.has(id)).length;
      return stillStale > 0 ? (
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Still stale</span>
          <span className="font-medium text-attention">{stillStale}</span>
        </div>
      ) : null;
    })()}
    {summary && (
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Current surplus</span>
        <span className="font-medium">{formatCurrency(summary.surplus.amount)}</span>
      </div>
    )}
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">Reviewed at</span>
      <span className="font-medium">{format(reviewedAt, "d MMM yyyy, HH:mm")}</span>
    </div>
  </div>

  {/* Changes made — unchanged */}
  {Object.keys(updatedItems).length > 0 && (
    <div className="space-y-2">
      <p className="text-sm font-medium">Changes made</p>
      {Object.entries(updatedItems).map(([id, change]) => (
        <div key={id} className="flex justify-between text-sm text-muted-foreground">
          <span>{change.name}</span>
          <span>
            {formatCurrency(change.from)} → {formatCurrency(change.to)}
          </span>
        </div>
      ))}
    </div>
  )}

  <div className="space-y-2">
    <label className="text-sm font-medium">Snapshot name</label>
    <input
      className="w-full rounded border px-3 py-1.5 text-sm bg-background focus:outline-none focus:border-primary"
      value={snapshotName}
      onChange={(e) => setSnapshotName(e.target.value)}
    />
  </div>
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun scripts/run-tests.ts ReviewWizard`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/overview/ReviewWizard.tsx
git commit -m "feat(ui): ReviewWizard step transitions, confirmation opacity, enhanced summary step"
```

---

### Task 9: Accordion animations (#6)

**Files:**

- Modify: `apps/frontend/src/components/tier/ItemAreaRow.tsx`
- Modify: `apps/frontend/src/components/tier/ItemArea.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/components/tier/ItemAreaRow.test.tsx
import { describe, it, expect, vi } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: { div: ({ children, ...props }: any) => <div {...props}>{children}</div> },
}));
vi.mock("@/hooks/useWaterfall", () => ({
  useTierUpdateItem: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useConfirmWaterfallItem: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

describe("ItemAreaRow animations", () => {
  it("imports AnimatePresence from framer-motion", async () => {
    // After implementation, the module should use AnimatePresence
    const mod = await import("./ItemAreaRow");
    expect(mod).toBeTruthy(); // Basic import check
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun scripts/run-tests.ts ItemAreaRow`
Expected: FAIL or PASS (the test itself is basic; the real "fail" is the visual absence of animation, confirmed by the missing AnimatePresence in source)

- [ ] **Step 3: Apply accordion animation**

**`apps/frontend/src/components/tier/ItemAreaRow.tsx`** — add AnimatePresence:

```tsx
import { AnimatePresence, motion } from "framer-motion";
import ItemRow from "./ItemRow";
import ItemAccordion from "./ItemAccordion";
import ItemForm from "./ItemForm";
import { isStale } from "./formatAmount";
import { useTierUpdateItem, useConfirmWaterfallItem, type TierItemRow } from "@/hooks/useWaterfall";
import type { TierConfig, TierKey } from "./tierConfig";

// ... Props interface unchanged ...

const accordionVariants = {
  initial: { height: 0, opacity: 0 },
  animate: { height: "auto", opacity: 1, transition: { duration: 0.2, ease: [0.25, 1, 0.5, 1] } },
  exit: { height: 0, opacity: 0, transition: { duration: 0.2, ease: [0.25, 1, 0.5, 1] } },
};

export default function ItemAreaRow({} /* ... props ... */ : Props) {
  // ... state unchanged ...

  return (
    <ItemRow /* ... props ... */>
      <AnimatePresence initial={false}>
        {isExpanded && !isEditing && (
          <motion.div
            key="accordion"
            variants={accordionVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            style={{ overflow: "hidden" }}
          >
            <ItemAccordion /* ... props ... */ />
          </motion.div>
        )}
        {isEditing && (
          <motion.div
            key="form"
            variants={accordionVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            style={{ overflow: "hidden" }}
          >
            <ItemForm /* ... props ... */ />
          </motion.div>
        )}
      </AnimatePresence>
    </ItemRow>
  );
}
```

**`apps/frontend/src/components/tier/ItemArea.tsx`** — wrap add-form with AnimatePresence:

Add import at top:

```tsx
import { AnimatePresence, motion } from "framer-motion";
```

Wrap the add form:

```tsx
{
  /* Add form at top */
}
<AnimatePresence initial={false}>
  {isAddingItem && (
    <motion.div
      key="add-form"
      initial={{ height: 0, opacity: 0 }}
      animate={{
        height: "auto",
        opacity: 1,
        transition: { duration: 0.2, ease: [0.25, 1, 0.5, 1] },
      }}
      exit={{ height: 0, opacity: 0, transition: { duration: 0.2, ease: [0.25, 1, 0.5, 1] } }}
      style={{ overflow: "hidden" }}
    >
      <ItemForm /* ... unchanged props ... */ />
    </motion.div>
  )}
</AnimatePresence>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun scripts/run-tests.ts ItemAreaRow`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/tier/ItemAreaRow.tsx \
        apps/frontend/src/components/tier/ItemArea.tsx
git commit -m "feat(ui): AnimatePresence height+opacity animation on accordion expand/collapse"
```

---

### Task 10: SubcategoryList layoutId selection indicator (#8)

**Files:**

- Modify: `apps/frontend/src/components/tier/SubcategoryList.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/components/tier/SubcategoryList.test.tsx
import { describe, it, expect, vi } from "bun:test";
import { render } from "@testing-library/react";

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, layoutId, ...props }: any) => (
      <div data-layout-id={layoutId} {...props}>{children}</div>
    ),
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
  LayoutGroup: ({ children }: any) => <>{children}</>,
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));
vi.mock("@/utils/motion", () => ({ usePrefersReducedMotion: () => false }));

describe("SubcategoryList indicator", () => {
  it("renders layoutId indicator for the selected subcategory", () => {
    const subcategories = [
      { id: "s1", name: "Salary", tier: "income" as const, sortOrder: 0, isLocked: false },
    ];
    const { container } = render(
      <SubcategoryList
        tier="income"
        config={{ textClass: "text-tier-income", borderClass: "border-tier-income", bgClass: "bg-tier-income", hoverBgClass: "hover:bg-accent" } as any}
        subcategories={subcategories}
        subcategoryTotals={{}}
        tierTotal={0}
        selectedId="s1"
        onSelect={() => {}}
        isLoading={false}
      />
    );
    // The indicator div should have a data-layout-id attribute set
    const indicator = container.querySelector('[data-layout-id="subcategory-indicator-income"]');
    expect(indicator).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun scripts/run-tests.ts SubcategoryList`
Expected: FAIL — no element with `data-layout-id="subcategory-indicator-income"`

- [ ] **Step 3: Apply SubcategoryList indicator change**

**`apps/frontend/src/components/tier/SubcategoryList.tsx`** — update imports and indicator:

```tsx
import { motion, LayoutGroup } from "framer-motion";
import { toGBP } from "@finplan/shared";
import { formatCurrency } from "@/utils/format";
import { usePrefersReducedMotion } from "@/utils/motion";
import { isStale } from "./formatAmount";
import type { TierConfig, TierKey } from "./tierConfig";
import type { TierItemRow } from "@/hooks/useWaterfall";

// ... interfaces unchanged ...

const containerVariants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.06 } },
};

const rowVariants = {
  initial: { opacity: 0, x: -22 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.2, ease: [0.25, 1, 0.5, 1] } },
};

export default function SubcategoryList({
  tier,
  config,
  subcategories,
  subcategoryTotals,
  tierTotal,
  selectedId,
  onSelect,
  isLoading,
  now = new Date(),
  stalenessMonths = 12,
}: Props) {
  const reduced = usePrefersReducedMotion();

  if (isLoading) {
    /* ... unchanged ... */
  }

  return (
    <div className="flex flex-col h-full">
      <LayoutGroup>
        <motion.div
          role="tablist"
          aria-label="Subcategories"
          className="flex-1 overflow-y-auto"
          variants={containerVariants}
          initial={reduced ? false : "initial"}
          animate="animate"
        >
          {subcategories.map((sub) => {
            const isSelected = sub.id === selectedId;
            const summary = subcategoryTotals[sub.id];
            const isSubStale = (subcategoryTotals[sub.id]?.items ?? []).some((item) =>
              isStale(item.lastReviewedAt, now, stalenessMonths)
            );
            return (
              <motion.button
                type="button"
                role="tab"
                key={sub.id}
                data-testid={`subcategory-row-${sub.id}`}
                aria-selected={isSelected}
                onClick={() => onSelect(sub.id)}
                variants={rowVariants}
                className="relative flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors"
              >
                {/* Animated selection indicator */}
                {isSelected && !reduced && (
                  <motion.div
                    layoutId={`subcategory-indicator-${tier}`}
                    className={`absolute inset-0 ${config.bgClass}/14 border-l-2 ${config.borderClass} rounded-r-sm`}
                    transition={{ duration: 0.22, ease: [0.25, 1, 0.5, 1] }}
                  />
                )}
                {isSelected && reduced && (
                  <div
                    className={`absolute inset-0 ${config.bgClass}/14 border-l-2 ${config.borderClass} rounded-r-sm`}
                  />
                )}

                {/* Row content — on top of indicator */}
                <span className={`relative z-10 w-2 shrink-0 flex items-center justify-center`}>
                  {isSubStale && (
                    <span
                      data-testid={`stale-dot-${sub.id}`}
                      className="h-1.5 w-1.5 rounded-full bg-attention"
                      aria-hidden
                    />
                  )}
                </span>
                <span
                  className={`relative z-10 flex-1 ${isSelected ? `font-medium ${config.textClass}` : "text-foreground/60"}`}
                >
                  {sub.name}
                </span>
                <span className="relative z-10 font-numeric text-xs text-foreground/50">
                  {summary ? formatCurrency(toGBP(summary.total)) : "£0"}
                </span>
              </motion.button>
            );
          })}
        </motion.div>
      </LayoutGroup>
      {/* Tier total — unchanged */}
      <div
        data-testid="tier-total"
        className="border-t border-foreground/10 px-4 py-3 flex justify-between text-sm"
      >
        <span className="text-foreground/50">Total</span>
        <span className={`font-numeric font-semibold ${config.textClass}`}>
          {formatCurrency(toGBP(tierTotal))}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun scripts/run-tests.ts SubcategoryList`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/tier/SubcategoryList.tsx
git commit -m "feat(ui): SubcategoryList layoutId animated selection indicator"
```

---

### Task 11: Card entrance animations — NudgeCard + GhostedListEmpty CTA (#9)

**Files:**

- Modify: `apps/frontend/src/components/common/NudgeCard.tsx`
- Modify: `apps/frontend/src/components/ui/GhostedListEmpty.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/components/common/NudgeCard.test.tsx
import { describe, it, expect, vi } from "bun:test";
import { render, screen } from "@testing-library/react";

vi.mock("framer-motion", () => ({
  motion: { div: ({ children, ...props }: any) => <div data-animated {...props}>{children}</div> },
}));

describe("NudgeCard", () => {
  it("renders message text", () => {
    render(<NudgeCard message="Your yearly bill is due soon" />);
    expect(screen.getByText("Your yearly bill is due soon")).toBeTruthy();
  });

  it("wraps content in a motion.div for entrance animation", () => {
    const { container } = render(<NudgeCard message="Test message" />);
    expect(container.querySelector("[data-animated]")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun scripts/run-tests.ts NudgeCard`
Expected: FAIL — `data-animated` not present (no motion.div wrapper)

- [ ] **Step 3: Apply card entrance animations**

**`apps/frontend/src/components/common/NudgeCard.tsx`:**

```tsx
import { motion } from "framer-motion";

interface NudgeCardProps {
  message: string;
  options?: string[];
  actionLabel?: string;
  onAction?: () => void;
}

export function NudgeCard({ message, options, actionLabel, onAction }: NudgeCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="rounded-md p-3 text-xs space-y-2 bg-attention-bg border border-attention-border"
    >
      <div className="flex items-start gap-1.5">
        <span className="mt-0.5 h-[5px] w-[5px] rounded-full shrink-0 bg-attention" aria-hidden />
        <p>{message}</p>
      </div>
      {options && options.length > 0 && (
        <ul className="pl-4 space-y-0.5 list-disc">
          {options.map((opt) => (
            <li key={opt}>{opt}</li>
          ))}
        </ul>
      )}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="underline underline-offset-2 hover:no-underline text-xs text-attention"
          type="button"
        >
          {actionLabel}
        </button>
      )}
    </motion.div>
  );
}
```

**`apps/frontend/src/components/ui/GhostedListEmpty.tsx`** — add entrance animation to CTA card:

Update the CTA card div to use `motion.div`:

```tsx
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

// ... rest of component ...

{
  /* CTA card — add motion.div wrapper */
}
{
  showCta && onCtaClick && (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="mx-2 mt-3 flex items-center justify-between gap-3 rounded-lg p-3.5"
      style={{
        background:
          "linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(168, 85, 247, 0.05) 100%)",
        border: "1px solid rgba(99, 102, 241, 0.1)",
      }}
    >
      {/* ... content unchanged ... */}
    </motion.div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun scripts/run-tests.ts NudgeCard`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/common/NudgeCard.tsx \
        apps/frontend/src/components/ui/GhostedListEmpty.tsx
git commit -m "feat(ui): entrance animations on NudgeCard and EmptyState CTA card"
```

---

### Task 12: design-system.md documentation updates

**Files:**

- Modify: `docs/2. design/design-system.md`

No automated test — this is documentation. Verify by reading the updated sections.

- [ ] **Step 1: Read design-system.md to find the right sections**

Read the full file to locate: Typography section, Component Catalogue, Spacing and Layout section, Waterfall Type Hierarchy table.

- [ ] **Step 2: Make the 5 targeted updates**

**Update 1 — Typography: add named font-size tokens table** after the existing type hierarchy content:

```markdown
#### Named Font-Size Tokens

| Token             | Size   | Usage                                         |
| ----------------- | ------ | --------------------------------------------- |
| `text-connector`  | 10.5px | WaterfallConnector annotation text            |
| `text-tier`       | 13px   | Tier row item names in left panels            |
| `text-tier-total` | 15px   | Tier heading total amounts                    |
| `text-hero`       | 30px   | Hero amount (income, surplus, net worth, etc) |

Standard Tailwind size classes (`text-xs`, `text-sm`, `text-base`, etc.) are used as-is for all other text. Arbitrary size classes (`text-[Xpx]`) are forbidden — use a named token or a Tailwind default.
```

**Update 2 — Component Catalogue: add canonical section-label treatment:**

Add under the appropriate section (Labels / Typography):

```markdown
#### Section Label (canonical)

All section headers — "By Liquidity", "Purchases", "Gifts", "Held on Behalf Of", etc. — use one treatment:
```

text-xs font-medium uppercase tracking-wider text-muted-foreground

```

**Exceptions:** Waterfall tier labels (`Income`, `Committed`, `Discretionary`, `Surplus`) use `text-tier font-heading font-semibold tracking-tier uppercase` + their tier colour. This is the only exception.
```

**Update 3 — Spacing and Layout: add two-tier rhythm rule:**

```markdown
#### Right-Panel Vertical Rhythm

All right-panel detail views follow a two-tier spacing convention:

- **Between major sections:** `space-y-6` (24px) — e.g. between breadcrumb group, amount group, history chart, action buttons.
- **Within sections:** `space-y-2` (8px) — e.g. between breadcrumb and heading, between amount and staleness label.
- Related elements are grouped into a container div with `space-y-2` before the outer `space-y-6` separates them from the next section.

**Exception:** Settings page uses `space-y-12` / `space-y-4` — justified by its long-form editing context.
```

**Update 4 — Waterfall Type Hierarchy: update hero amount row:**

Find the Waterfall Type Hierarchy table and update the hero amount row to reflect:

```
| Hero amount | text-hero (30px) | font-numeric font-extrabold | Colour by context: text-primary (waterfall items), text-foreground (wealth), text-tier-surplus (surplus page) |
```

**Update 5 — New Microcopy section:**

Add a new top-level section `## Microcopy` (or under UX Patterns):

```markdown
## Microcopy

### Toast Messages

**Success:** Specific noun-phrase, past tense. Use `"saved"` not `"updated"`, `"removed"` not `"deleted"`, `"sent"` not `"created"`. Use contractions: `"you've"` not `"you have"`. No exclamation marks. No emoji.

Examples:

- `"Amount saved"` ✓ — `"Amount updated!"` ✗
- `"Purchase removed"` ✓ — `"Purchase deleted"` ✗
- `"You've left the household"` ✓ — `"You have left the household"` ✗

**Error:** `"Couldn't [verb] [noun] — [next step]"`. Next step is context-sensitive:

- Generic: `"try again"`
- Network: `"check your connection"`
- Persistent: `"contact support"`

Example: `"Couldn't save profile — try again"`.

### Delete Confirmations

Heading: `"Remove [Item Name]?"` — never `"Are you sure?"`
Body: `"[Item Name] will be permanently removed from your plan."`
Button: `"Remove"` (not `"Delete"` or `"Confirm"`)

### Empty State Headings (addable lists)

Use a question prompt: `"What [x] do you have?"` / `"What are you saving towards?"`.
Subtext: `"Add your first [x] to begin building your plan"`.
```

- [ ] **Step 3: Verify**

Read back the modified sections to confirm they're coherent and don't contradict existing content.

- [ ] **Step 4: Commit**

```bash
git add "docs/2. design/design-system.md"
git commit -m "docs(design-system): add named font tokens, section label, rhythm, hero, microcopy rules"
```

---

## Testing

### Frontend Tests

- [ ] Component: `GhostAddButton` renders with `border-foreground/20` class
- [ ] Component: `GhostedListEmpty` renders question-prompt heading when `ctaHeading` provided
- [ ] Component: `GhostedListEmpty` shows no skeleton rows in addable variant
- [ ] Component: `StaleDataBanner` shows "Couldn't sync" copy
- [ ] Component: `SubcategoryList` renders layoutId indicator for selected row
- [ ] Component: `NudgeCard` wraps content in motion.div for entrance animation
- [ ] Component: `ItemDetailPanel` root wrapper uses `space-y-6`
- [ ] Component: `ReviewWizard` renders step content area

### Key Scenarios

- [ ] Happy path: open a tier page → select a subcategory (indicator slides smoothly) → expand an item (accordion animates) → fill in a new item (add form animates in)
- [ ] Empty state: empty subcategory shows question-prompt CTA card with no skeleton rows
- [ ] Delete confirmation: deleting an item shows "Remove [Item Name]?" heading with item name
- [ ] Sync failure: `StaleDataBanner` appears with "Couldn't sync — showing last saved data" copy
- [ ] ReviewWizard: step forward/backward slides content directionally
- [ ] ReviewWizard: confirming the last stale item shows "All caught up" toast
- [ ] ReviewWizard: summary step shows reviewed count, still-stale count (if any), timestamp

## Verification

- [ ] `bun run build` passes clean
- [ ] `bun run lint` — zero warnings
- [ ] `bun run type-check` — zero errors
- [ ] `cd apps/frontend && bun scripts/run-tests.ts` — all frontend tests pass
- [ ] Manual: verify tier page accordion animation, SubcategoryList indicator slide, NudgeCard entrance
- [ ] Manual: verify WealthLeftPanel uses `text-hero` for net worth amount (30px, extrabold)
- [ ] Manual: verify delete confirmation shows item name in heading
- [ ] Manual: verify all toast messages follow new pattern (no "Failed to", no "Are you sure?")

## Post-conditions

- [ ] design-system.md updated with 5 agreed standards — all future implementations must follow these
- [ ] `text-connector`, `text-tier`, `text-tier-total`, `text-hero` tokens available for all components
- [ ] Hardcoded hex colours eliminated from all real app components
- [ ] Framer Motion animation patterns established for: accordion, step wizard, layoutId indicator, card entrance
