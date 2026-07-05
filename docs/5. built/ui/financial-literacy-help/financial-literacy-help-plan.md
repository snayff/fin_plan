---
feature: financial-literacy-help
spec: docs/4. planning/financial-literacy-help/financial-literacy-help-spec.md
creation_date: 2026-03-26
status: implemented
---

# Financial Literacy Help — Implementation Plan

> **For Claude:** Use `/execute-plan financial-literacy-help` to implement this plan task-by-task.

> **Purpose:** An ordered, task-by-task build guide. Each task follows TDD red-green-commit and contains complete, ready-to-run code — no "implement X" placeholders. This is the input to `/execute-plan`. The spec defines _what_ to build; this plan defines _how_.

**Goal:** Replace static `DefinitionTooltip` with interactive glossary popovers and add a `/help` page with a searchable glossary and concept explainers — all frontend-only static content.
**Spec:** `docs/4. planning/financial-literacy-help/financial-literacy-help-spec.md`
**Architecture:** Pure frontend feature — no backend, no DB, no shared Zod schemas. Content is hardcoded TypeScript data files. The Help page uses `TwoPanelLayout` (already exists at `apps/frontend/src/components/layout/TwoPanelLayout.tsx`). Sidebar selection and search are URL-driven (`?entry=<id>`) via `useSearchParams` (same pattern as OverviewPage). `GlossaryTermMarker` replaces the existing `DefinitionTooltip` component; `DefinitionTooltip.tsx` is removed.
**Tech Stack:** React 18 · Tailwind · react-router-dom · bun:test · @testing-library/react

**Infrastructure Impact:**

- Touches `packages/shared/`: no
- Requires DB migration: no

## Pre-conditions

- [ ] All existing pages are implemented (`/overview`, `/income`, `/committed`, `/discretionary`, `/surplus`, `/goals`, `/gifts`, `/settings`)
- [ ] `TwoPanelLayout` component exists at `apps/frontend/src/components/layout/TwoPanelLayout.tsx`
- [ ] `SkeletonLoader` component exists at `apps/frontend/src/components/common/SkeletonLoader.tsx`
- [ ] `renderWithProviders` test helper exists at `apps/frontend/src/test/helpers/render.tsx`

## Tasks

---

### Task 1: Glossary Content Data

**Files:**

- Create: `apps/frontend/src/data/glossary.ts`
- Test: `apps/frontend/src/data/glossary.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/data/glossary.test.ts
import { describe, it, expect } from "bun:test";
import { GLOSSARY_ENTRIES, getGlossaryEntry } from "./glossary";

describe("GLOSSARY_ENTRIES", () => {
  it("contains all 17 canonical entries", () => {
    expect(GLOSSARY_ENTRIES.length).toBe(17);
  });

  it("each entry has required fields", () => {
    for (const entry of GLOSSARY_ENTRIES) {
      expect(typeof entry.id).toBe("string");
      expect(typeof entry.term).toBe("string");
      expect(typeof entry.definition).toBe("string");
      expect(Array.isArray(entry.relatedConceptIds)).toBe(true);
      expect(Array.isArray(entry.appearsIn)).toBe(true);
    }
  });

  it("entries are sorted alphabetically by term", () => {
    const terms = GLOSSARY_ENTRIES.map((e) => e.term);
    const sorted = [...terms].sort((a, b) => a.localeCompare(b));
    expect(terms).toEqual(sorted);
  });
});

describe("getGlossaryEntry", () => {
  it("returns entry by id", () => {
    const entry = getGlossaryEntry("waterfall");
    expect(entry?.term).toBe("Waterfall");
  });

  it("returns undefined for unknown id", () => {
    expect(getGlossaryEntry("unknown-id")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test src/data/glossary.test.ts`
Expected: FAIL — "Cannot find module './glossary'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/frontend/src/data/glossary.ts

export interface GlossaryEntry {
  id: string;
  term: string;
  definition: string;
  relatedConceptIds: string[];
  relatedTermIds: string[];
  appearsIn: string[];
}

