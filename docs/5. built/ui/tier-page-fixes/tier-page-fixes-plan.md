---
feature: tier-page-fixes
category: ui
spec: docs/4. planning/tier-page-fixes/tier-page-fixes-spec.md
creation_date: 2026-03-27
status: implemented
implemented_date: 2026-07-05
---

# Tier Page Fixes — Implementation Plan

> **For Claude:** Use `/execute-plan tier-page-fixes` to implement this plan task-by-task.

> **Purpose:** An ordered, task-by-task build guide. Each task follows TDD red-green-commit and contains complete, ready-to-run code — no "implement X" placeholders. This is the input to `/execute-plan`. The spec defines _what_ to build; this plan defines _how_.

**Goal:** Correct six categories of visual deviation in tier pages — adopt TwoPanelLayout, standardise ambient glows via CSS, fix empty state tokens, use tier-coloured hover states, and add `data-page` attributes.
**Spec:** `docs/4. planning/tier-page-fixes/tier-page-fixes-spec.md`
**Architecture:** Frontend-only changes. CSS glow rules are rewritten to a new `[data-page]` standard using fixed-position pseudo-elements with corner-anchored radial gradients. TierPage wraps its two children in the existing `TwoPanelLayout` component. Inline glow `<div>` elements are removed from TierPage and SurplusPage. Token corrections applied to GhostedListEmpty and SubcategoryList hover states.
**Tech Stack:** React 18 · Tailwind · CSS
**Infrastructure Impact:**

- Touches `packages/shared/`: no
- Requires DB migration: no

## Pre-conditions

- [x] `TwoPanelLayout` component exists at `apps/frontend/src/components/layout/TwoPanelLayout.tsx`
- [x] `data-page` attributes already exist on Overview (`data-page="overview"`) and Settings (`data-page="settings"`)
- [x] Help nav item already in `NAV_ITEMS_GROUP3` at correct position (Goals · Gifts · Help)
- [ ] Existing uncommitted changes on `implementation` branch should be committed or stashed before starting

## Tasks

---

### Task 1: Rewrite ambient glow CSS rules

**Files:**

- Modify: `apps/frontend/src/index.css:334-398`

- [ ] **Step 1: Write the failing test**

No unit test — CSS glow pseudo-elements are not rendered in JSDOM. Verified visually in the verification section.

- [ ] **Step 2: Replace the `/* ===== Page Ambient Glows ===== */` section**

Replace lines 334–398 of `apps/frontend/src/index.css` (the entire Page Ambient Glows section) with:

```css
/* ===== Page Ambient Glows ===== */
[data-page]::before,
[data-page]::after {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}

/* Overview: indigo top-right + violet bottom-left */
[data-page="overview"]::before {
  background: radial-gradient(ellipse at 100% 0%, rgba(99, 102, 241, 0.09) 0%, transparent 25%);
}
[data-page="overview"]::after {
  background: radial-gradient(ellipse at 0% 100%, rgba(139, 92, 246, 0.05) 0%, transparent 25%);
}

/* Income: blue top-right + indigo bottom-left */
[data-page="income"]::before {
  background: radial-gradient(ellipse at 100% 0%, rgba(14, 165, 233, 0.09) 0%, transparent 25%);
}
[data-page="income"]::after {
  background: radial-gradient(ellipse at 0% 100%, rgba(99, 102, 241, 0.05) 0%, transparent 25%);
}

/* Committed: indigo top-right + purple bottom-left */
[data-page="committed"]::before {
  background: radial-gradient(ellipse at 100% 0%, rgba(99, 102, 241, 0.09) 0%, transparent 25%);
}
[data-page="committed"]::after {
  background: radial-gradient(ellipse at 0% 100%, rgba(168, 85, 247, 0.05) 0%, transparent 25%);
}

/* Discretionary: purple top-right + teal bottom-left */
[data-page="discretionary"]::before {
  background: radial-gradient(ellipse at 100% 0%, rgba(168, 85, 247, 0.09) 0%, transparent 25%);
}
[data-page="discretionary"]::after {
  background: radial-gradient(ellipse at 0% 100%, rgba(74, 220, 208, 0.05) 0%, transparent 25%);
}

/* Surplus: teal top-right + indigo bottom-left */
[data-page="surplus"]::before {
  background: radial-gradient(ellipse at 100% 0%, rgba(74, 220, 208, 0.09) 0%, transparent 25%);
}
[data-page="surplus"]::after {
  background: radial-gradient(ellipse at 0% 100%, rgba(99, 102, 241, 0.05) 0%, transparent 25%);
}

/* Settings: neutral top-right only, no secondary */
[data-page="settings"]::before {
  background: radial-gradient(ellipse at 100% 0%, rgba(238, 242, 255, 0.04) 0%, transparent 25%);
}
```

