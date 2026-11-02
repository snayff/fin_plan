---
feature: tier-page-entry-animation
category: ui
spec: docs/4. planning/tier-page-entry-animation/tier-page-entry-animation-spec.md
creation_date: 2026-03-28
status: implemented
implemented_date: 2026-07-05
---

# Tier Page Entry Animation — Implementation Plan

> **For Claude:** Use `/execute-plan tier-page-entry-animation` to implement this plan task-by-task.

> **Purpose:** An ordered, task-by-task build guide. Each task follows TDD red-green-commit and contains complete, ready-to-run code — no "implement X" placeholders. This is the input to `/execute-plan`. The spec defines _what_ to build; this plan defines _how_.

**Goal:** Add a staggered horizontal entrance animation to subcategory rows in `SubcategoryList` on tier page mount.
**Spec:** `docs/4. planning/tier-page-entry-animation/tier-page-entry-animation-spec.md`
**Architecture:** Single component change — `SubcategoryList.tsx`. The `div[role="tablist"]` container becomes a `motion.div` with `staggerChildren: 0.06`; each subcategory `button` becomes a `motion.button` carrying `x: -22 → 0, opacity: 0 → 1` variants. Follows the exact pattern established by `WaterfallLeftPanel`. The tier header and Total footer are untouched.
**Tech Stack:** Fastify · Prisma · tRPC · Zod · React 18 · TanStack Query · Zustand · Tailwind

**Infrastructure Impact:**

- Touches `packages/shared/`: no
- Requires DB migration: no

## Pre-conditions

- [ ] `framer-motion` is installed in `apps/frontend` (already at `^11.15.0`)
- [ ] `usePrefersReducedMotion` hook exists at `apps/frontend/src/utils/motion.ts` (already present)

## Tasks

---

### Task 1: Stagger subcategory rows in SubcategoryList

**Files:**

- Modify: `apps/frontend/src/components/tier/SubcategoryList.tsx`
- Modify: `apps/frontend/src/components/tier/SubcategoryList.test.tsx`

- [ ] **Step 1: Write the failing test**

Add at the top of `SubcategoryList.test.tsx` (before existing imports), then add the new test case inside the existing `describe` block:

```typescript
import { describe, it, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import SubcategoryList from "./SubcategoryList";
import { TIER_CONFIGS } from "./tierConfig";

// Mock framer-motion so animation props don't affect DOM queries
mock.module("framer-motion", () => {
  const React = require("react");
  return {
    motion: {
      div: ({ children, variants: _v, initial: _i, animate: _a, ...props }: any) =>
        React.createElement("div", props, children),
      button: ({ children, variants: _v, initial: _i, animate: _a, ...props }: any) =>
        React.createElement("button", props, children),
    },
  };
});

// Spy to verify the hook is consumed by the component
const motionUtils = { usePrefersReducedMotion: mock(() => false) };
mock.module("@/utils/motion", () => motionUtils);

// ... (rest of existing test file unchanged, add new test inside describe block:)

it("calls usePrefersReducedMotion to respect reduced motion preference", () => {
  motionUtils.usePrefersReducedMotion.mockClear();
  renderList();
  expect(motionUtils.usePrefersReducedMotion).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test SubcategoryList`
Expected: FAIL — `expect(received).toHaveBeenCalled()` — the component does not yet call `usePrefersReducedMotion`

- [ ] **Step 3: Write minimal implementation**

Replace `apps/frontend/src/components/tier/SubcategoryList.tsx` with:

