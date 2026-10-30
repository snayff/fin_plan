---
feature: data-item-entries
category: ui
spec: docs/4. planning/data-item-entries/data-item-entries-spec.md
creation_date: 2026-03-27
status: implemented
implemented_date: 2026-07-05
---

# Data Item Entries — Implementation Plan

> **For Claude:** Use `/execute-plan data-item-entries` to implement this plan task-by-task.

> **Purpose:** An ordered, task-by-task build guide. Each task follows TDD red-green-commit and contains complete, ready-to-run code — no "implement X" placeholders. This is the input to `/execute-plan`. The spec defines _what_ to build; this plan defines _how_.

**Goal:** Refine the three states of data item rows on tier pages — collapsed, expanded read-only, and editing — for improved information density, visual hierarchy, and interaction consistency.
**Spec:** `docs/4. planning/data-item-entries/data-item-entries-spec.md`
**Architecture:** Frontend-only changes across four files: `formatAmount.ts` (new amount formatting logic + shared labels), `ItemRow.tsx` (two-line layout with tier highlight), `ItemAccordion.tsx` (notes-first accordion with conditional staleness), and `ItemForm.tsx` (revised button order, field labels, placeholder styling). No schema or API changes.
**Tech Stack:** React 18 · Tailwind
**Infrastructure Impact:**

- Touches `packages/shared/`: no
- Requires DB migration: no

## Pre-conditions

- [x] Tier pages exist with ItemRow, ItemAccordion, ItemForm, and ItemAreaRow components
- [x] `formatAmount.ts` provides `formatItemAmount`, `isStale`, `getMonthsAgo`
- [x] `tierConfig.ts` provides `TierConfig` with `bgClass`, `borderClass`, `textClass`
- [x] Existing test files for all three components

## Tasks

---

### Task 1: Update formatAmount — Two-line Amount Formatting

**Files:**

- Modify: `apps/frontend/src/components/tier/formatAmount.ts`
- Test: `apps/frontend/src/components/tier/formatAmount.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/components/tier/formatAmount.test.ts
import { describe, it, expect } from "bun:test";
import { formatTwoLineAmount, SPEND_TYPE_LABELS } from "./formatAmount";

describe("formatTwoLineAmount", () => {
  it("monthly item: monthly is bright, yearly is muted", () => {
    const result = formatTwoLineAmount(350, "monthly");
    expect(result.monthly.value).toBe("£350/mo");
    expect(result.monthly.bright).toBe(true);
    expect(result.yearly.value).toBe("£4,200/yr");
    expect(result.yearly.bright).toBe(false);
  });

  it("yearly item: yearly is bright, monthly is muted", () => {
    const result = formatTwoLineAmount(840, "yearly");
    expect(result.monthly.value).toBe("£70/mo");
    expect(result.monthly.bright).toBe(false);
    expect(result.yearly.value).toBe("£840/yr");
    expect(result.yearly.bright).toBe(true);
  });

  it("one-off item: single amount, no yearly", () => {
    const result = formatTwoLineAmount(3200, "one_off");
    expect(result.monthly.value).toBe("£3,200");
    expect(result.monthly.bright).toBe(true);
    expect(result.yearly).toBeNull();
  });

  it("rounds monthly conversion of yearly to nearest whole pound", () => {
    // 1000 yearly / 12 = 83.33 → Math.round = 83
    const result = formatTwoLineAmount(1000, "yearly");
    expect(result.monthly.value).toBe("£83/mo");
  });
});

describe("SPEND_TYPE_LABELS", () => {
  it("provides human-readable labels", () => {
    expect(SPEND_TYPE_LABELS.monthly).toBe("Monthly");
    expect(SPEND_TYPE_LABELS.yearly).toBe("Yearly");
    expect(SPEND_TYPE_LABELS.one_off).toBe("One-off");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test src/components/tier/formatAmount.test.ts`
Expected: FAIL — "formatTwoLineAmount is not a function" or "SPEND_TYPE_LABELS is not exported"

- [ ] **Step 3: Write minimal implementation**

Add to `apps/frontend/src/components/tier/formatAmount.ts`:

```typescript
// Add these exports to the existing file — keep existing exports intact

export const SPEND_TYPE_LABELS: Record<SpendType, string> = {
  monthly: "Monthly",
  yearly: "Yearly",
  one_off: "One-off",
};

interface AmountLine {
  value: string;
  bright: boolean;
}

export interface TwoLineAmount {
  monthly: AmountLine;
  yearly: AmountLine | null;
}

export function formatTwoLineAmount(amount: number, spendType: SpendType): TwoLineAmount {
  if (spendType === "one_off") {
    return {
      monthly: { value: formatCurrency(toGBP(amount)), bright: true },
      yearly: null,
    };
  }

  const isMonthly = spendType === "monthly";
  const monthlyAmt = isMonthly ? amount : Math.round(amount / 12);
  const yearlyAmt = isMonthly ? amount * 12 : amount;

  return {
    monthly: {
      value: `${formatCurrency(toGBP(monthlyAmt))}/mo`,
      bright: isMonthly,
    },
    yearly: {
      value: `${formatCurrency(toGBP(yearlyAmt))}/yr`,
      bright: !isMonthly,
    },
  };
}
```