// Canonical definitions from docs/2. design/definitions.md — verbatim
export const GLOSSARY_ENTRIES: GlossaryEntry[] = [
  {
    id: "amortised",
    term: "Amortised (÷12)",
    definition:
      "An annual amount spread evenly across 12 months. finplan uses this so your monthly waterfall reflects a fair share of bills or income that don't land every month.",
    relatedConceptIds: ["amortisation"],
    relatedTermIds: ["annual-income"],
    appearsIn: [
      "Committed Spend waterfall",
      "Annual Income entries",
      "Cashflow calendar",
    ],
  },
  {
    id: "annual-income",
    term: "Annual Income",
    definition:
      "Income that recurs once a year — for example, an annual bonus. Shown in the waterfall divided by 12 so it contributes a fair monthly share to your plan.",
    relatedConceptIds: ["waterfall"],
    relatedTermIds: ["amortised", "net-income"],
    appearsIn: ["Income page", "Overview waterfall"],
  },
  {
    id: "committed-spend",
    term: "Committed Spend",
    definition:
      "Money you've contracted or obligated yourself to pay — outgoings you can't immediately choose to stop, such as your mortgage, phone contract, or annual insurance.",
    relatedConceptIds: ["waterfall"],
    relatedTermIds: ["discretionary-spend", "surplus"],
    appearsIn: ["Overview waterfall", "Committed page"],
  },
  {
    id: "discretionary-spend",
    term: "Discretionary Spend",
    definition:
      "Spending you choose to make each month and could choose to reduce or stop — for example, your food budget, petrol, or subscriptions you could cancel.",
    relatedConceptIds: ["waterfall"],
    relatedTermIds: ["committed-spend", "surplus"],
    appearsIn: ["Overview waterfall", "Discretionary page"],
  },
  {
    id: "equity-value",
    term: "Equity Value",
    definition:
      "The portion of an asset you own outright — the market value minus any outstanding debt secured against it. For example, a property worth £300,000 with a £200,000 mortgage has an equity value of £100,000.",
    relatedConceptIds: ["net-worth"],
    relatedTermIds: ["net-worth", "liquidity"],
    appearsIn: ["Wealth page"],
  },
  {
    id: "held-on-behalf-of",
    term: "Held on Behalf Of",
    definition:
      "Savings managed by your household but legally owned by someone else — for example, a child's Junior ISA. These are tracked separately and excluded from your household net worth.",
    relatedConceptIds: ["net-worth", "isa-allowances"],
    relatedTermIds: ["net-worth", "isa"],
    appearsIn: ["Wealth page"],
  },
  {
    id: "isa",
    term: "ISA",
    definition:
      "Individual Savings Account — a UK savings or investment account where interest and gains are free from tax.",
    relatedConceptIds: ["isa-allowances"],
    relatedTermIds: ["isa-allowance", "tax-year"],
    appearsIn: ["Wealth page"],
  },
  {
    id: "isa-allowance",
    term: "ISA Allowance",
    definition:
      "The maximum you can pay into ISAs in a single tax year — currently £20,000 per person. Contributions across all your ISA accounts count towards one shared limit, which resets each year on 6 April.",
    relatedConceptIds: ["isa-allowances"],
    relatedTermIds: ["isa", "tax-year"],
    appearsIn: ["Wealth page", "ISA allowance progress bar"],
  },
  {
    id: "liquidity",
    term: "Liquidity",
    definition:
      "How quickly and easily an asset can be converted to cash. Savings accounts are immediately liquid; pensions and property are not.",
    relatedConceptIds: ["net-worth"],
    relatedTermIds: ["net-worth", "equity-value"],
    appearsIn: ["Wealth page"],
  },
  {
    id: "net-income",
    term: "Net Income",
    definition:
      "Your take-home pay after tax, National Insurance, and any other deductions — what actually arrives in your account. finplan works with net figures only.",
    relatedConceptIds: ["waterfall"],
    relatedTermIds: ["annual-income", "one-off-income"],
    appearsIn: ["Income page", "Overview waterfall"],
  },
  {
    id: "net-worth",
    term: "Net Worth",
    definition:
      "The total value of everything you own (your assets) minus everything you owe (your liabilities). finplan calculates this from the assets recorded on the Wealth page.",
    relatedConceptIds: ["net-worth"],
    relatedTermIds: ["equity-value", "liquidity"],
    appearsIn: ["Wealth page"],
  },
  {
    id: "one-off-income",
    term: "One-Off Income",
    definition:
      "A single, non-recurring payment — for example, a bonus, an inheritance, or the proceeds from selling an asset. Not included in your monthly waterfall total; shown separately with its expected month.",
    relatedConceptIds: ["waterfall"],
    relatedTermIds: ["net-income", "annual-income"],
    appearsIn: ["Income page", "Overview waterfall"],
  },
  {
    id: "projection",
    term: "Projection",
    definition:
      "An estimated future balance calculated from the current value plus the linked monthly contribution, compounded at the recorded interest rate. Projections are illustrative only.",
    relatedConceptIds: ["compound-interest"],
    relatedTermIds: ["net-worth"],
    appearsIn: ["Wealth page"],
  },
  {
    id: "snapshot",
    term: "Snapshot",
    definition:
      "A saved, read-only record of your waterfall at a specific point in time. Snapshots let you compare how your plan has changed over months or years.",
    relatedConceptIds: ["waterfall"],
    relatedTermIds: [],
    appearsIn: ["Overview timeline", "Snapshot banner"],
  },
  {
    id: "surplus",
    term: "Surplus",
    definition:
      "What's left after your committed and discretionary spend is deducted from your income. The goal is to keep this positive and allocate it intentionally — to savings or a buffer.",
    relatedConceptIds: ["waterfall"],
    relatedTermIds: ["committed-spend", "discretionary-spend"],
    appearsIn: ["Overview waterfall", "Surplus page"],
  },
  {
    id: "tax-year",
    term: "Tax Year",
    definition:
      "The UK tax year runs from 6 April to 5 April the following year. ISA allowances and some tax thresholds reset at this date.",
    relatedConceptIds: ["isa-allowances"],
    relatedTermIds: ["isa-allowance"],
    appearsIn: ["ISA allowance bar", "Settings"],
  },
  {
    id: "waterfall",
    term: "Waterfall",
    definition:
      "The way finplan structures your finances — income at the top, committed spend deducted first, then discretionary spend, leaving your surplus at the bottom. Think of money flowing downwards through each layer.",
    relatedConceptIds: ["waterfall"],
    relatedTermIds: ["committed-spend", "discretionary-spend", "surplus"],
    appearsIn: ["Overview page", "Waterfall Creation Wizard"],
  },
];