```typescript
import { motion } from "framer-motion";
import { toGBP } from "@finplan/shared";
import { formatCurrency } from "@/utils/format";
import { usePrefersReducedMotion } from "@/utils/motion";
import { isStale } from "./formatAmount";
import type { TierConfig, TierKey } from "./tierConfig";
import type { TierItemRow } from "@/hooks/useWaterfall";

interface SubcategoryRow {
  id: string;
  name: string;
  tier: TierKey;
  sortOrder: number;
  isLocked: boolean;
}

interface SubcategorySummary {
  subcategoryId: string;
  name: string;
  total: number;
  items: TierItemRow[];
}

interface Props {
  tier: TierKey;
  config: TierConfig;
  subcategories: SubcategoryRow[];
  subcategoryTotals: Record<string, SubcategorySummary>;
  tierTotal: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  isLoading: boolean;
  now?: Date;
  stalenessMonths?: number;
}

const containerVariants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.06 } },
};

const rowVariants = {
  initial: { opacity: 0, x: -22 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.2, ease: [0.25, 1, 0.5, 1] } },
};

export default function SubcategoryList({
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
    return (
      <div className="flex flex-col gap-2 p-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 animate-pulse rounded bg-foreground/5" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
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
              className={[
                "flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors",
                isSelected
                  ? `border-l-2 ${config.borderClass} ${config.bgClass}/14 font-medium ${config.textClass}`
                  : `border-l-2 border-transparent text-foreground/60 ${config.hoverBgClass}`,
              ].join(" ")}
            >
              <span className="w-2 shrink-0 flex items-center justify-center">
                {isSubStale && (
                  <span
                    data-testid={`stale-dot-${sub.id}`}
                    className="h-1.5 w-1.5 rounded-full bg-attention"
                    aria-hidden
                  />
                )}
              </span>
              <span className="flex-1">{sub.name}</span>
              <span className="font-numeric text-xs text-foreground/50">
                {summary ? formatCurrency(toGBP(summary.total)) : "£0"}
              </span>
            </motion.button>
          );
        })}
      </motion.div>
      {/* Tier total — static, not animated */}
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

And the complete updated `SubcategoryList.test.tsx`:

```typescript
import { describe, it, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import SubcategoryList from "./SubcategoryList";
import { TIER_CONFIGS } from "./tierConfig";

mock.module("framer-motion", () => {
  const React = require("react");
  return {
    motion: {
      div: ({ children, variants: _v, initial: _i, animate: _a, ...props }: any) =>
        React.createElement("div", props, children),
      button: ({ children, variants: _v, initial: _i, animate: _a, ...props }: any) =>
        React.createElement("button", props, children),
    },
  };
});

const motionUtils = { usePrefersReducedMotion: mock(() => false) };
mock.module("@/utils/motion", () => motionUtils);

const subcategories = [
  { id: "sub-housing", name: "Housing", tier: "committed" as const, sortOrder: 0, isLocked: false },
  {
    id: "sub-utilities",
    name: "Utilities",
    tier: "committed" as const,
    sortOrder: 1,
    isLocked: false,
  },
];

const subcategoryTotals = {
  "sub-housing": { subcategoryId: "sub-housing", name: "Housing", total: 1200, items: [] },
  "sub-utilities": { subcategoryId: "sub-utilities", name: "Utilities", total: 300, items: [] },
};

function renderList(selectedId = "sub-housing", onSelect = mock(() => {})) {
  return render(
    <SubcategoryList
      tier="committed"
      config={TIER_CONFIGS.committed}
      subcategories={subcategories}
      subcategoryTotals={subcategoryTotals}
      tierTotal={1500}
      selectedId={selectedId}
      onSelect={onSelect}
      isLoading={false}
    />
  );
}

describe("SubcategoryList", () => {
  it("renders all subcategory rows", () => {
    renderList();
    expect(screen.getByTestId("subcategory-row-sub-housing")).toBeTruthy();
    expect(screen.getByTestId("subcategory-row-sub-utilities")).toBeTruthy();
  });

  it("marks the selected row with aria-selected", () => {
    renderList("sub-housing");
    expect(screen.getByTestId("subcategory-row-sub-housing").getAttribute("aria-selected")).toBe(
      "true"
    );
    expect(screen.getByTestId("subcategory-row-sub-utilities").getAttribute("aria-selected")).toBe(
      "false"
    );
  });

  it("calls onSelect when a row is clicked", () => {
    const onSelect = mock(() => {});
    renderList("sub-housing", onSelect);
    fireEvent.click(screen.getByTestId("subcategory-row-sub-utilities"));
    expect(onSelect).toHaveBeenCalledWith("sub-utilities");
  });

  it("shows tier total at the bottom", () => {
    renderList();
    expect(screen.getByTestId("tier-total")).toBeTruthy();
    expect(screen.getByText(/1,500/)).toBeTruthy();
  });

  it("shows amounts for each subcategory", () => {
    renderList();
    expect(screen.getByText(/1,200/)).toBeTruthy();
    expect(screen.getByText(/300/)).toBeTruthy();
  });

  it("unselected row uses tier colour for hover background", () => {
    renderList("sub-housing");
    const unselected = screen.getByTestId("subcategory-row-sub-utilities");
    expect(unselected.className).toContain("hover:bg-tier-committed/5");
  });

  it("shows amber stale dot when any item in the subcategory is stale", () => {
    const staleItem = {
      id: "item-stale",
      lastReviewedAt: new Date("2024-01-01"),
      amount: 100,
      spendType: "monthly" as const,
      subcategoryId: "sub-housing",
      notes: null,
      sortOrder: 0,
    };
    const totalsWithStaleItem = {
      "sub-housing": {
        subcategoryId: "sub-housing",
        name: "Housing",
        total: 1200,
        items: [staleItem],
      },
      "sub-utilities": {
        subcategoryId: "sub-utilities",
        name: "Utilities",
        total: 300,
        items: [],
      },
    };
    render(
      <SubcategoryList
        tier="committed"
        config={TIER_CONFIGS.committed}
        subcategories={subcategories}
        subcategoryTotals={totalsWithStaleItem}
        tierTotal={1500}
        selectedId="sub-housing"
        onSelect={() => {}}
        isLoading={false}
        now={new Date("2026-01-15")}
        stalenessMonths={6}
      />
    );
    expect(screen.getByTestId("stale-dot-sub-housing")).toBeTruthy();
    expect(screen.queryByTestId("stale-dot-sub-utilities")).toBeNull();
  });

  it("calls usePrefersReducedMotion to respect reduced motion preference", () => {
    motionUtils.usePrefersReducedMotion.mockClear();
    renderList();
    expect(motionUtils.usePrefersReducedMotion).toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test SubcategoryList`
Expected: PASS — all 8 tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/tier/SubcategoryList.tsx apps/frontend/src/components/tier/SubcategoryList.test.tsx
git commit -m "feat(ui): stagger subcategory rows in from left on tier page mount"
```

---

## Testing

### Frontend Tests

- [ ] Component: all existing `SubcategoryList` tests pass with the framer-motion mock in place
- [ ] Component: `usePrefersReducedMotion` is called on render

### Key Scenarios

- [ ] Happy path: navigating to any tier page shows subcategory rows staggering in from the left
- [ ] Reduced motion: with `prefers-reduced-motion: reduce` set in OS/browser, rows appear immediately with no animation
- [ ] Empty list: tier page with no subcategories renders without errors (nothing to animate)
- [ ] Switching items: selecting a different subcategory within the tier does not re-trigger the entrance animation

## Verification

- [ ] `bun run lint` — zero warnings
- [ ] `bun run type-check` — clean
- [ ] `cd apps/frontend && bun test SubcategoryList` — 8 tests pass
- [ ] Manual: open Income, Committed, Discretionary, and Surplus pages — subcategory rows stagger in from left on arrival; header and Total are static

## Post-conditions

- [ ] `SubcategoryList` uses the same Framer Motion stagger pattern as `WaterfallLeftPanel`, establishing the horizontal variant as the standard for panel-entry list animations