Note: `toGBP` and `formatCurrency` are already imported in the file.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test src/components/tier/formatAmount.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/tier/formatAmount.ts apps/frontend/src/components/tier/formatAmount.test.ts
git commit -m "feat(tier): add two-line amount formatting and shared spend type labels"
```

---

### Task 2: Rework ItemRow — Two-line Layout with Selected Highlight

**Files:**

- Modify: `apps/frontend/src/components/tier/ItemRow.tsx`
- Modify: `apps/frontend/src/components/tier/ItemRow.test.tsx`

- [ ] **Step 1: Update tests for new layout**

```typescript
// apps/frontend/src/components/tier/ItemRow.test.tsx
import { describe, it, expect } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import ItemRow from "./ItemRow";
import { TIER_CONFIGS } from "./tierConfig";

const baseItem = {
  id: "item-1",
  name: "Rent",
  amount: 1200,
  spendType: "monthly" as const,
  subcategoryId: "sub-housing",
  subcategoryName: "Housing",
  notes: null,
  lastReviewedAt: new Date("2025-01-15T00:00:00Z"),
  sortOrder: 0,
};

describe("ItemRow", () => {
  it("renders item name", () => {
    render(
      <ItemRow
        item={baseItem}
        config={TIER_CONFIGS.committed}
        isExpanded={false}
        onToggle={() => {}}
        now={new Date("2026-01-15T00:00:00Z")}
      />
    );
    expect(screen.getByText("Rent")).toBeTruthy();
  });

  it("shows monthly amount with /mo suffix", () => {
    render(
      <ItemRow
        item={{ ...baseItem, spendType: "monthly", amount: 350 }}
        config={TIER_CONFIGS.committed}
        isExpanded={false}
        onToggle={() => {}}
        now={new Date("2026-01-15T00:00:00Z")}
      />
    );
    expect(screen.getByText("£350/mo")).toBeTruthy();
  });

  it("shows yearly amount with /yr suffix", () => {
    render(
      <ItemRow
        item={{ ...baseItem, spendType: "monthly", amount: 350 }}
        config={TIER_CONFIGS.committed}
        isExpanded={false}
        onToggle={() => {}}
        now={new Date("2026-01-15T00:00:00Z")}
      />
    );
    expect(screen.getByText("£4,200/yr")).toBeTruthy();
  });

  it("shows type and category on second line", () => {
    render(
      <ItemRow
        item={baseItem}
        config={TIER_CONFIGS.committed}
        isExpanded={false}
        onToggle={() => {}}
        now={new Date("2026-01-15T00:00:00Z")}
      />
    );
    expect(screen.getByText(/Monthly/)).toBeTruthy();
    expect(screen.getByText(/Housing/)).toBeTruthy();
  });

  it("one-off item shows single amount without /mo suffix and no yearly", () => {
    render(
      <ItemRow
        item={{ ...baseItem, spendType: "one_off", amount: 3200 }}
        config={TIER_CONFIGS.committed}
        isExpanded={false}
        onToggle={() => {}}
        now={new Date("2026-01-15T00:00:00Z")}
      />
    );
    expect(screen.getByText("£3,200")).toBeTruthy();
    expect(screen.queryByText(/\/yr/)).toBeNull();
  });

  it("does not show staleness age text in collapsed row", () => {
    render(
      <ItemRow
        item={{ ...baseItem, lastReviewedAt: new Date("2024-06-01T00:00:00Z") }}
        config={TIER_CONFIGS.committed}
        isExpanded={false}
        onToggle={() => {}}
        now={new Date("2026-01-15T00:00:00Z")}
        stalenessMonths={6}
      />
    );
    expect(screen.queryByTestId("stale-age")).toBeNull();
  });

  it("shows stale dot when item is stale", () => {
    render(
      <ItemRow
        item={{ ...baseItem, lastReviewedAt: new Date("2024-06-01T00:00:00Z") }}
        config={TIER_CONFIGS.committed}
        isExpanded={false}
        onToggle={() => {}}
        now={new Date("2026-01-15T00:00:00Z")}
        stalenessMonths={6}
      />
    );
    expect(screen.getByTestId("stale-dot")).toBeTruthy();
  });

  it("does not show stale dot when item is fresh", () => {
    render(
      <ItemRow
        item={{ ...baseItem, lastReviewedAt: new Date("2025-12-01T00:00:00Z") }}
        config={TIER_CONFIGS.committed}
        isExpanded={false}
        onToggle={() => {}}
        now={new Date("2026-01-15T00:00:00Z")}
        stalenessMonths={6}
      />
    );
    expect(screen.queryByTestId("stale-dot")).toBeNull();
  });

  it("applies selected highlight when expanded", () => {
    const { container } = render(
      <ItemRow
        item={baseItem}
        config={TIER_CONFIGS.committed}
        isExpanded={true}
        onToggle={() => {}}
        now={new Date("2026-01-15T00:00:00Z")}
      />
    );
    const button = screen.getByTestId("item-row-item-1");
    expect(button.className).toContain("border-l-2");
    expect(button.className).toContain("border-tier-committed");
  });

  it("calls onToggle when clicked", () => {
    let called = false;
    render(
      <ItemRow
        item={baseItem}
        config={TIER_CONFIGS.committed}
        isExpanded={false}
        onToggle={() => {
          called = true;
        }}
        now={new Date("2026-01-15T00:00:00Z")}
      />
    );
    fireEvent.click(screen.getByTestId("item-row-item-1"));
    expect(called).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test src/components/tier/ItemRow.test.tsx`
Expected: FAIL — tests expecting new layout elements not found

- [ ] **Step 3: Rewrite ItemRow component**

```typescript
// apps/frontend/src/components/tier/ItemRow.tsx
import { formatTwoLineAmount, SPEND_TYPE_LABELS, isStale, type SpendType } from "./formatAmount";
import type { TierConfig } from "./tierConfig";

interface WaterfallItem {
  id: string;
  name: string;
  amount: number;
  spendType: SpendType;
  subcategoryId: string;
  subcategoryName: string;
  notes: string | null;
  lastReviewedAt: Date;
  sortOrder: number;
}

interface Props {
  item: WaterfallItem;
  config: TierConfig;
  isExpanded: boolean;
  onToggle: () => void;
  now: Date;
  stalenessMonths?: number;
  children?: React.ReactNode;
}

export default function ItemRow({
  item,
  config,
  isExpanded,
  onToggle,
  now,
  stalenessMonths = 12,
  children,
}: Props) {
  const amounts = formatTwoLineAmount(item.amount, item.spendType);
  const stale = isStale(item.lastReviewedAt, now, stalenessMonths);

  return (
    <div>
      <button
        type="button"
        data-testid={`item-row-${item.id}`}
        onClick={onToggle}
        className={[
          "flex w-full items-start gap-2 px-4 py-2.5 text-left text-sm transition-colors",
          config.hoverBgClass,
          isExpanded
            ? `${config.bgClass}/8 border-l-2 ${config.borderClass} pl-[14px]`
            : "",
        ].join(" ")}
      >
        {/* Stale dot — fixed-width column */}
        <span className="w-2 shrink-0 flex items-center justify-center mt-1">
          {stale && (
            <span
              data-testid="stale-dot"
              className="h-1.5 w-1.5 rounded-full bg-attention"
              aria-hidden
            />
          )}
        </span>

        {/* Left: name + metadata */}
        <span className="flex-1 flex flex-col gap-px">
          <span className="text-foreground/65">{item.name}</span>
          <span className="text-[11px] text-foreground/30">
            {SPEND_TYPE_LABELS[item.spendType]} · {item.subcategoryName}
          </span>
        </span>

        {/* Right: amounts */}
        <span className="flex flex-col items-end gap-px">
          <span
            className={[
              "font-numeric text-sm",
              amounts.monthly.bright ? "text-foreground/70" : "text-foreground/30",
            ].join(" ")}
          >
            {amounts.monthly.value}
          </span>
          {amounts.yearly && (
            <span
              className={[
                "font-numeric text-[11px]",
                amounts.yearly.bright ? "text-foreground/70" : "text-foreground/30",
              ].join(" ")}
            >
              {amounts.yearly.value}
            </span>
          )}
        </span>
      </button>
      {isExpanded && children}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test src/components/tier/ItemRow.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/tier/ItemRow.tsx apps/frontend/src/components/tier/ItemRow.test.tsx
git commit -m "feat(tier): rework ItemRow to two-line layout with selected highlight"
```

---

### Task 3: Rework ItemAccordion — Notes-first with Conditional Staleness

**Files:**

- Modify: `apps/frontend/src/components/tier/ItemAccordion.tsx`
- Modify: `apps/frontend/src/components/tier/ItemAccordion.test.tsx`

- [ ] **Step 1: Update tests for new accordion layout**

```typescript
// apps/frontend/src/components/tier/ItemAccordion.test.tsx
import { describe, it, expect } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import ItemAccordion from "./ItemAccordion";
import { TIER_CONFIGS } from "./tierConfig";

const freshItem = {
  id: "item-1",
  name: "Rent",
  amount: 1200,
  spendType: "monthly" as const,
  subcategoryId: "sub-housing",
  subcategoryName: "Housing",
  notes: "Fixed rate until 2027",
  lastReviewedAt: new Date("2026-01-01T00:00:00Z"),
  sortOrder: 0,
};

const staleItem = {
  ...freshItem,
  lastReviewedAt: new Date("2024-01-01T00:00:00Z"),
};

function renderAccordion(item = freshItem, onEdit = () => {}) {
  return render(
    <ItemAccordion
      item={item}
      config={TIER_CONFIGS.committed}
      onEdit={onEdit}
      now={new Date("2026-01-15T00:00:00Z")}
      stalenessMonths={6}
    />
  );
}

describe("ItemAccordion", () => {
  it("shows Notes header label", () => {
    renderAccordion();
    expect(screen.getByText("Notes")).toBeTruthy();
  });

  it("shows notes italic when present", () => {
    renderAccordion();
    expect(screen.getByText("Fixed rate until 2027")).toBeTruthy();
  });

  it("shows 'No notes' in muted when notes is null", () => {
    renderAccordion({ ...freshItem, notes: null });
    expect(screen.getByText(/no notes/i)).toBeTruthy();
  });

  it("does not show Last Reviewed for fresh items", () => {
    renderAccordion(freshItem);
    expect(screen.queryByText(/last reviewed/i)).toBeNull();
  });

  it("shows Last Reviewed with amber styling for stale items", () => {
    renderAccordion(staleItem);
    expect(screen.getByText(/last reviewed/i)).toBeTruthy();
    expect(screen.getByText(/jan 2024/i)).toBeTruthy();
  });

  it("shows relative age for stale items", () => {
    renderAccordion(staleItem);
    expect(screen.getByText(/24 months ago/)).toBeTruthy();
  });

  it("shows Edit button right-aligned", () => {
    renderAccordion();
    expect(screen.getByRole("button", { name: /edit/i })).toBeTruthy();
  });

  it("does not show Still correct button", () => {
    renderAccordion(staleItem);
    expect(screen.queryByRole("button", { name: /still correct/i })).toBeNull();
  });

  it("calls onEdit when Edit is clicked", () => {
    let called = false;
    renderAccordion(freshItem, () => {
      called = true;
    });
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    expect(called).toBe(true);
  });

  it("has tier colour left border for visual continuity", () => {
    const { container } = renderAccordion();
    const accordion = container.firstChild as HTMLElement;
    expect(accordion.className).toContain("border-l-2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test src/components/tier/ItemAccordion.test.tsx`
Expected: FAIL — tests expecting new layout (Notes header, no Still correct, no Type/Category grid)

- [ ] **Step 3: Rewrite ItemAccordion component**

```typescript
// apps/frontend/src/components/tier/ItemAccordion.tsx
import { isStale, getMonthsAgo, type SpendType } from "./formatAmount";
import type { TierConfig } from "./tierConfig";

interface Item {
  id: string;
  name: string;
  amount: number;
  spendType: SpendType;
  subcategoryId: string;
  subcategoryName: string;
  notes: string | null;
  lastReviewedAt: Date;
  sortOrder: number;
}

interface Props {
  item: Item;
  config: TierConfig;
  onEdit: () => void;
  now: Date;
  stalenessMonths?: number;
}

function formatReviewDate(date: Date): string {
  return new Date(date).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

export default function ItemAccordion({
  item,
  config,
  onEdit,
  now,
  stalenessMonths = 12,
}: Props) {
  const stale = isStale(item.lastReviewedAt, now, stalenessMonths);
  const monthsAgo = stale ? getMonthsAgo(item.lastReviewedAt, now) : 0;

  return (
    <div
      className={[
        "border-t border-foreground/5 bg-foreground/[0.02] py-2.5 pr-4",
        `border-l-2 ${config.borderClass}`,
        `${config.bgClass}/8`,
        "pl-[30px]", // 14px + 8px dot + 8px gap = align with item name
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        {/* Content */}
        <div className="flex-1 flex flex-col gap-2">
          {/* Notes */}
          <div>
            <span className="block text-foreground/30 uppercase tracking-[0.07em] text-[10px]">
              Notes
            </span>
            {item.notes ? (
              <p className="text-xs italic text-foreground/50">{item.notes}</p>
            ) : (
              <p className="text-xs text-foreground/20">No notes</p>
            )}
          </div>

          {/* Last Reviewed — only when stale */}
          {stale && (
            <div>
              <span className="block text-foreground/30 uppercase tracking-[0.07em] text-[10px]">
                Last Reviewed
              </span>
              <span className="flex items-center gap-1.5 text-xs text-attention">
                <span className="h-[5px] w-[5px] rounded-full bg-attention shrink-0" aria-hidden />
                {formatReviewDate(item.lastReviewedAt)} · {monthsAgo} months ago
              </span>
            </div>
          )}
        </div>

        {/* Edit button — right-aligned, top-aligned */}
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 rounded-md border border-foreground/10 px-3 py-1 text-xs text-foreground/60 hover:bg-foreground/5 transition-colors"
        >
          Edit
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test src/components/tier/ItemAccordion.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/tier/ItemAccordion.tsx apps/frontend/src/components/tier/ItemAccordion.test.tsx
git commit -m "feat(tier): rework ItemAccordion to notes-first with conditional staleness"
```

---

### Task 4: Rework ItemForm — Button Order, Labels, Placeholders

**Files:**

- Modify: `apps/frontend/src/components/tier/ItemForm.tsx`
- Modify: `apps/frontend/src/components/tier/ItemForm.test.tsx`

- [ ] **Step 1: Update tests for new form layout**

```typescript
// apps/frontend/src/components/tier/ItemForm.test.tsx
import { describe, it, expect } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import ItemForm from "./ItemForm";
import { TIER_CONFIGS } from "./tierConfig";

const subcategories = [
  { id: "sub-housing", name: "Housing" },
  { id: "sub-utilities", name: "Utilities" },
];

describe("ItemForm — add mode", () => {
  it("renders field labels with asterisks for required fields", () => {
    render(
      <ItemForm
        mode="add"
        config={TIER_CONFIGS.committed}
        subcategories={subcategories}
        initialSubcategoryId="sub-housing"
        onSave={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByText(/name/i)).toBeTruthy();
    expect(screen.getByText(/amount/i)).toBeTruthy();
    // Asterisks on required fields
    const labels = screen.getAllByText("*");
    expect(labels.length).toBeGreaterThanOrEqual(2);
  });

  it("renders descriptive placeholders", () => {
    render(
      <ItemForm
        mode="add"
        config={TIER_CONFIGS.committed}
        subcategories={subcategories}
        initialSubcategoryId="sub-housing"
        onSave={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByPlaceholderText("e.g. Netflix, Council Tax")).toBeTruthy();
    expect(screen.getByPlaceholderText("0.00")).toBeTruthy();
    expect(screen.getByPlaceholderText("Any details worth remembering")).toBeTruthy();
  });

  it("renders Cancel and Save buttons only in add mode", () => {
    render(
      <ItemForm
        mode="add"
        config={TIER_CONFIGS.committed}
        subcategories={subcategories}
        initialSubcategoryId="sub-housing"
        onSave={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByRole("button", { name: /cancel/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /still correct/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
  });

  it("Save is the rightmost button in add mode", () => {
    const { container } = render(
      <ItemForm
        mode="add"
        config={TIER_CONFIGS.committed}
        subcategories={subcategories}
        initialSubcategoryId="sub-housing"
        onSave={() => {}}
        onCancel={() => {}}
      />
    );
    const buttons = container.querySelectorAll("[data-testid='form-actions'] button");
    const lastButton = buttons[buttons.length - 1];
    expect(lastButton?.textContent).toMatch(/save/i);
  });

  it("calls onSave with form data on submit", () => {
    let savedData: any = null;
    render(
      <ItemForm
        mode="add"
        config={TIER_CONFIGS.committed}
        subcategories={subcategories}
        initialSubcategoryId="sub-housing"
        onSave={(data) => {
          savedData = data;
        }}
        onCancel={() => {}}
      />
    );
    fireEvent.change(screen.getByPlaceholderText("e.g. Netflix, Council Tax"), {
      target: { value: "Rent" },
    });
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "1200" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(savedData).toBeTruthy();
    expect(savedData.name).toBe("Rent");
    expect(savedData.amount).toBe(1200);
  });

  it("calls onCancel when Cancel is clicked", () => {
    let cancelled = false;
    render(
      <ItemForm
        mode="add"
        config={TIER_CONFIGS.committed}
        subcategories={subcategories}
        initialSubcategoryId="sub-housing"
        onSave={() => {}}
        onCancel={() => {
          cancelled = true;
        }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(cancelled).toBe(true);
  });
});

describe("ItemForm — edit mode (stale item)", () => {
  const staleItem = {
    id: "item-1",
    name: "Rent",
    amount: 1200,
    spendType: "monthly" as const,
    subcategoryId: "sub-housing",
    notes: "Fixed rate",
    lastReviewedAt: new Date("2024-01-01"),
  };

  it("renders button order: Cancel, Delete, Still correct, Save", () => {
    const { container } = render(
      <ItemForm
        mode="edit"
        item={staleItem}
        config={TIER_CONFIGS.committed}
        subcategories={subcategories}
        initialSubcategoryId="sub-housing"
        onSave={() => {}}
        onCancel={() => {}}
        onConfirm={() => {}}
        onDelete={() => {}}
        isStale={true}
      />
    );
    const buttons = container.querySelectorAll("[data-testid='form-actions'] button");
    expect(buttons[0]?.textContent).toMatch(/cancel/i);
    // After spacer: Delete, Still correct, Save
    const rightButtons = Array.from(buttons).slice(1);
    expect(rightButtons.some((b) => b.textContent?.match(/delete/i))).toBe(true);
    expect(rightButtons.some((b) => b.textContent?.match(/still correct/i))).toBe(true);
    const lastButton = buttons[buttons.length - 1];
    expect(lastButton?.textContent).toMatch(/save/i);
  });
});

describe("ItemForm — edit mode (fresh item)", () => {
  const freshItem = {
    id: "item-2",
    name: "Gym",
    amount: 3999,
    spendType: "monthly" as const,
    subcategoryId: "sub-housing",
    notes: null,
    lastReviewedAt: new Date("2026-01-01"),
  };

  it("does not show Still correct for non-stale items", () => {
    render(
      <ItemForm
        mode="edit"
        item={freshItem}
        config={TIER_CONFIGS.committed}
        subcategories={subcategories}
        initialSubcategoryId="sub-housing"
        onSave={() => {}}
        onCancel={() => {}}
        onConfirm={() => {}}
        onDelete={() => {}}
        isStale={false}
      />
    );
    expect(screen.queryByRole("button", { name: /still correct/i })).toBeNull();
    expect(screen.getByRole("button", { name: /delete/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test src/components/tier/ItemForm.test.tsx`
Expected: FAIL — tests expecting new placeholders, labels, button order, and `isStale` prop

- [ ] **Step 3: Rewrite ItemForm component**

```typescript
// apps/frontend/src/components/tier/ItemForm.tsx
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/utils/format";
import type { TierConfig } from "./tierConfig";
import type { SpendType } from "./formatAmount";

interface SubcategoryOption {
  id: string;
  name: string;
}

interface ItemData {
  name: string;
  amount: number;
  spendType: SpendType;
  subcategoryId: string;
  notes: string | null;
}

interface EditItem extends ItemData {
  id: string;
  lastReviewedAt: Date;
}

type AddModeProps = {
  mode: "add";
  item?: undefined;
  onConfirm?: undefined;
  onDelete?: undefined;
  isStale?: undefined;
};

type EditModeProps = {
  mode: "edit";
  item: EditItem;
  onConfirm: () => void;
  onDelete: () => void;
  isStale: boolean;
};

type Props = (AddModeProps | EditModeProps) & {
  config: TierConfig;
  subcategories: SubcategoryOption[];
  initialSubcategoryId: string;
  onSave: (data: ItemData) => void;
  onCancel: () => void;
  isSaving?: boolean;
};

export default function ItemForm({
  mode,
  item,
  config,
  subcategories,
  initialSubcategoryId,
  onSave,
  onCancel,
  onConfirm,
  onDelete,
  isSaving,
  isStale,
}: Props) {
  const [name, setName] = useState(item?.name ?? "");
  const [amount, setAmount] = useState(item?.amount?.toString() ?? "");
  const [spendType, setSpendType] = useState<SpendType>(item?.spendType ?? "monthly");
  const [subcategoryId, setSubcategoryId] = useState(item?.subcategoryId ?? initialSubcategoryId);
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [amountFocused, setAmountFocused] = useState(false);

  const displayAmount =
    !amountFocused && amount
      ? (() => {
          const n = parseFloat(amount);
          return isNaN(n) ? amount : formatCurrency(n);
        })()
      : amount;

  function parseAmount(raw: string): number {
    return parseFloat(raw.replace(/[£,\s]/g, ""));
  }

  function handleSave() {
    const parsed = parseAmount(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) {
      setAmountError("Amount must be greater than 0");
      return;
    }
    setAmountError(null);
    onSave({
      name: name.trim(),
      amount: parsed,
      spendType,
      subcategoryId,
      notes: notes.trim() || null,
    });
  }

  const labelClass = "text-foreground/30 uppercase tracking-[0.07em] text-[10px]";
  const inputClass =
    "rounded-md border border-foreground/10 bg-foreground/[0.04] px-3 py-1.5 text-sm text-foreground/85 placeholder:italic placeholder:text-foreground/[0.18] focus:outline-none focus:border-page-accent/60";

  return (
    <div
      className={[
        "border-t border-foreground/5 bg-foreground/[0.02] py-3 pr-4 flex flex-col gap-3",
        `border-l-2 ${config.borderClass}`,
        `${config.bgClass}/8`,
        "pl-[30px]", // align with item name
      ].join(" ")}
    >
      <div className="grid grid-cols-2 gap-3">
        {/* Name */}
        <div className="col-span-2 flex flex-col gap-1">
          <label className={labelClass}>
            Name <span className="text-foreground/25">*</span>
          </label>
          <input
            type="text"
            placeholder="e.g. Netflix, Council Tax"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Name"
            className={`${inputClass} col-span-2`}
          />
        </div>

        {/* Amount */}
        <div className="flex flex-col gap-1">
          <label className={labelClass}>
            Amount <span className="text-foreground/25">*</span>
          </label>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={displayAmount}
            onChange={(e) => {
              setAmount(e.target.value);
              setAmountError(null);
            }}
            onFocus={() => setAmountFocused(true)}
            onBlur={() => setAmountFocused(false)}
            aria-label="Amount"
            className={[
              inputClass,
              "font-numeric",
              amountError ? "border-amber-400/60 focus:border-amber-400" : "",
            ].join(" ")}
          />
          {amountError && <p className="-mt-0.5 text-xs text-amber-400">{amountError}</p>}
        </div>

        {/* Frequency */}
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Frequency</label>
          <Select value={spendType} onValueChange={(v) => setSpendType(v as SpendType)}>
            <SelectTrigger
              aria-label="Spend type"
              className="h-auto rounded-md border-foreground/10 bg-foreground/[0.04] py-1.5 text-sm focus:ring-page-accent/40"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
              <SelectItem value="one_off">One-off</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Category */}
        <div className="col-span-2 flex flex-col gap-1">
          <label className={labelClass}>Category</label>
          <Select value={subcategoryId} onValueChange={setSubcategoryId}>
            <SelectTrigger
              aria-label="Subcategory"
              className="h-auto rounded-md border-foreground/10 bg-foreground/[0.04] py-1.5 text-sm focus:ring-page-accent/40"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {subcategories.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Notes */}
        <div className="col-span-2 flex flex-col gap-1">
          <label className={labelClass}>Notes</label>
          <textarea
            placeholder="Any details worth remembering"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            aria-label="Notes"
            rows={2}
            maxLength={500}
            className={`${inputClass} w-full resize-none`}
          />
        </div>
      </div>

      {/* Actions: Cancel · [spacer] · Delete · Still correct · Save */}
      <div className="flex items-center gap-2" data-testid="form-actions">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-foreground/10 px-3 py-1 text-xs text-foreground/50 hover:bg-foreground/5 transition-colors"
        >
          Cancel
        </button>

        <span className="flex-1" />

        {mode === "edit" && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="text-xs text-foreground/25 hover:text-red-400 transition-colors"
          >
            Delete
          </button>
        )}
        {mode === "edit" && onConfirm && isStale && (
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-medium text-teal-400 hover:bg-teal-500/20 transition-colors"
          >
            Still correct ✓
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || !name.trim()}
          className={[
            "rounded-md px-3 py-1 text-xs font-medium transition-colors",
            "bg-page-accent/20 text-page-accent hover:bg-page-accent/30",
            "disabled:cursor-not-allowed disabled:opacity-40",
          ].join(" ")}
        >
          Save
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test src/components/tier/ItemForm.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/tier/ItemForm.tsx apps/frontend/src/components/tier/ItemForm.test.tsx
git commit -m "feat(tier): rework ItemForm button order, labels, and placeholder styling"
```

---

### Task 5: Update ItemAreaRow — Pass New Props

**Files:**

- Modify: `apps/frontend/src/components/tier/ItemAreaRow.tsx`

- [ ] **Step 1: No new test needed** — ItemAreaRow is a thin wiring component; its behaviour is covered by the child component tests and the existing ItemArea integration test.

- [ ] **Step 2: Update ItemAreaRow to pass `isStale` and `subcategoryName` and remove `onConfirm` from ItemAccordion**

```typescript
// apps/frontend/src/components/tier/ItemAreaRow.tsx
import ItemRow from "./ItemRow";
import ItemAccordion from "./ItemAccordion";
import ItemForm from "./ItemForm";
import { isStale } from "./formatAmount";
import { useTierUpdateItem, useConfirmWaterfallItem, type TierItemRow } from "@/hooks/useWaterfall";
import type { TierConfig, TierKey } from "./tierConfig";

interface SubcategoryOption {
  id: string;
  name: string;
}

interface Props {
  tier: TierKey;
  config: TierConfig;
  item: TierItemRow;
  subcategoryName: string;
  subcategories: SubcategoryOption[];
  expandedItemId: string | null;
  editingItemId: string | null;
  onToggleExpand: (id: string) => void;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onDeleteRequest: (id: string) => void;
  now: Date;
  stalenessMonths: number;
}

export default function ItemAreaRow({
  tier,
  config,
  item,
  subcategoryName,
  subcategories,
  expandedItemId,
  editingItemId,
  onToggleExpand,
  onStartEdit,
  onCancelEdit,
  onDeleteRequest,
  now,
  stalenessMonths,
}: Props) {
  const isExpanded = expandedItemId === item.id;
  const isEditing = editingItemId === item.id;
  const updateItem = useTierUpdateItem(tier, item.id);
  const confirmItem = useConfirmWaterfallItem(tier, item.id);
  const stale = isStale(item.lastReviewedAt, now, stalenessMonths);

  return (
    <ItemRow
      item={{ ...item, subcategoryName }}
      config={config}
      isExpanded={isExpanded}
      onToggle={() => {
        if (isEditing) return;
        onToggleExpand(item.id);
      }}
      now={now}
      stalenessMonths={stalenessMonths}
    >
      {isExpanded && !isEditing && (
        <ItemAccordion
          item={{ ...item, subcategoryName }}
          config={config}
          onEdit={() => onStartEdit(item.id)}
          now={now}
          stalenessMonths={stalenessMonths}
        />
      )}
      {isEditing && (
        <ItemForm
          mode="edit"
          item={item}
          config={config}
          subcategories={subcategories}
          initialSubcategoryId={item.subcategoryId}
          isSaving={updateItem.isPending}
          isStale={stale}
          onSave={async (data) => {
            try {
              await updateItem.mutateAsync(data as Record<string, unknown>);
              onCancelEdit();
              onToggleExpand(item.id);
            } catch {
              // error handled by useUpdateItem onError (toast)
            }
          }}
          onCancel={onCancelEdit}
          onConfirm={async () => {
            try {
              await confirmItem.mutateAsync();
              onCancelEdit();
            } catch {
              // error handled by mutation onError (toast)
            }
          }}
          onDelete={() => onDeleteRequest(item.id)}
        />
      )}
    </ItemRow>
  );
}
```

- [ ] **Step 3: Run all tier tests to verify nothing is broken**

Run: `cd apps/frontend && bun test src/components/tier/`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/tier/ItemAreaRow.tsx
git commit -m "fix(tier): wire isStale and subcategoryName through ItemAreaRow"
```

---

### Task 6: Verify `subcategoryName` is available on TierItemRow

**Files:**

- Check: `apps/frontend/src/hooks/useWaterfall.ts` — verify `TierItemRow` type includes `subcategoryName`

- [ ] **Step 1: Check the type**

If `TierItemRow` does not include `subcategoryName`, add it. The ItemRow now expects this field. Check the hook and the API response shape. If `subcategoryName` is only available in `ItemAreaRow` via the `subcategoryName` prop (passed from `ItemArea`), ensure that prop is spread onto the item before passing to `ItemRow`.

This task is conditional — skip if `subcategoryName` is already on the type or correctly wired through.

- [ ] **Step 2: Run full tier test suite**

Run: `cd apps/frontend && bun test src/components/tier/`
Expected: PASS

- [ ] **Step 3: Commit (if changes were needed)**

```bash
git add apps/frontend/src/hooks/useWaterfall.ts
git commit -m "fix(tier): ensure subcategoryName is available on TierItemRow"
```

## Testing

### Frontend Tests

- [ ] `formatAmount.test.ts`: monthly, yearly, one-off formatting with bright/muted flags
- [ ] `ItemRow.test.tsx`: two-line layout, amounts with suffixes, type + category, stale dot (no age text), selected highlight
- [ ] `ItemAccordion.test.tsx`: notes header, conditional Last Reviewed, Edit right-aligned, no Still correct
- [ ] `ItemForm.test.tsx`: button order (Cancel → Delete → Still correct → Save), add mode (Cancel → Save), required asterisks, placeholder text, Still correct conditional on staleness

### Key Scenarios

- [ ] Happy path: expand a monthly item → see notes + Edit; click Edit → see form with Cancel [spacer] Delete Still-correct Save
- [ ] Yearly item: collapsed row shows muted monthly on top, bright yearly on bottom
- [ ] One-off item: single amount, no yearly row
- [ ] Fresh item: no stale dot, no Last Reviewed in accordion, no Still correct in form
- [ ] Stale item: amber dot on row, Last Reviewed in accordion, Still correct in form

## Verification

- [ ] `bun run build` passes clean
- [ ] `bun run lint` — zero warnings
- [ ] `bun run type-check` — no errors
- [ ] `cd apps/frontend && bun test src/components/tier/` — all pass
- [ ] Manual: open a tier page, verify collapsed rows show two-line layout with amounts; expand an item, verify notes + Edit; edit a stale item, verify button order Cancel → Delete → Still correct → Save

## Post-conditions

- [ ] Data item rows match the approved design mockups
- [ ] ButtonPair rightmost-is-affirmative convention is consistently applied
- [ ] Placeholder styling is distinct from data across all tier form inputs