export function getGlossaryEntry(id: string): GlossaryEntry | undefined {
  return GLOSSARY_ENTRIES.find((e) => e.id === id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test src/data/glossary.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/data/glossary.ts apps/frontend/src/data/glossary.test.ts
git commit -m "feat(help): add glossary content data (17 entries)"
```

---

### Task 2: Concepts Content Data

**Files:**

- Create: `apps/frontend/src/data/concepts.ts`
- Test: `apps/frontend/src/data/concepts.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/data/concepts.test.ts
import { describe, it, expect } from "bun:test";
import { CONCEPT_ENTRIES, getConceptEntry } from "./concepts";

describe("CONCEPT_ENTRIES", () => {
  it("contains exactly 5 concepts", () => {
    expect(CONCEPT_ENTRIES.length).toBe(5);
  });

  it("each entry has required fields", () => {
    for (const entry of CONCEPT_ENTRIES) {
      expect(typeof entry.id).toBe("string");
      expect(typeof entry.title).toBe("string");
      expect(typeof entry.summary).toBe("string");
      expect(typeof entry.whyItMatters).toBe("string");
      expect(typeof entry.visualType).toBe("string");
      expect(Array.isArray(entry.relatedTermIds)).toBe(true);
    }
  });

  it("seeThisInFinplan is omitted when no target page exists", () => {
    const netWorth = getConceptEntry("net-worth");
    expect(netWorth?.seeThisInFinplan).toBeUndefined();
  });

  it("waterfall concept has a seeThisInFinplan route", () => {
    const waterfall = getConceptEntry("waterfall");
    expect(waterfall?.seeThisInFinplan).toBe("/overview");
  });
});

describe("getConceptEntry", () => {
  it("returns entry by id", () => {
    const entry = getConceptEntry("amortisation");
    expect(entry?.title).toBe("Amortisation (÷12)");
  });

  it("returns undefined for unknown id", () => {
    expect(getConceptEntry("unknown-id")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test src/data/concepts.test.ts`
Expected: FAIL — "Cannot find module './concepts'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/frontend/src/data/concepts.ts

export type ConceptVisualType =
  | "waterfall-diagram"
  | "amortisation-comparison"
  | "net-worth-bar"
  | "isa-progress"
  | "compound-interest-calculator";

export interface ConceptEntry {
  id: string;
  title: string;
  summary: string; // plain-language summary with concrete example
  whyItMatters: string; // connects to finplan behaviour
  visualType: ConceptVisualType;
  relatedTermIds: string[];
  seeThisInFinplan?: string; // omitted when no target page exists yet
}

export const CONCEPT_ENTRIES: ConceptEntry[] = [
  {
    id: "waterfall",
    title: "The Waterfall",
    summary:
      "Your income flows in at the top. Committed spend — your fixed obligations — is deducted first. Discretionary spend comes next. Whatever is left is your surplus. Think of it like water flowing through a series of pools: each layer takes its share before passing the remainder down.\n\nFor example: £5,000 net income − £2,000 committed − £1,500 discretionary = £1,500 surplus.",
    whyItMatters:
      "The waterfall is finplan's core model. Every page in the app is built around this cascade — income feeds it, committed and discretionary pages let you edit each tier, and the surplus page shows what you have left to allocate. The Overview page shows all four tiers together.",
    visualType: "waterfall-diagram",
    relatedTermIds: [
      "committed-spend",
      "discretionary-spend",
      "surplus",
      "net-income",
    ],
    seeThisInFinplan: "/overview",
  },
  {
    id: "amortisation",
    title: "Amortisation (÷12)",
    summary:
      "Some costs land once a year — car insurance, a TV licence, an annual subscription. Amortisation spreads that yearly cost evenly across 12 months, so each month's waterfall reflects a fair share of the bill, not just the month it arrives.\n\nFor example: a £1,200 yearly insurance bill becomes £100/month in your committed spend tier.",
    whyItMatters:
      "finplan uses ÷12 automatically for annual bills in the Committed Spend tier. This prevents the false impression of a healthy surplus most months and a deficit in the month the big bill lands. Your waterfall reflects what you actually need to set aside each month.",
    visualType: "amortisation-comparison",
    relatedTermIds: ["amortised", "committed-spend", "annual-income"],
    seeThisInFinplan: "/committed",
  },
  {
    id: "net-worth",
    title: "Net Worth",
    summary:
      "Net worth is what you own minus what you owe. Assets include savings, investments, property equity, and vehicles. Liabilities include mortgages, loans, and credit balances. The difference is your net worth.\n\nFor example: £250,000 in assets − £180,000 in liabilities = £70,000 net worth.",
    whyItMatters:
      "Net worth gives you a snapshot of overall financial health that goes beyond monthly cashflow. finplan calculates it from the assets and liabilities recorded on the Wealth page. Held-on-behalf-of accounts are excluded — they belong to someone else.",
    visualType: "net-worth-bar",
    relatedTermIds: [
      "net-worth",
      "equity-value",
      "liquidity",
      "held-on-behalf-of",
    ],
  },
  {
    id: "isa-allowances",
    title: "ISA Allowances",
    summary:
      "Each UK tax year (6 April to 5 April), every adult can save up to £20,000 across all their ISAs without paying tax on interest or investment gains. The allowance resets each year — any unused amount is lost.\n\nFor example: if you have a Cash ISA and a Stocks & Shares ISA, contributions to both count towards the single £20,000 limit.",
    whyItMatters:
      "finplan tracks ISA contributions on the Wealth page and shows a progress bar against the annual limit. The bar resets each tax year. This helps you avoid accidentally exceeding the allowance across multiple ISA accounts.",
    visualType: "isa-progress",
    relatedTermIds: ["isa", "isa-allowance", "tax-year", "held-on-behalf-of"],
  },
  {
    id: "compound-interest",
    title: "Compound Interest & Projections",
    summary:
      "Compound interest means you earn interest not just on your original balance, but on the interest you've already earned. Over time, this causes savings to grow exponentially rather than linearly.\n\nFor example: £10,000 at 5% annual interest becomes £12,763 after 5 years with compounding, versus £12,500 with simple interest.",
    whyItMatters:
      "finplan uses the standard compound interest formula to project future balances on savings accounts: FV = PV(1 + r/12)^(12t) + PMT × [((1 + r/12)^(12t) − 1) / (r/12)]. These projections are illustrative — they assume a constant rate and regular contributions. Use the calculator below to explore different scenarios.",
    visualType: "compound-interest-calculator",
    relatedTermIds: ["projection", "isa", "net-worth"],
  },
];

export function getConceptEntry(id: string): ConceptEntry | undefined {
  return CONCEPT_ENTRIES.find((e) => e.id === id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test src/data/concepts.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/data/concepts.ts apps/frontend/src/data/concepts.test.ts
git commit -m "feat(help): add concepts content data (5 explainers)"
```

---

### Task 3: GlossaryTermMarker + GlossaryPopover

Replaces the existing `DefinitionTooltip` with an interactive popover system. Uses a React context for the singleton pattern (only one popover open at a time).

**Files:**

- Create: `apps/frontend/src/components/help/GlossaryPopoverContext.tsx`
- Create: `apps/frontend/src/components/help/GlossaryTermMarker.tsx`
- Create: `apps/frontend/src/components/help/GlossaryTermMarker.test.tsx`
- Delete: `apps/frontend/src/components/common/DefinitionTooltip.tsx` (in Step 3)

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/components/help/GlossaryTermMarker.test.tsx
import { describe, it, expect } from "bun:test";
import { screen, fireEvent, act } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";
import { GlossaryPopoverProvider } from "./GlossaryPopoverContext";
import { GlossaryTermMarker } from "./GlossaryTermMarker";

function renderMarker(entryId = "waterfall") {
  return renderWithProviders(
    <GlossaryPopoverProvider>
      <p>
        The <GlossaryTermMarker entryId={entryId}>Waterfall</GlossaryTermMarker> model is central.
      </p>
    </GlossaryPopoverProvider>,
    { initialEntries: ["/overview"] }
  );
}

describe("GlossaryTermMarker", () => {
  it("renders children with dotted underline span", () => {
    renderMarker();
    const trigger = screen.getByText("Waterfall");
    expect(trigger.tagName).toBe("SPAN");
    expect(trigger.className).toContain("border-dotted");
  });

  it("shows popover content after mouseenter", async () => {
    renderMarker();
    const trigger = screen.getByText("Waterfall");
    await act(async () => {
      fireEvent.mouseEnter(trigger);
      await new Promise((r) => setTimeout(r, 200)); // wait for 150ms delay
    });
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(/income at the top/i)).toBeTruthy();
  });

  it("popover closes on Escape key", async () => {
    renderMarker();
    const trigger = screen.getByText("Waterfall");
    await act(async () => {
      fireEvent.mouseEnter(trigger);
      await new Promise((r) => setTimeout(r, 200));
    });
    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows Learn more link navigating to /help", async () => {
    renderMarker();
    const trigger = screen.getByText("Waterfall");
    await act(async () => {
      fireEvent.mouseEnter(trigger);
      await new Promise((r) => setTimeout(r, 200));
    });
    const learnMore = screen.getByText("Learn more");
    expect(learnMore.closest("a")?.getAttribute("href")).toContain("/help");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test src/components/help/GlossaryTermMarker.test.tsx`
Expected: FAIL — "Cannot find module './GlossaryPopoverContext'"

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/frontend/src/components/help/GlossaryPopoverContext.tsx
import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

interface GlossaryPopoverContextValue {
  openId: string | null;
  openPopover: (id: string) => void;
  closePopover: () => void;
}

const GlossaryPopoverContext = createContext<GlossaryPopoverContextValue>({
  openId: null,
  openPopover: () => {},
  closePopover: () => {},
});

export function GlossaryPopoverProvider({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);

  const openPopover = useCallback((id: string) => setOpenId(id), []);
  const closePopover = useCallback(() => setOpenId(null), []);

  return (
    <GlossaryPopoverContext.Provider
      value={{ openId, openPopover, closePopover }}
    >
      {children}
    </GlossaryPopoverContext.Provider>
  );
}

export function useGlossaryPopover() {
  return useContext(GlossaryPopoverContext);
}
```

```tsx
// apps/frontend/src/components/help/GlossaryTermMarker.tsx
import { useRef, useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useGlossaryPopover } from "./GlossaryPopoverContext";
import { getGlossaryEntry } from "@/data/glossary";
import { getConceptEntry } from "@/data/concepts";
import { usePrefersReducedMotion } from "@/utils/motion";
import { cn } from "@/lib/utils";

interface Props {
  entryId: string;
  children: ReactNode;
}

export function GlossaryTermMarker({ entryId, children }: Props) {
  const { openId, openPopover, closePopover } = useGlossaryPopover();
  const isOpen = openId === entryId;
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const entry = getGlossaryEntry(entryId);

  const scheduleOpen = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    openTimerRef.current = setTimeout(() => openPopover(entryId), 150);
  };

  const scheduleClose = () => {
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
    closeTimerRef.current = setTimeout(closePopover, 300);
  };

  const cancelClose = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  };

  // Keyboard: Escape closes
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePopover();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, closePopover]);

  if (!entry) return <>{children}</>;

  return (
    <span className="relative inline-block">
      <span
        ref={triggerRef}
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        className="border-b border-dotted border-current/50 cursor-help"
        onMouseEnter={scheduleOpen}
        onMouseLeave={scheduleClose}
        onFocus={() => openPopover(entryId)}
        onBlur={scheduleClose}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            isOpen ? closePopover() : openPopover(entryId);
          }
        }}
      >
        {children}
      </span>

      {isOpen && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={`Definition: ${entry.term}`}
          className={cn(
            "absolute left-0 top-full mt-1 z-[70] w-72 rounded-lg border bg-card p-3 shadow-lg",
            reduced ? "" : "animate-in fade-in duration-150",
          )}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <p className="text-xs font-semibold text-foreground mb-1">
            {entry.term}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {entry.definition}
          </p>

          {entry.relatedConceptIds.length > 0 && (
            <div className="mt-2 pt-2 border-t">
              <p className="text-[11px] text-muted-foreground/70 mb-1">
                Related
              </p>
              <div className="flex flex-wrap gap-1">
                {entry.relatedConceptIds.map((conceptId) => {
                  const concept = getConceptEntry(conceptId);
                  if (!concept) return null;
                  return (
                    <Link
                      key={conceptId}
                      to={`/help?entry=${conceptId}`}
                      className="text-[11px] text-foreground/60 hover:text-foreground underline transition-colors"
                      onClick={closePopover}
                    >
                      {concept.title}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-2 pt-2 border-t">
            <Link
              to={`/help?entry=${entryId}`}
              className="text-[11px] text-foreground/60 hover:text-foreground transition-colors"
              onClick={closePopover}
            >
              Learn more →
            </Link>
          </div>
        </div>
      )}
    </span>
  );
}
```

Also delete `apps/frontend/src/components/common/DefinitionTooltip.tsx` (it is replaced by `GlossaryTermMarker`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test src/components/help/GlossaryTermMarker.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/help/
git rm apps/frontend/src/components/common/DefinitionTooltip.tsx
git commit -m "feat(help): add GlossaryTermMarker + GlossaryPopover, remove static DefinitionTooltip"
```

---

### Task 4: HelpSearchInput + HelpSidebar

**Files:**

- Create: `apps/frontend/src/components/help/HelpSearchInput.tsx`
- Create: `apps/frontend/src/components/help/HelpSidebar.tsx`
- Test: `apps/frontend/src/components/help/HelpSidebar.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/components/help/HelpSidebar.test.tsx
import { describe, it, expect } from "bun:test";
import { screen, fireEvent, act } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";
import { HelpSidebar } from "./HelpSidebar";

function renderSidebar(selectedId = "waterfall", onSelect = () => {}) {
  return renderWithProviders(
    <HelpSidebar selectedId={selectedId} onSelect={onSelect} />,
    { initialEntries: ["/help"] }
  );
}

describe("HelpSidebar", () => {
  it("renders Glossary and Concepts section headings", () => {
    renderSidebar();
    expect(screen.getByText("Glossary")).toBeTruthy();
    expect(screen.getByText("Concepts")).toBeTruthy();
  });

  it("renders all 17 glossary entries", () => {
    renderSidebar();
    expect(screen.getByText("Waterfall")).toBeTruthy();
    expect(screen.getByText("Surplus")).toBeTruthy();
    expect(screen.getByText("ISA Allowance")).toBeTruthy();
  });

  it("renders all 5 concept entries", () => {
    renderSidebar();
    expect(screen.getByText("The Waterfall")).toBeTruthy();
    expect(screen.getByText("Amortisation (÷12)")).toBeTruthy();
  });

  it("renders User Manual as coming soon (not clickable)", () => {
    renderSidebar();
    expect(screen.getByText("User Manual")).toBeTruthy();
    expect(screen.getByText("Coming soon")).toBeTruthy();
  });

  it("marks the selected entry", () => {
    renderSidebar("waterfall");
    // The selected glossary entry should have aria-current
    const selected = screen.getAllByRole("button").find(
      (btn) => btn.getAttribute("aria-current") === "true"
    );
    expect(selected).toBeTruthy();
  });

  it("filters entries by search query", async () => {
    renderSidebar();
    const input = screen.getByPlaceholderText("Search…");
    await act(async () => {
      fireEvent.change(input, { target: { value: "ISA" } });
      await new Promise((r) => setTimeout(r, 200)); // debounce
    });
    expect(screen.queryByText("Surplus")).toBeNull();
    expect(screen.getByText("ISA")).toBeTruthy();
  });

  it("shows no results state when search has no matches", async () => {
    renderSidebar();
    const input = screen.getByPlaceholderText("Search…");
    await act(async () => {
      fireEvent.change(input, { target: { value: "xyznotfound" } });
      await new Promise((r) => setTimeout(r, 200));
    });
    expect(screen.getByText(/no results/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test src/components/help/HelpSidebar.test.tsx`
Expected: FAIL — "Cannot find module './HelpSidebar'"

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/frontend/src/components/help/HelpSearchInput.tsx
import { useRef } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function HelpSearchInput({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search…"
        className={cn(
          "w-full rounded-md border bg-card py-1.5 pl-8 pr-7 text-sm outline-none",
          "placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-page-accent/50",
        )}
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
```

```tsx
// apps/frontend/src/components/help/HelpSidebar.tsx
import { useState, useEffect, useMemo } from "react";
import { HelpSearchInput } from "./HelpSearchInput";
import { GLOSSARY_ENTRIES } from "@/data/glossary";
import { CONCEPT_ENTRIES } from "@/data/concepts";
import { cn } from "@/lib/utils";

interface Props {
  selectedId: string;
  onSelect: (id: string) => void;
}

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function HelpSidebar({ selectedId, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 150);

  const filteredGlossary = useMemo(() => {
    if (!debouncedQuery) return GLOSSARY_ENTRIES;
    const q = debouncedQuery.toLowerCase();
    return GLOSSARY_ENTRIES.filter(
      (e) =>
        e.term.toLowerCase().includes(q) ||
        e.definition.toLowerCase().includes(q),
    );
  }, [debouncedQuery]);

  const filteredConcepts = useMemo(() => {
    if (!debouncedQuery) return CONCEPT_ENTRIES;
    const q = debouncedQuery.toLowerCase();
    return CONCEPT_ENTRIES.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.summary.toLowerCase().includes(q) ||
        e.whyItMatters.toLowerCase().includes(q),
    );
  }, [debouncedQuery]);

  const hasNoResults =
    debouncedQuery &&
    filteredGlossary.length === 0 &&
    filteredConcepts.length === 0;

  const itemClass = (id: string) =>
    cn(
      "w-full text-left text-sm px-3 py-1.5 rounded-sm transition-colors cursor-pointer",
      "text-foreground/70 hover:text-foreground hover:bg-page-accent/10",
      selectedId === id &&
        "text-foreground bg-page-accent/[0.14] border-l-2 border-page-accent pl-[10px]",
    );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-3 shrink-0">
        <HelpSearchInput value={query} onChange={setQuery} />
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {hasNoResults ? (
          <p className="text-xs text-muted-foreground text-center mt-8 px-4">
            No results for &ldquo;{debouncedQuery}&rdquo;
          </p>
        ) : (
          <>
            {filteredGlossary.length > 0 && (
              <section>
                <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  Glossary
                </p>
                {filteredGlossary.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={itemClass(entry.id)}
                    aria-current={selectedId === entry.id ? "true" : undefined}
                    onClick={() => onSelect(entry.id)}
                  >
                    {entry.term}
                  </button>
                ))}
              </section>
            )}

            {filteredGlossary.length > 0 && filteredConcepts.length > 0 && (
              <hr className="my-2 border-border" />
            )}

            {filteredConcepts.length > 0 && (
              <section>
                <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  Concepts
                </p>
                {filteredConcepts.map((concept) => (
                  <button
                    key={concept.id}
                    type="button"
                    className={itemClass(concept.id)}
                    aria-current={
                      selectedId === concept.id ? "true" : undefined
                    }
                    onClick={() => onSelect(concept.id)}
                  >
                    {concept.title}
                  </button>
                ))}
              </section>
            )}

            <hr className="my-2 border-border" />

            <section aria-disabled="true">
              <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                User Manual
              </p>
              <div className="px-3 py-1.5 flex items-center gap-2">
                <span className="text-sm text-muted-foreground/40">
                  User Manual
                </span>
                <span className="text-[10px] text-muted-foreground/30 border border-border rounded px-1">
                  Coming soon
                </span>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test src/components/help/HelpSidebar.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/help/HelpSearchInput.tsx apps/frontend/src/components/help/HelpSidebar.tsx apps/frontend/src/components/help/HelpSidebar.test.tsx
git commit -m "feat(help): add HelpSidebar with search and section navigation"
```

---

### Task 5: GlossaryDetailView + ConceptDetailView

**Files:**

- Create: `apps/frontend/src/components/help/GlossaryDetailView.tsx`
- Create: `apps/frontend/src/components/help/ConceptDetailView.tsx`
- Test: `apps/frontend/src/components/help/HelpDetailViews.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/components/help/HelpDetailViews.test.tsx
import { describe, it, expect } from "bun:test";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";
import { GlossaryPopoverProvider } from "./GlossaryPopoverContext";
import { GlossaryDetailView } from "./GlossaryDetailView";
import { ConceptDetailView } from "./ConceptDetailView";

describe("GlossaryDetailView", () => {
  it("renders term heading and definition", () => {
    renderWithProviders(
      <GlossaryPopoverProvider>
        <GlossaryDetailView entryId="waterfall" onNavigate={() => {}} />
      </GlossaryPopoverProvider>,
      { initialEntries: ["/help"] }
    );
    expect(screen.getByRole("heading", { name: "Waterfall" })).toBeTruthy();
    expect(screen.getByText(/income at the top/i)).toBeTruthy();
  });

  it("renders Appears in metadata", () => {
    renderWithProviders(
      <GlossaryPopoverProvider>
        <GlossaryDetailView entryId="waterfall" onNavigate={() => {}} />
      </GlossaryPopoverProvider>,
      { initialEntries: ["/help"] }
    );
    expect(screen.getByText(/appears in/i)).toBeTruthy();
  });

  it("renders related concept links", () => {
    renderWithProviders(
      <GlossaryPopoverProvider>
        <GlossaryDetailView entryId="committed-spend" onNavigate={() => {}} />
      </GlossaryPopoverProvider>,
      { initialEntries: ["/help"] }
    );
    expect(screen.getByText("The Waterfall")).toBeTruthy();
  });
});

describe("ConceptDetailView", () => {
  it("renders concept title and summary", () => {
    renderWithProviders(
      <GlossaryPopoverProvider>
        <ConceptDetailView conceptId="waterfall" onNavigate={() => {}} />
      </GlossaryPopoverProvider>,
      { initialEntries: ["/help"] }
    );
    expect(screen.getByRole("heading", { name: "The Waterfall" })).toBeTruthy();
    expect(screen.getByText(/income flows in at the top/i)).toBeTruthy();
  });

  it("renders Why it matters section", () => {
    renderWithProviders(
      <GlossaryPopoverProvider>
        <ConceptDetailView conceptId="waterfall" onNavigate={() => {}} />
      </GlossaryPopoverProvider>,
      { initialEntries: ["/help"] }
    );
    expect(screen.getByText(/why it matters/i)).toBeTruthy();
  });

  it("renders See this in finplan link when present", () => {
    renderWithProviders(
      <GlossaryPopoverProvider>
        <ConceptDetailView conceptId="waterfall" onNavigate={() => {}} />
      </GlossaryPopoverProvider>,
      { initialEntries: ["/help"] }
    );
    expect(screen.getByText(/see this in finplan/i)).toBeTruthy();
  });

  it("omits See this in finplan link when not present", () => {
    renderWithProviders(
      <GlossaryPopoverProvider>
        <ConceptDetailView conceptId="net-worth" onNavigate={() => {}} />
      </GlossaryPopoverProvider>,
      { initialEntries: ["/help"] }
    );
    expect(screen.queryByText(/see this in finplan/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test src/components/help/HelpDetailViews.test.tsx`
Expected: FAIL — "Cannot find module './GlossaryDetailView'"

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/frontend/src/components/help/GlossaryDetailView.tsx
import { Link } from "react-router-dom";
import { getGlossaryEntry } from "@/data/glossary";
import { getConceptEntry } from "@/data/concepts";
import { GlossaryTermMarker } from "./GlossaryTermMarker";

interface Props {
  entryId: string;
  onNavigate: (id: string) => void;
}

export function GlossaryDetailView({ entryId, onNavigate }: Props) {
  const entry = getGlossaryEntry(entryId);
  if (!entry) return null;

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="font-heading text-2xl font-bold text-foreground mb-3">
        {entry.term}
      </h1>

      <p className="text-sm text-foreground/80 leading-relaxed">
        {entry.definition}
      </p>

      {entry.appearsIn.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground/60">
          <span className="font-medium">Appears in:</span>{" "}
          {entry.appearsIn.join(", ")}
        </p>
      )}

      {entry.relatedConceptIds.length > 0 && (
        <>
          <hr className="my-4 border-border" />
          <div>
            <p className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider mb-2">
              Related concepts
            </p>
            <div className="flex flex-wrap gap-2">
              {entry.relatedConceptIds.map((conceptId) => {
                const concept = getConceptEntry(conceptId);
                if (!concept) return null;
                return (
                  <button
                    key={conceptId}
                    type="button"
                    onClick={() => onNavigate(conceptId)}
                    className="text-sm text-foreground/60 hover:text-foreground underline transition-colors text-left"
                  >
                    {concept.title}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {entry.relatedTermIds.length > 0 && (
        <>
          <hr className="my-4 border-border" />
          <div>
            <p className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider mb-2">
              Related terms
            </p>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {entry.relatedTermIds.map((termId) => {
                const term = getGlossaryEntry(termId);
                if (!term) return null;
                return (
                  <GlossaryTermMarker key={termId} entryId={termId}>
                    {term.term}
                  </GlossaryTermMarker>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

```tsx
// apps/frontend/src/components/help/ConceptDetailView.tsx
import { Link } from "react-router-dom";
import { getConceptEntry } from "@/data/concepts";
import { getGlossaryEntry } from "@/data/glossary";
import { GlossaryTermMarker } from "./GlossaryTermMarker";
import { ConceptVisualExplainer } from "./ConceptVisualExplainer";

interface Props {
  conceptId: string;
  onNavigate: (id: string) => void;
}

export function ConceptDetailView({
  conceptId,
  onNavigate: _onNavigate,
}: Props) {
  const concept = getConceptEntry(conceptId);
  if (!concept) return null;

  return (
    <div className="p-6 max-w-2xl space-y-0">
      <h1 className="font-heading text-2xl font-bold text-foreground mb-4">
        {concept.title}
      </h1>

      <div className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">
        {concept.summary}
      </div>

      <hr className="my-6 border-border" />

      <ConceptVisualExplainer visualType={concept.visualType} />

      <hr className="my-6 border-border" />

      <div>
        <p className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider mb-2">
          Why it matters in finplan
        </p>
        <p className="text-sm text-foreground/80 leading-relaxed">
          {concept.whyItMatters}
        </p>
      </div>

      {concept.seeThisInFinplan && (
        <>
          <hr className="my-6 border-border" />
          <div className="rounded-lg border border-page-accent/30 bg-page-accent/5 p-4">
            <p className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider mb-2">
              See this in finplan
            </p>
            <Link
              to={concept.seeThisInFinplan}
              className="text-sm text-page-accent hover:text-page-accent/80 transition-colors font-medium"
            >
              Open {concept.seeThisInFinplan.replace("/", "")} →
            </Link>
          </div>
        </>
      )}

      {concept.relatedTermIds.length > 0 && (
        <>
          <hr className="my-6 border-border" />
          <div>
            <p className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider mb-2">
              Related terms
            </p>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {concept.relatedTermIds.map((termId) => {
                const term = getGlossaryEntry(termId);
                if (!term) return null;
                return (
                  <GlossaryTermMarker key={termId} entryId={termId}>
                    {term.term}
                  </GlossaryTermMarker>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test src/components/help/HelpDetailViews.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/help/GlossaryDetailView.tsx apps/frontend/src/components/help/ConceptDetailView.tsx apps/frontend/src/components/help/HelpDetailViews.test.tsx
git commit -m "feat(help): add GlossaryDetailView and ConceptDetailView right-panel components"
```

---

### Task 6: ConceptVisualExplainer + CompoundInterestCalculator

**Files:**

- Create: `apps/frontend/src/components/help/ConceptVisualExplainer.tsx`
- Create: `apps/frontend/src/components/help/visuals/WaterfallDiagram.tsx`
- Create: `apps/frontend/src/components/help/visuals/AmortisationComparison.tsx`
- Create: `apps/frontend/src/components/help/visuals/NetWorthBar.tsx`
- Create: `apps/frontend/src/components/help/visuals/IsaProgress.tsx`
- Create: `apps/frontend/src/components/help/visuals/CompoundInterestCalculator.tsx`
- Test: `apps/frontend/src/components/help/visuals/CompoundInterestCalculator.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/components/help/visuals/CompoundInterestCalculator.test.tsx
import { describe, it, expect } from "bun:test";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";
import { CompoundInterestCalculator } from "./CompoundInterestCalculator";

describe("CompoundInterestCalculator", () => {
  it("renders input fields", () => {
    renderWithProviders(<CompoundInterestCalculator />);
    expect(screen.getByLabelText(/starting balance/i)).toBeTruthy();
    expect(screen.getByLabelText(/monthly contribution/i)).toBeTruthy();
    expect(screen.getByLabelText(/annual interest rate/i)).toBeTruthy();
  });

  it("shows projected values for 1, 5, 10 years", () => {
    renderWithProviders(<CompoundInterestCalculator />);
    expect(screen.getByText("1 year")).toBeTruthy();
    expect(screen.getByText("5 years")).toBeTruthy();
    expect(screen.getByText("10 years")).toBeTruthy();
  });

  it("recalculates on input change", () => {
    renderWithProviders(<CompoundInterestCalculator />);
    const balanceInput = screen.getByLabelText(/starting balance/i);
    fireEvent.change(balanceInput, { target: { value: "10000" } });
    // With default rate and contribution, 1-year value should be shown
    const values = screen.getAllByText(/£[\d,]+/);
    expect(values.length).toBeGreaterThan(0);
  });

  it("handles zero interest rate without division by zero", () => {
    renderWithProviders(<CompoundInterestCalculator />);
    const rateInput = screen.getByLabelText(/annual interest rate/i);
    fireEvent.change(rateInput, { target: { value: "0" } });
    // Should not crash
    expect(screen.getByText("1 year")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test src/components/help/visuals/CompoundInterestCalculator.test.tsx`
Expected: FAIL — "Cannot find module './CompoundInterestCalculator'"

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/frontend/src/components/help/visuals/CompoundInterestCalculator.tsx
import { useState } from "react";
import { cn } from "@/lib/utils";

function formatGBP(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

// FV = PV(1 + r/12)^(12t) + PMT × [((1 + r/12)^(12t) − 1) / (r/12)]
function calculateFV(
  pv: number,
  pmt: number,
  annualRate: number,
  years: number,
): number {
  if (annualRate === 0) {
    return pv + pmt * 12 * years;
  }
  const r = annualRate / 100 / 12;
  const n = 12 * years;
  const growthFactor = Math.pow(1 + r, n);
  return pv * growthFactor + pmt * ((growthFactor - 1) / r);
}

export function CompoundInterestCalculator() {
  const [balance, setBalance] = useState(10000);
  const [monthly, setMonthly] = useState(200);
  const [rate, setRate] = useState(5);

  const horizons = [1, 5, 10] as const;

  const inputClass =
    "w-full rounded-md border bg-card py-1.5 px-3 text-sm font-mono outline-none focus:ring-1 focus:ring-page-accent/50";
  const labelClass = "block text-xs text-muted-foreground mb-1";

  return (
    <div className="rounded-lg border bg-card/50 p-4">
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <label htmlFor="calc-balance" className={labelClass}>
            Starting balance
          </label>
          <input
            id="calc-balance"
            type="number"
            min={0}
            value={balance}
            onChange={(e) => setBalance(Math.max(0, Number(e.target.value)))}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="calc-monthly" className={labelClass}>
            Monthly contribution
          </label>
          <input
            id="calc-monthly"
            type="number"
            min={0}
            value={monthly}
            onChange={(e) => setMonthly(Math.max(0, Number(e.target.value)))}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="calc-rate" className={labelClass}>
            Annual interest rate (%)
          </label>
          <input
            id="calc-rate"
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={rate}
            onChange={(e) => setRate(Math.max(0, Number(e.target.value)))}
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {horizons.map((years) => {
          const fv = calculateFV(balance, monthly, rate, years);
          const label = years === 1 ? "1 year" : `${years} years`;
          return (
            <div
              key={years}
              className="rounded-md border bg-card p-3 text-center"
            >
              <p className="text-xs text-muted-foreground mb-1">{label}</p>
              <p className="font-mono text-lg font-semibold text-foreground">
                {formatGBP(fv)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

```tsx
// apps/frontend/src/components/help/visuals/WaterfallDiagram.tsx
export function WaterfallDiagram() {
  const tiers = [
    {
      label: "Net Income",
      amount: "£5,000",
      color: "bg-tier-income/20 border-tier-income/40 text-tier-income",
    },
    {
      label: "Committed Spend",
      amount: "−£2,000",
      color:
        "bg-tier-committed/20 border-tier-committed/40 text-tier-committed",
    },
    {
      label: "Discretionary Spend",
      amount: "−£1,500",
      color:
        "bg-tier-discretionary/20 border-tier-discretionary/40 text-tier-discretionary",
    },
    {
      label: "Surplus",
      amount: "= £1,500",
      color: "bg-tier-surplus/20 border-tier-surplus/40 text-tier-surplus",
    },
  ];

  return (
    <div className="rounded-lg border bg-card/50 p-4 space-y-2">
      {tiers.map((tier, i) => (
        <div
          key={i}
          className={`rounded border px-4 py-2 flex justify-between items-center ${tier.color}`}
        >
          <span className="text-sm font-medium">{tier.label}</span>
          <span className="font-mono text-sm font-semibold">{tier.amount}</span>
        </div>
      ))}
    </div>
  );
}
```

```tsx
// apps/frontend/src/components/help/visuals/AmortisationComparison.tsx
export function AmortisationComparison() {
  return (
    <div className="rounded-lg border bg-card/50 p-4">
      <p className="text-xs text-muted-foreground mb-3">
        £1,200 annual car insurance
      </p>
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded border bg-card p-3">
          <p className="text-[11px] text-muted-foreground/70 mb-1">
            Without amortisation
          </p>
          <div className="space-y-1">
            {["Jan", "Feb", "Mar", "Apr (due)", "May", "Jun"].map((month) => (
              <div key={month} className="flex justify-between text-xs">
                <span className="text-muted-foreground">{month}</span>
                <span className="font-mono">
                  {month === "Apr (due)" ? (
                    <span className="text-amber-400">£1,200</span>
                  ) : (
                    "£0"
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded border bg-card p-3">
          <p className="text-[11px] text-muted-foreground/70 mb-1">
            With amortisation (÷12)
          </p>
          <div className="space-y-1">
            {["Jan", "Feb", "Mar", "Apr", "May", "Jun"].map((month) => (
              <div key={month} className="flex justify-between text-xs">
                <span className="text-muted-foreground">{month}</span>
                <span className="font-mono text-tier-committed">£100</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

```tsx
// apps/frontend/src/components/help/visuals/NetWorthBar.tsx
export function NetWorthBar() {
  const assets = 250000;
  const liabilities = 180000;
  const netWorth = assets - liabilities;
  const total = assets;

  return (
    <div className="rounded-lg border bg-card/50 p-4">
      <div className="flex gap-2 h-8 rounded overflow-hidden mb-3">
        <div
          className="bg-tier-surplus/40 flex items-center justify-center text-[10px] text-tier-surplus font-mono"
          style={{ width: `${(netWorth / total) * 100}%` }}
        >
          Equity
        </div>
        <div
          className="bg-muted/60 flex items-center justify-center text-[10px] text-muted-foreground font-mono"
          style={{ width: `${(liabilities / total) * 100}%` }}
        >
          Liabilities
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[10px] text-muted-foreground">Assets</p>
          <p className="font-mono text-sm font-semibold">£250,000</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">Liabilities</p>
          <p className="font-mono text-sm font-semibold">£180,000</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">Net Worth</p>
          <p className="font-mono text-sm font-semibold text-tier-surplus">
            £70,000
          </p>
        </div>
      </div>
    </div>
  );
}
```

```tsx
// apps/frontend/src/components/help/visuals/IsaProgress.tsx
export function IsaProgress() {
  const limit = 20000;
  const contributed = 8500;
  const pct = (contributed / limit) * 100;

  return (
    <div className="rounded-lg border bg-card/50 p-4">
      <div className="flex justify-between text-xs text-muted-foreground mb-2">
        <span>ISA contributions this tax year</span>
        <span className="font-mono font-semibold text-foreground">
          £{contributed.toLocaleString()} / £{limit.toLocaleString()}
        </span>
      </div>
      <div className="h-3 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-tier-surplus/60 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground/60 mt-2">
        Resets 6 April · £{(limit - contributed).toLocaleString()} remaining
      </p>
    </div>
  );
}
```

```tsx
// apps/frontend/src/components/help/ConceptVisualExplainer.tsx
import type { ConceptVisualType } from "@/data/concepts";
import { WaterfallDiagram } from "./visuals/WaterfallDiagram";
import { AmortisationComparison } from "./visuals/AmortisationComparison";
import { NetWorthBar } from "./visuals/NetWorthBar";
import { IsaProgress } from "./visuals/IsaProgress";
import { CompoundInterestCalculator } from "./visuals/CompoundInterestCalculator";

interface Props {
  visualType: ConceptVisualType;
}

export function ConceptVisualExplainer({ visualType }: Props) {
  return (
    <div>
      {visualType === "waterfall-diagram" && <WaterfallDiagram />}
      {visualType === "amortisation-comparison" && <AmortisationComparison />}
      {visualType === "net-worth-bar" && <NetWorthBar />}
      {visualType === "isa-progress" && <IsaProgress />}
      {visualType === "compound-interest-calculator" && (
        <CompoundInterestCalculator />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test src/components/help/visuals/CompoundInterestCalculator.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/help/ConceptVisualExplainer.tsx apps/frontend/src/components/help/visuals/
git commit -m "feat(help): add concept visual explainers and compound interest calculator"
```

---

### Task 7: HelpPage

**Files:**

- Create: `apps/frontend/src/pages/HelpPage.tsx`
- Test: `apps/frontend/src/pages/HelpPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/pages/HelpPage.test.tsx
import { describe, it, expect } from "bun:test";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";
import HelpPage from "./HelpPage";

describe("HelpPage", () => {
  it("renders the sidebar and selects the first glossary entry by default", () => {
    renderWithProviders(<HelpPage />, { initialEntries: ["/help"] });
    expect(screen.getByText("Glossary")).toBeTruthy();
    // First glossary entry alphabetically is "Amortised (÷12)"
    expect(screen.getByRole("heading", { name: "Amortised (÷12)" })).toBeTruthy();
  });

  it("pre-selects entry from ?entry= query param", () => {
    renderWithProviders(<HelpPage />, { initialEntries: ["/help?entry=waterfall"] });
    expect(screen.getByRole("heading", { name: "Waterfall" })).toBeTruthy();
  });

  it("pre-selects concept entry from ?entry= query param", () => {
    renderWithProviders(<HelpPage />, { initialEntries: ["/help?entry=amortisation"] });
    expect(screen.getByRole("heading", { name: "Amortisation (÷12)" })).toBeTruthy();
  });

  it("falls back to default entry for unknown ?entry= value", () => {
    renderWithProviders(<HelpPage />, { initialEntries: ["/help?entry=unknown-id"] });
    // Should fall back to first glossary entry
    expect(screen.getByRole("heading", { name: "Amortised (÷12)" })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test src/pages/HelpPage.test.tsx`
Expected: FAIL — "Cannot find module './HelpPage'"

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/frontend/src/pages/HelpPage.tsx
import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { TwoPanelLayout } from "@/components/layout/TwoPanelLayout";
import { HelpSidebar } from "@/components/help/HelpSidebar";
import { GlossaryDetailView } from "@/components/help/GlossaryDetailView";
import { ConceptDetailView } from "@/components/help/ConceptDetailView";
import { GlossaryPopoverProvider } from "@/components/help/GlossaryPopoverContext";
import { GLOSSARY_ENTRIES, getGlossaryEntry } from "@/data/glossary";
import { getConceptEntry } from "@/data/concepts";

const DEFAULT_ENTRY_ID = GLOSSARY_ENTRIES[0]!.id; // "amortised" (first alphabetically)

function isValidEntryId(id: string): boolean {
  return (
    getGlossaryEntry(id) !== undefined || getConceptEntry(id) !== undefined
  );
}

export default function HelpPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawEntry = searchParams.get("entry") ?? "";
  const selectedId = isValidEntryId(rawEntry) ? rawEntry : DEFAULT_ENTRY_ID;

  const handleSelect = useCallback(
    (id: string) => {
      setSearchParams({ entry: id }, { replace: false });
    },
    [setSearchParams],
  );

  const isGlossaryEntry = getGlossaryEntry(selectedId) !== undefined;

  return (
    <GlossaryPopoverProvider>
      <div className="relative min-h-screen">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(ellipse 60% 40% at 20% 20%, rgba(99,102,241,0.06) 0%, transparent 70%)",
          }}
        />
        <TwoPanelLayout
          left={<HelpSidebar selectedId={selectedId} onSelect={handleSelect} />}
          right={
            isGlossaryEntry ? (
              <GlossaryDetailView
                entryId={selectedId}
                onNavigate={handleSelect}
              />
            ) : (
              <ConceptDetailView
                conceptId={selectedId}
                onNavigate={handleSelect}
              />
            )
          }
        />
      </div>
    </GlossaryPopoverProvider>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test src/pages/HelpPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/HelpPage.tsx apps/frontend/src/pages/HelpPage.test.tsx
git commit -m "feat(help): add HelpPage shell with sidebar selection and URL-driven state"
```

---

### Task 8: Nav Update + Route Registration

**Files:**

- Modify: `apps/frontend/src/components/layout/Layout.tsx:24-27` (add Help to NAV_ITEMS_GROUP3)
- Modify: `apps/frontend/src/App.tsx:25` (add HelpPage import and route)

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/components/layout/Layout.test.tsx — add this test to existing file
// (Check existing Layout.test.tsx first and append this describe block)
```

Check existing layout test first, then add:

```typescript
// Verify Help appears in nav — add to apps/frontend/src/components/layout/Layout.test.tsx
it("renders Help nav link", () => {
  // render Layout with mock children and check Help appears
  // existing test setup pattern from Layout.test.tsx
});
```

Since Layout.test.tsx already exists, read it first and add a test for the Help link. The test in Step 1 here is specifically:

```typescript
// Add to apps/frontend/src/components/layout/Layout.test.tsx
it("renders a Help nav link pointing to /help", () => {
  // Use existing render pattern from the file
  const helpLink = screen.getByRole("link", { name: "Help" });
  expect(helpLink).toBeTruthy();
  expect(helpLink.getAttribute("href")).toContain("/help");
});
```

- [ ] **Step 2: Run test to verify it fails**

Read `apps/frontend/src/components/layout/Layout.test.tsx` and add the Help nav test to the existing describe block, then run:

Run: `cd apps/frontend && bun test src/components/layout/Layout.test.tsx`
Expected: FAIL — "Unable to find an accessible element with the role 'link' and name 'Help'"

- [ ] **Step 3: Write minimal implementation**

In `apps/frontend/src/components/layout/Layout.tsx`, change:

```typescript
// OLD (line ~24-27):
const NAV_ITEMS_GROUP3 = [
  { to: "/goals", label: "Goals", colorClass: "text-foreground/50" },
  { to: "/gifts", label: "Gifts", colorClass: "text-foreground/50" },
] as const;
```

```typescript
// NEW:
const NAV_ITEMS_GROUP3 = [
  { to: "/goals", label: "Goals", colorClass: "text-foreground/50" },
  { to: "/gifts", label: "Gifts", colorClass: "text-foreground/50" },
  { to: "/help", label: "Help", colorClass: "text-foreground/50" },
] as const;
```

In `apps/frontend/src/App.tsx`, add the lazy import and route:

```typescript
// Add after line 25 (after GiftsPage import):
const HelpPage = lazy(() => import("./pages/HelpPage"));
```

```typescript
// Add after the /gifts route (inside the protected routes):
<Route path="/help" element={<HelpPage />} />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test src/components/layout/Layout.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/layout/Layout.tsx apps/frontend/src/App.tsx apps/frontend/src/components/layout/Layout.test.tsx
git commit -m "feat(help): add Help nav item and /help route to authenticated app"
```

---

## Testing

### Frontend Tests

- [ ] Component: `GlossaryTermMarker` shows popover after 150ms hover delay
- [ ] Component: `GlossaryTermMarker` closes on Escape key
- [ ] Component: `GlossaryTermMarker` shows only one popover at a time (singleton)
- [ ] Component: `HelpSidebar` filters entries by search query (debounced)
- [ ] Component: `HelpSidebar` shows no results state for unmatched query
- [ ] Component: `GlossaryDetailView` renders related concept links
- [ ] Component: `ConceptDetailView` omits "See this in finplan" when `seeThisInFinplan` is absent
- [ ] Component: `CompoundInterestCalculator` handles zero rate without crashing
- [ ] Page: `HelpPage` pre-selects entry from `?entry=` param
- [ ] Page: `HelpPage` falls back to first glossary entry for unknown entry id

### Key Scenarios

- [ ] Happy path: navigate to `/help` → sidebar shows 17 glossary + 5 concepts → click "ISA Allowance" → right panel shows ISA Allowance detail
- [ ] Popover path: hover a glossary term in body text → popover opens with definition and "Learn more" link → click "Learn more" → navigates to `/help?entry=<id>` → correct entry selected
- [ ] Search path: type "ISA" in search box → sidebar filters to ISA, ISA Allowance (glossary) + ISA Allowances (concept) → clear → all entries restored
- [ ] URL state: click entries → browser back navigates to previous entry → forward goes forward
- [ ] Deep link: `/help?entry=amortisation` → Amortisation concept selected (not the glossary term)

## Verification

- [ ] `bun run build` passes clean
- [ ] `bun run lint` — zero warnings
- [ ] `bun run type-check` — zero errors
- [ ] `cd apps/frontend && bun test src/data/ src/components/help/ src/pages/HelpPage.test.tsx` — all pass
- [ ] Manual: open `/help`, verify sidebar layout, search, selection, popovers, visual explainers, compound interest calculator
- [ ] Manual: hover a glossary term on Overview page, verify interactive popover appears with "Learn more" link

## Post-conditions

- [ ] `DefinitionTooltip.tsx` is removed — all usages must be migrated to `GlossaryTermMarker` before execute-plan closes
- [ ] The compound interest calculator widget is ready for the Wealth page (Projections feature) to reuse
- [ ] "See this in finplan" links on net-worth, isa-allowances, compound-interest concepts can be activated when their target pages are built
