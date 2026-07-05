---
feature: context-breadcrumb-header
category: ui
spec: docs/superpowers/specs/2026-04-19-context-breadcrumb-header-design.md
creation_date: 2026-04-19
status: implemented
implemented_date: 2026-07-05
---

# Context Breadcrumb Header — Implementation Plan

> **For Claude:** Use `/execute-plan context-breadcrumb-header` to implement this plan task-by-task.

> **Purpose:** An ordered, task-by-task build guide. Each task follows TDD red-green-commit and contains complete, ready-to-run code — no "implement X" placeholders.

**Goal:** Replace the separate sub-label below `PageHeader` with an inline "CATEGORY / instance-name" breadcrumb that reads as static context rather than an interactive element.  
**Spec:** `docs/superpowers/specs/2026-04-19-context-breadcrumb-header-design.md`  
**Architecture:** Pure frontend. `PageHeader` gains an optional `contextName` prop rendered inline inside the `<h1>`. `SettingsLeftPanel` threads `contextName` through to `PageHeader` and drops its own sub-label rendering for this case. `HouseholdSettingsPage` switches from `subLabel` to `contextName`. No backend, no schema, no shared-package changes.  
**Tech Stack:** Fastify · Prisma · tRPC · Zod · React 18 · TanStack Query · Zustand · Tailwind

**Infrastructure Impact:**

- Touches `packages/shared/`: no
- Requires DB migration: no

---

## Pre-conditions

- [ ] `PageHeader` component exists at `apps/frontend/src/components/common/PageHeader.tsx`
- [ ] `SettingsLeftPanel` component exists at `apps/frontend/src/components/settings/SettingsLeftPanel.tsx`
- [ ] `HouseholdSettingsPage` exists at `apps/frontend/src/pages/HouseholdSettingsPage.tsx`

---

## Tasks

### Task 1: Add `contextName` prop to `PageHeader`

**Files:**