Key changes from old rules:

- Base rule gains `inset: 0` — pseudo-elements fill viewport, gradient fade at 25% handles containment
- All pages use `ellipse at [corner]` with 25% fade (was sized boxes at 65% fade)
- Old `width`/`height`/`top`/`right`/`bottom`/`left` positioning removed
- `[data-page="wealth"]` and `[data-page="planner"]` rules removed entirely
- Overview opacities corrected: 6%/3.5% → 9%/5%
- New rules for `income`, `committed`, `discretionary`, `surplus`
- Settings corrected: `rgba(148, 163, 184, 0.025)` → `rgba(238, 242, 255, 0.04)`

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/index.css
git commit -m "fix(ui): rewrite ambient glow CSS to new corner-contained standard"
```

---

### Task 2: TierPage — adopt TwoPanelLayout and add data-page

**Files:**

- Modify: `apps/frontend/src/components/tier/TierPage.tsx`
- Test: `apps/frontend/src/components/tier/TierPage.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `apps/frontend/src/components/tier/TierPage.test.tsx`:

```typescript
it("sets data-page attribute matching the tier", () => {
  renderTierPage();
  const page = screen.getByTestId("tier-page-committed");
  expect(page.getAttribute("data-page")).toBe("committed");
});

it("renders subcategories inside a left aside panel", () => {
  renderTierPage();
  const aside = document.querySelector("aside");
  expect(aside).toBeTruthy();
  expect(aside!.querySelector("[role='tablist']")).toBeTruthy();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/frontend && bun scripts/run-tests.ts TierPage`
Expected: FAIL — `data-page` attribute returns null; no `aside` element found

- [ ] **Step 3: Write minimal implementation**

Full replacement of `apps/frontend/src/components/tier/TierPage.tsx`:

```typescript
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import SubcategoryList from "./SubcategoryList";
import ItemArea from "./ItemArea";
import { TwoPanelLayout } from "@/components/layout/TwoPanelLayout";
import { useSubcategories, useTierItems, type TierItemRow } from "@/hooks/useWaterfall";
import { TIER_CONFIGS, type TierKey } from "./tierConfig";

interface TierPageProps {
  tier: TierKey;
}

interface SubcategorySummary {
  subcategoryId: string;
  name: string;
  total: number;
  items: TierItemRow[];
}

export default function TierPage({ tier }: TierPageProps) {
  const config = TIER_CONFIGS[tier];
  const [searchParams] = useSearchParams();
  const { data: subcategories, isLoading: subsLoading } = useSubcategories(tier);
  const { data: allItems, isLoading: itemsLoading } = useTierItems(tier);

  // Group items by subcategoryId and compute monthly totals
  const subcategoryTotals = useMemo<Record<string, SubcategorySummary>>(() => {
    if (!subcategories || !allItems) return {};
    const nameMap = Object.fromEntries(subcategories.map((s) => [s.id, s.name]));
    const groups: Record<string, SubcategorySummary> = {};
    for (const item of allItems) {
      const sid = item.subcategoryId;
      if (!groups[sid]) {
        groups[sid] = {
          subcategoryId: sid,
          name: nameMap[sid] ?? "",
          total: 0,
          items: [],
        };
      }
      const monthly = item.spendType === "monthly" ? item.amount : Math.round(item.amount / 12);
      groups[sid].total += monthly;
      groups[sid].items.push(item);
    }
    return groups;
  }, [subcategories, allItems]);

  const tierTotal = Object.values(subcategoryTotals).reduce((sum, s) => sum + s.total, 0);

  // Select subcategory: URL param → first in list
  const paramId = searchParams.get("subcategory");
  const defaultId = subcategories?.[0]?.id ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(paramId ?? defaultId);

  // Sync selected to default once subcategories load
  const resolvedSelectedId =
    selectedId && subcategories?.some((s) => s.id === selectedId)
      ? selectedId
      : (subcategories?.[0]?.id ?? null);

  const selectedSubcategory = subcategories?.find((s) => s.id === resolvedSelectedId) ?? null;
  const selectedSummary = resolvedSelectedId
    ? (subcategoryTotals[resolvedSelectedId] ?? null)
    : null;

  return (
    <div data-page={tier} data-testid={`tier-page-${tier}`} className="h-full">
      <TwoPanelLayout
        left={
          <SubcategoryList
            tier={tier}
            config={config}
            subcategories={subcategories ?? []}
            subcategoryTotals={subcategoryTotals}
            tierTotal={tierTotal}
            selectedId={resolvedSelectedId}
            onSelect={setSelectedId}
            isLoading={subsLoading}
          />
        }
        right={
          <ItemArea
            tier={tier}
            config={config}
            subcategory={selectedSubcategory}
            subcategories={(subcategories ?? []).map((s) => ({ id: s.id, name: s.name }))}
            items={selectedSummary?.items ?? []}
            isLoading={itemsLoading}
          />
        }
      />
    </div>
  );
}
```

Changes from original:

- Added import for `TwoPanelLayout`
- Removed inline glow `<div aria-hidden>` (now CSS-driven via `[data-page]`)
- Added `data-page={tier}` attribute to outer div
- Changed className from `"relative min-h-screen"` to `"h-full"`
- Wrapped `SubcategoryList` and `ItemArea` in `TwoPanelLayout` (left/right)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/frontend && bun scripts/run-tests.ts TierPage`
Expected: PASS — all 6 tests (4 existing + 2 new)

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/tier/TierPage.tsx apps/frontend/src/components/tier/TierPage.test.tsx
git commit -m "fix(tier): adopt TwoPanelLayout and add data-page attribute"
```

---

### Task 3: SurplusPage — add data-page and remove inline glow

**Files:**