- Modify: `apps/frontend/src/components/common/PageHeader.tsx`
- Modify: `apps/frontend/src/components/common/PageHeader.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add these two cases to `apps/frontend/src/components/common/PageHeader.test.tsx`:

```typescript
  it("renders context name and separator inside heading when contextName is provided", () => {
    renderWithProviders(<PageHeader title="Household" contextName="Snaith" />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toContain("Household");
    expect(heading.textContent).toContain("/");
    expect(heading.textContent).toContain("Snaith");
  });

  it("does not render separator when contextName is omitted", () => {
    renderWithProviders(<PageHeader title="Household" />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).not.toContain("/");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun scripts/run-tests.ts PageHeader`  
Expected: FAIL — "expected string to contain '/'"

- [ ] **Step 3: Implement `contextName` in `PageHeader`**

Replace `apps/frontend/src/components/common/PageHeader.tsx` with:

```typescript
import { toGBP } from "@finplan/shared";
import { AnimatedCurrency } from "@/components/common/AnimatedCurrency";

interface PageHeaderProps {
  title: string;
  colorClass?: string;
  total?: number | null;
  totalColorClass?: string;
  contextName?: string;
}

export function PageHeader({
  title,
  colorClass = "text-page-accent",
  total,
  totalColorClass,
  contextName,
}: PageHeaderProps) {
  return (
    <div className="shrink-0 px-4 pt-4 pb-3">
      <div className="flex items-center justify-between">
        <h1 className={`font-heading text-lg font-bold uppercase tracking-tier ${colorClass}`}>
          {title}
          {contextName && (
            <>
              <span className="font-normal text-foreground/25 mx-1.5">/</span>
              <span className="font-body text-xs font-normal normal-case tracking-normal text-foreground/45">
                {contextName}
              </span>
            </>
          )}
        </h1>
        {total != null && (
          <span className={`font-numeric text-lg font-semibold ${totalColorClass ?? colorClass}`}>
            <AnimatedCurrency value={toGBP(total)} />
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun scripts/run-tests.ts PageHeader`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/common/PageHeader.tsx apps/frontend/src/components/common/PageHeader.test.tsx
git commit -m "feat(ui): add contextName prop to PageHeader for inline breadcrumb"
```

---

### Task 2: Update `SettingsLeftPanel` and `HouseholdSettingsPage`

**Files:**

- Modify: `apps/frontend/src/components/settings/SettingsLeftPanel.tsx`
- Modify: `apps/frontend/src/pages/HouseholdSettingsPage.tsx`
- Modify: `apps/frontend/src/pages/HouseholdSettingsPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Add this case to `apps/frontend/src/pages/HouseholdSettingsPage.test.tsx` (inside the existing `describe` block, after the existing three tests):

```typescript
  it("shows household name inline in the page header heading", () => {
    mockRole("owner");
    renderWithProviders(<HouseholdSettingsPage />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toContain("Snaith");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun scripts/run-tests.ts HouseholdSettingsPage`  
Expected: FAIL — heading textContent does not contain "Snaith" (it's currently in a `<p>` below the heading)

- [ ] **Step 3: Update `SettingsLeftPanel` to accept `contextName`**

Replace `apps/frontend/src/components/settings/SettingsLeftPanel.tsx` with:

```typescript
import { PageHeader } from "@/components/common/PageHeader";
import { cn } from "@/lib/utils";

export interface SettingsNavItem {
  id: string;
  label: string;
  group?: string;
}

interface SettingsLeftPanelProps {
  title: string;
  subLabel?: string;
  contextName?: string;
  activeId: string;
  items: SettingsNavItem[];
  onNavClick: (id: string) => void;
}

export function SettingsLeftPanel({
  title,
  subLabel,
  contextName,
  activeId,
  items,
  onNavClick,
}: SettingsLeftPanelProps) {
  const version = import.meta.env.VITE_APP_VERSION ?? "dev";
  const hasGroups = items.some((i) => i.group);

  const groups = hasGroups
    ? items.reduce<{ key: string; items: SettingsNavItem[] }[]>((acc, item) => {
        const key = item.group ?? "";
        const last = acc[acc.length - 1];
        if (last && last.key === key) last.items.push(item);
        else acc.push({ key, items: [item] });
        return acc;
      }, [])
    : [{ key: "", items }];

  return (
    <aside className="flex flex-col h-full w-[360px] shrink-0 border-r">
      <div className="shrink-0">
        <PageHeader title={title} contextName={contextName} />
        {subLabel && (
          <p className="px-4 -mt-2 pb-3 text-xs font-medium text-foreground/40">{subLabel}</p>
        )}
      </div>
      <nav aria-label="Settings sections" className="flex-1 min-h-0 overflow-y-auto">
        {groups.map((g) => (
          <div key={g.key || "flat"}>
            {g.key && (
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground px-4 pt-3 pb-1">
                {g.key}
              </p>
            )}
            {g.items.map((item) => {
              const isActive = item.id === activeId;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={isActive ? "true" : undefined}
                  onClick={() => onNavClick(item.id)}
                  className={cn(
                    "relative flex w-full items-center px-4 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-page-accent",
                    isActive
                      ? "font-medium text-page-accent bg-page-accent/14 border-l-2 border-page-accent rounded-r-sm"
                      : "text-foreground/60 hover:bg-page-accent/5 hover:text-foreground/90"
                  )}
                >
                  <span className="relative z-10">{item.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="shrink-0 border-t border-foreground/10 px-4 py-3 flex justify-between text-sm">
        <span className="text-foreground/40">finplan</span>
        <span className="font-numeric text-xs text-foreground/30">v{version}</span>
      </div>
    </aside>
  );
}
```

Then update `apps/frontend/src/pages/HouseholdSettingsPage.tsx` — replace the `SettingsLeftPanel` props block (lines 70–76):

```typescript
      <SettingsLeftPanel
        title="Household"
        contextName={householdName}
        activeId={activeId}
        items={items}
        onNavClick={handleNavClick}
      />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun scripts/run-tests.ts HouseholdSettingsPage`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/settings/SettingsLeftPanel.tsx apps/frontend/src/pages/HouseholdSettingsPage.tsx apps/frontend/src/pages/HouseholdSettingsPage.test.tsx
git commit -m "feat(ui): replace household subLabel with inline context breadcrumb header"
```

---

### Task 3: Update `design-system.md`

**Files:**

- Modify: `docs/2. design/design-system.md`

No test needed — documentation change only.

- [ ] **Step 1: Add "Context Breadcrumb Header" subsection under § 3.1 Left Panel Header Anatomy**

After the existing `Left Panel Header Anatomy` block (after the bullet about `colorClass` defaults and `px-4` alignment), add:

```markdown
#### Context Breadcrumb Header

When a left panel represents a named instance (e.g. settings for a specific household), the active instance name may be shown inline in the `PageHeader` using the `contextName` prop:
```

HOUSEHOLD / Snaith

```

- Pass `contextName={instanceName}` to `PageHeader` — never add a separate `<p>` element for this purpose
- The separator `/` renders at `text-foreground/25`
- The instance name renders at `font-body text-xs font-normal normal-case text-foreground/45`
- No hover state, no cursor change — this is static context, not a nav target
- Do not use this pattern for navigational breadcrumbs; those use the `← Category / Item` pattern in right-panel headers
```

- [ ] **Step 2: Update § 8.2 Household Settings entry**

Replace the current Household Settings sub-label description in § 8.2:

```markdown
- **Household Settings** — title "Household"; active household name displayed inline via the `contextName` prop on `PageHeader` (see Context Breadcrumb Header in § 3.1) — reads as static context, not a nav target. **Grouped nav**: …
```

- [ ] **Step 3: Commit**

```bash
git add "docs/2. design/design-system.md"
git commit -m "docs(design-system): add context breadcrumb header pattern to §3.1 and §8.2"
```

---

## Testing

### Frontend Tests

- [ ] `PageHeader` renders "HOUSEHOLD / Snaith" inside `<h1>` when `contextName` is passed
- [ ] `PageHeader` renders no `/` when `contextName` is omitted
- [ ] `HouseholdSettingsPage` shows household name inside the `<h1>` heading
- [ ] `ProfileSettingsPage` unaffected — still renders `subLabel` below header (existing behaviour)

### Key Scenarios

- [ ] Happy path: open `/settings/household` — header reads "HOUSEHOLD / Snaith"
- [ ] Hover over "Snaith" — no highlight, no cursor change
- [ ] Click "Snaith" — nothing happens
- [ ] Open `/settings/profile` — "Profile" header unaffected, sub-label "Your personal preferences" still present

---

## Verification

- [ ] `bun run lint` — zero warnings
- [ ] `bun run type-check` — no errors
- [ ] `cd apps/frontend && bun scripts/run-tests.ts PageHeader` passes
- [ ] `cd apps/frontend && bun scripts/run-tests.ts HouseholdSettingsPage` passes
- [ ] Manual: `/settings/household` header shows "HOUSEHOLD / Snaith" inline; name is not underlined, no hover highlight, cursor stays default

---

## Post-conditions

- [ ] `PageHeader.contextName` is available for any future page that needs static instance context in its header
- [ ] `SettingsLeftPanel.subLabelClassName` has been removed — callers no longer need to style the sub-label directly