- Modify: `apps/frontend/src/pages/SurplusPage.tsx`
- Test: `apps/frontend/src/pages/SurplusPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `apps/frontend/src/pages/SurplusPage.test.tsx` (inside the first `describe` block):

```typescript
it("sets data-page attribute to surplus", () => {
  renderWithProviders(<SurplusPage />, { initialEntries: ["/surplus"] });
  const page = screen.getByTestId("surplus-page");
  expect(page.getAttribute("data-page")).toBe("surplus");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun scripts/run-tests.ts SurplusPage`
Expected: FAIL — `data-page` attribute returns null

- [ ] **Step 3: Write minimal implementation**

In `apps/frontend/src/pages/SurplusPage.tsx`:

1. Change the outer div (line 19) from:

```tsx
<div data-testid="surplus-page" className="relative min-h-screen">
```

to:

```tsx
<div data-page="surplus" data-testid="surplus-page" className="h-full">
```

2. Remove the inline glow div (lines 20-27):

```tsx
<div
  aria-hidden
  className="pointer-events-none absolute inset-0 -z-10"
  style={{
    background:
      "radial-gradient(ellipse 60% 40% at 20% 20%, rgba(20,184,166,0.08) 0%, transparent 70%)",
  }}
/>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/frontend && bun scripts/run-tests.ts SurplusPage`
Expected: PASS — all 7 tests (6 existing + 1 new)

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/SurplusPage.tsx apps/frontend/src/pages/SurplusPage.test.tsx
git commit -m "fix(surplus): add data-page attribute and remove inline glow"
```

---

### Task 4: SubcategoryList — tier-coloured hover

**Files:**

- Modify: `apps/frontend/src/components/tier/tierConfig.ts`
- Modify: `apps/frontend/src/components/tier/SubcategoryList.tsx:77`
- Test: `apps/frontend/src/components/tier/SubcategoryList.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `apps/frontend/src/components/tier/SubcategoryList.test.tsx`:

```typescript
it("unselected row uses tier colour for hover background", () => {
  renderList("sub-housing");
  const unselected = screen.getByTestId("subcategory-row-sub-utilities");
  expect(unselected.className).toContain("hover:bg-tier-committed/5");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun scripts/run-tests.ts SubcategoryList`
Expected: FAIL — className contains `hover:bg-foreground/5`, not `hover:bg-tier-committed/5`

- [ ] **Step 3: Write minimal implementation**

In `apps/frontend/src/components/tier/tierConfig.ts`, add `hoverBgClass` to the interface and each config:

```typescript
// Tier colours and labels for use in TierPage and child components
export type TierKey = "income" | "committed" | "discretionary";

export interface TierConfig {
  tier: TierKey;
  label: string;
  /** Tailwind text colour class for the tier */
  textClass: string;
  /** Tailwind bg colour class at low opacity (for hover/selected states) */
  bgClass: string;
  /** Tailwind border colour class (for selected left border) */
  borderClass: string;
  /** Tailwind hover bg class at 5% opacity (for unselected subcategory rows) */
  hoverBgClass: string;
}

export const TIER_CONFIGS: Record<TierKey, TierConfig> = {
  income: {
    tier: "income",
    label: "Income",
    textClass: "text-tier-income",
    bgClass: "bg-tier-income",
    borderClass: "border-tier-income",
    hoverBgClass: "hover:bg-tier-income/5",
  },
  committed: {
    tier: "committed",
    label: "Committed",
    textClass: "text-tier-committed",
    bgClass: "bg-tier-committed",
    borderClass: "border-tier-committed",
    hoverBgClass: "hover:bg-tier-committed/5",
  },
  discretionary: {
    tier: "discretionary",
    label: "Discretionary",
    textClass: "text-tier-discretionary",
    bgClass: "bg-tier-discretionary",
    borderClass: "border-tier-discretionary",
    hoverBgClass: "hover:bg-tier-discretionary/5",
  },
};
```

In `apps/frontend/src/components/tier/SubcategoryList.tsx`, change line 77 from:

```typescript
: "border-l-2 border-transparent text-foreground/60 hover:bg-foreground/5",
```

to:

```typescript
: `border-l-2 border-transparent text-foreground/60 ${config.hoverBgClass}`,
```

Note: The full hover class is stored as a string literal in `tierConfig.ts` so Tailwind's JIT scanner can find it. Dynamic interpolation like `hover:${config.bgClass}/5` would not be scanned.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/frontend && bun scripts/run-tests.ts SubcategoryList`
Expected: PASS — all 7 tests (6 existing + 1 new)

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/tier/tierConfig.ts apps/frontend/src/components/tier/SubcategoryList.tsx apps/frontend/src/components/tier/SubcategoryList.test.tsx
git commit -m "fix(tier): use tier colour for subcategory hover background"
```

---

### Task 5: GhostedListEmpty — correct CTA card gradient

**Files:**

- Modify: `apps/frontend/src/components/ui/GhostedListEmpty.tsx:52`
- Test: `apps/frontend/src/components/tier/ItemArea.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `apps/frontend/src/components/tier/ItemArea.test.tsx`:

```typescript
it("empty state CTA card uses correct gradient opacity", () => {
  const { container } = renderArea([]);
  const allElements = container.querySelectorAll("*");
  const ctaCard = Array.from(allElements).find((el) =>
    (el as HTMLElement).style?.background?.includes("linear-gradient")
  ) as HTMLElement;
  expect(ctaCard).toBeTruthy();
  expect(ctaCard.style.background).toContain("0.08");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun scripts/run-tests.ts ItemArea`
Expected: FAIL — style contains `0.07` instead of `0.08`

- [ ] **Step 3: Write minimal implementation**

In `apps/frontend/src/components/ui/GhostedListEmpty.tsx`, line 52, change:

```
rgba(99, 102, 241, 0.07)
```

to:

```
rgba(99, 102, 241, 0.08)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/frontend && bun scripts/run-tests.ts ItemArea`
Expected: PASS — all 8 tests (7 existing + 1 new)

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/ui/GhostedListEmpty.tsx apps/frontend/src/components/tier/ItemArea.test.tsx
git commit -m "fix(ui): correct GhostedListEmpty CTA card gradient opacity"
```

## Testing

### Frontend Tests

- [ ] TierPage: sets `data-page` attribute matching tier name
- [ ] TierPage: renders subcategory list inside a left aside panel (TwoPanelLayout)
- [ ] TierPage: existing tests pass (shell, subcategory names, selection, URL param)
- [ ] SurplusPage: sets `data-page="surplus"`
- [ ] SurplusPage: existing tests pass (surplus amount, breakdown, right panel, benchmark)
- [ ] SubcategoryList: unselected rows use `hover:bg-tier-{colour}/5`
- [ ] SubcategoryList: existing tests pass (rows, selection, totals, staleness)
- [ ] ItemArea: empty state CTA card uses `0.08` gradient opacity
- [ ] ItemArea: existing tests pass (header, rows, add form, accordion)

### Key Scenarios

- [ ] Happy path: Income, Committed, Discretionary pages show TwoPanelLayout — subcategories left (360px), items right (fill)
- [ ] Surplus page retains its bespoke TwoPanelLayout layout (not affected by Task 2)
- [ ] All pages show correct ambient glow colours — corner-contained, not full-viewport diffuse
- [ ] Overview and Settings pages retain their existing `data-page` and glow behaviour
- [ ] Empty subcategory shows GhostedListEmpty with corrected gradient

## Verification

- [ ] `bun run build` passes clean
- [ ] `bun run lint` — zero warnings
- [ ] `bun run type-check` — no errors
- [ ] `cd apps/frontend && bun scripts/run-tests.ts TierPage` passes
- [ ] `cd apps/frontend && bun scripts/run-tests.ts SurplusPage` passes
- [ ] `cd apps/frontend && bun scripts/run-tests.ts SubcategoryList` passes
- [ ] `cd apps/frontend && bun scripts/run-tests.ts ItemArea` passes
- [ ] Manual: navigate to Income, Committed, Discretionary — verify TwoPanelLayout (360px left panel + fill right panel)
- [ ] Manual: verify ambient glows — each page shows tier colour glow at top-right corner, fading naturally
- [ ] Manual: hover over unselected subcategory rows — verify tier-coloured tint (not generic foreground)
- [ ] Manual: navigate to Surplus — verify glow appears, layout unchanged
- [ ] Manual: navigate to Overview and Settings — verify glows are correct (not too diffuse)
- [ ] Manual: view empty subcategory — verify CTA card gradient is subtle but visible

## Post-conditions

- [ ] All tier pages visually consistent with design system and navigation-and-page-structure design doc
- [ ] Ambient glow standard established — future pages can add glows by setting `data-page` and adding one CSS rule
- [ ] Old `wealth` and `planner` glow CSS rules removed
