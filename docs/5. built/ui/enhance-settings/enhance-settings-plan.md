---
feature: enhance-settings
category: ui
spec: docs/4. planning/enhance-settings/enhance-settings-spec.md
creation_date: 2026-04-18
status: backlog
implemented_date:
---

# Enhance Settings — Implementation Plan

> **For Claude:** Use `/execute-plan <feature-name>` to implement this plan task-by-task.

**Goal:** Split Settings into Profile + Household pages with canonical two-panel layout, auto-save, and a restructured household switcher.
**Spec:** `docs/4. planning/enhance-settings/enhance-settings-spec.md`
**Architecture:** Frontend-only refactor. No schema / API / shared changes. Introduces four reusable primitives (`useAutoSave`, `AutoSaveField`, `SettingsSection`, `SettingsLeftPanel`, `SettingsRightPanel`) and two top-nav primitives (`ProfileAvatar`, `ProfileAvatarDropdown`). Existing section components are refactored to wrap fields in `AutoSaveField`; the old `SettingsPage` is replaced by two scope-specific pages. `HouseholdSwitcher` is restructured into a two-group, viewport-safe dropdown.
**Tech Stack:** Fastify · Prisma · tRPC · Zod · React 18 · TanStack Query · Zustand · Tailwind
**Infrastructure Impact:**

- Touches `packages/shared/`: no
- Requires DB migration: no

## Pre-conditions

- [ ] Spec and design docs are approved (`enhance-settings-spec.md`, `enhance-settings-design.md`).
- [ ] `docs/2. design/design-system.md` §§ 7 and 8 updates are in place (done during `/write-design`).
- [ ] Existing backend Settings endpoints unchanged — no migration or API work needed.

## Tasks

> All paths are relative to `C:/Users/Gabriel/Documents/Dev/fin_plan`. Frontend tests run via `cd apps/frontend && bun scripts/run-tests.ts <pattern>`. Commits follow Conventional Commits.

---

### Task 1: `useAutoSave` hook — debounce + mutation coordination

**Files:**

- Create: `apps/frontend/src/hooks/useAutoSave.ts`
- Test: `apps/frontend/src/hooks/useAutoSave.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/hooks/useAutoSave.test.ts
import { describe, it, expect, mock } from "bun:test";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAutoSave } from "./useAutoSave";

function createSaveMock(result: "success" | "error" = "success") {
  return mock(async (value: string) => {
    if (result === "error") throw new Error("fail");
    return value;
  });
}

describe("useAutoSave", () => {
  it("debounces text saves by 600ms", async () => {
    const save = createSaveMock();
    const { result } = renderHook(() =>
      useAutoSave({ initialValue: "a", onSave: save, debounceMs: 600 })
    );

    act(() => result.current.setValue("b"));
    act(() => result.current.setValue("c"));
    expect(save).toHaveBeenCalledTimes(0);

    await new Promise((r) => setTimeout(r, 700));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toBe("c");
  });

  it("saves immediately when debounceMs is 0", async () => {
    const save = createSaveMock();
    const { result } = renderHook(() =>
      useAutoSave({ initialValue: false, onSave: save, debounceMs: 0 })
    );

    act(() => result.current.setValue(true));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0]).toBe(true);
  });

  it("does not save when value equals the last-saved value", async () => {
    const save = createSaveMock();
    const { result } = renderHook(() =>
      useAutoSave({ initialValue: "a", onSave: save, debounceMs: 0 })
    );
    act(() => result.current.setValue("a"));
    await new Promise((r) => setTimeout(r, 50));
    expect(save).toHaveBeenCalledTimes(0);
  });

  it("transitions status to saved on success", async () => {
    const save = createSaveMock("success");
    const { result } = renderHook(() =>
      useAutoSave({ initialValue: "a", onSave: save, debounceMs: 0 })
    );
    act(() => result.current.setValue("b"));
    await waitFor(() => expect(result.current.status).toBe("saved"));
  });

  it("reverts value and exposes error on failure", async () => {
    const save = createSaveMock("error");
    const { result } = renderHook(() =>
      useAutoSave({ initialValue: "a", onSave: save, debounceMs: 0 })
    );
    act(() => result.current.setValue("b"));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.value).toBe("a");
    expect(result.current.errorMessage).toBe("Couldn't save — try again");
  });

  it("clears error status when user edits again", async () => {
    const save = createSaveMock("error");
    const { result } = renderHook(() =>
      useAutoSave({ initialValue: "a", onSave: save, debounceMs: 0 })
    );
    act(() => result.current.setValue("b"));
    await waitFor(() => expect(result.current.status).toBe("error"));
    act(() => result.current.setValue("c"));
    expect(result.current.status).toBe("idle");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun scripts/run-tests.ts useAutoSave`
Expected: FAIL — `Cannot find module './useAutoSave'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/frontend/src/hooks/useAutoSave.ts
import { useCallback, useEffect, useRef, useState } from "react";

export type AutoSaveStatus = "idle" | "saving" | "saved" | "error";

export interface UseAutoSaveOptions<T> {
  initialValue: T;
  onSave: (value: T) => Promise<unknown>;
  debounceMs?: number;
  errorMessage?: string;
}

export interface UseAutoSaveResult<T> {
  value: T;
  setValue: (next: T) => void;
  status: AutoSaveStatus;
  errorMessage: string | null;
}

const DEFAULT_ERROR = "Couldn't save — try again";

export function useAutoSave<T>({
  initialValue,
  onSave,
  debounceMs = 600,
  errorMessage = DEFAULT_ERROR,
}: UseAutoSaveOptions<T>): UseAutoSaveResult<T> {
  const [value, setLocal] = useState<T>(initialValue);
  const [status, setStatus] = useState<AutoSaveStatus>("idle");
  const lastSavedRef = useRef<T>(initialValue);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync from external changes (e.g. server refresh)
  useEffect(() => {
    lastSavedRef.current = initialValue;
    setLocal(initialValue);
  }, [initialValue]);

  const commit = useCallback(
    async (next: T) => {
      setStatus("saving");
      try {
        await onSave(next);
        lastSavedRef.current = next;
        setStatus("saved");
      } catch {
        setLocal(lastSavedRef.current);
        setStatus("error");
      }
    },
    [onSave]
  );

  const setValue = useCallback(
    (next: T) => {
      setLocal(next);
      setStatus("idle");
      if (timerRef.current) clearTimeout(timerRef.current);
      if (Object.is(next, lastSavedRef.current)) return;

      if (debounceMs === 0) {
        void commit(next);
      } else {
        timerRef.current = setTimeout(() => void commit(next), debounceMs);
      }
    },
    [commit, debounceMs]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return {
    value,
    setValue,
    status,
    errorMessage: status === "error" ? errorMessage : null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun scripts/run-tests.ts useAutoSave`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/hooks/useAutoSave.ts apps/frontend/src/hooks/useAutoSave.test.ts
git commit -m "feat(settings): add useAutoSave hook with debounce and revert-on-failure"
```

---

### Task 2: `AutoSaveField` — UI wrapper rendering pulse + inline feedback

**Files:**

- Create: `apps/frontend/src/components/settings/AutoSaveField.tsx`
- Test: `apps/frontend/src/components/settings/AutoSaveField.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/frontend/src/components/settings/AutoSaveField.test.tsx
import { describe, it, expect } from "bun:test";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";
import { AutoSaveField } from "./AutoSaveField";

describe("AutoSaveField", () => {
  it("renders label and children", () => {
    renderWithProviders(
      <AutoSaveField label="Name" status="idle" errorMessage={null}>
        <input aria-label="name-input" />
      </AutoSaveField>
    );
    expect(screen.getByText("Name")).toBeTruthy();
    expect(screen.getByLabelText("name-input")).toBeTruthy();
  });

  it("shows saved flash when status is saved", () => {
    renderWithProviders(
      <AutoSaveField label="Name" status="saved" errorMessage={null}>
        <input />
      </AutoSaveField>
    );
    expect(screen.getByText(/saved/i)).toBeTruthy();
  });

  it("shows inline error text when status is error", () => {
    renderWithProviders(
      <AutoSaveField label="Name" status="error" errorMessage="Couldn't save — try again">
        <input />
      </AutoSaveField>
    );
    const err = screen.getByRole("alert");
    expect(err.textContent).toBe("Couldn't save — try again");
  });

  it("applies data-status attribute for pulse styling", () => {
    const { container } = renderWithProviders(
      <AutoSaveField label="Name" status="saved" errorMessage={null}>
        <input />
      </AutoSaveField>
    );
    const wrap = container.querySelector('[data-status="saved"]');
    expect(wrap).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun scripts/run-tests.ts AutoSaveField`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/frontend/src/components/settings/AutoSaveField.tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { AutoSaveStatus } from "@/hooks/useAutoSave";

interface AutoSaveFieldProps {
  label?: string;
  htmlFor?: string;
  status: AutoSaveStatus;
  errorMessage: string | null;
  children: ReactNode;
  className?: string;
  inline?: boolean; // true = no label rendering (checkbox rows, inline toggles)
}

export function AutoSaveField({
  label,
  htmlFor,
  status,
  errorMessage,
  children,
  className,
  inline = false,
}: AutoSaveFieldProps) {
  return (
    <div
      data-status={status}
      className={cn("flex flex-col gap-1.5 max-w-sm", className, "autosave-field")}
    >
      {!inline && label && (
        <div className="flex items-center gap-2 min-h-4">
          <label htmlFor={htmlFor} className="text-xs font-medium text-foreground/75">
            {label}
          </label>
          {status === "saved" && (
            <span
              aria-live="polite"
              className="autosave-saved-flash text-[10.5px] font-medium text-success"
            >
              ✓ saved
            </span>
          )}
        </div>
      )}
      {children}
      {status === "error" && errorMessage && (
        <p role="alert" className="text-[11px] font-medium text-destructive">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
```

Also add the keyframes to `apps/frontend/src/index.css` (append to existing file):

```css
/* Auto-save micro-reaction (settings) */
@keyframes autosave-border-pulse {
  0% {
    box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.18);
    border-color: hsl(var(--success));
  }
  60% {
    box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.1);
    border-color: hsl(var(--success));
  }
  100% {
    box-shadow: 0 0 0 0 rgba(34, 197, 94, 0);
  }
}
@keyframes autosave-flash-fade {
  0% {
    opacity: 0;
    transform: translateY(2px);
  }
  15% {
    opacity: 1;
    transform: translateY(0);
  }
  75% {
    opacity: 1;
    transform: translateY(0);
  }
  100% {
    opacity: 0;
    transform: translateY(-2px);
  }
}
.autosave-field[data-status="saved"] input,
.autosave-field[data-status="saved"] textarea {
  animation: autosave-border-pulse 1.5s ease-out forwards;
}
.autosave-saved-flash {
  animation: autosave-flash-fade 1.6s ease-out forwards;
}
@media (prefers-reduced-motion: reduce) {
  .autosave-field[data-status="saved"] input,
  .autosave-field[data-status="saved"] textarea {
    animation: none;
    border-color: hsl(var(--success));
    transition: border-color 100ms;
  }
  .autosave-saved-flash {
    animation: none;
    opacity: 1;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun scripts/run-tests.ts AutoSaveField`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/settings/AutoSaveField.tsx apps/frontend/src/components/settings/AutoSaveField.test.tsx apps/frontend/src/index.css
git commit -m "feat(settings): add AutoSaveField UI wrapper with pulse and error feedback"
```

---

### Task 3: `SettingsSection` — replace `Section.tsx` with § 8 treatment

**Files:**

- Create: `apps/frontend/src/components/settings/SettingsSection.tsx`
- Test: `apps/frontend/src/components/settings/SettingsSection.test.tsx`
- Delete: `apps/frontend/src/components/settings/Section.tsx` (after all consumers migrate — Task 17)

- [ ] **Step 1: Write the failing test**

```tsx
// apps/frontend/src/components/settings/SettingsSection.test.tsx
import { describe, it, expect } from "bun:test";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";
import { SettingsSection } from "./SettingsSection";

describe("SettingsSection", () => {
  it("renders title with correct treatment", () => {
    renderWithProviders(
      <SettingsSection id="surplus" title="Surplus benchmark">
        <p>body</p>
      </SettingsSection>
    );
    const h = screen.getByRole("heading", { level: 3 });
    expect(h.textContent).toBe("Surplus benchmark");
    expect(h.className).toContain("uppercase");
    expect(h.className).toContain("font-heading");
    expect(h.className).toContain("text-page-accent");
  });

  it("sets data-section-id for scroll-spy", () => {
    const { container } = renderWithProviders(
      <SettingsSection id="display" title="Display">
        <p>x</p>
      </SettingsSection>
    );
    const sec = container.querySelector('[data-section-id="display"]');
    expect(sec).toBeTruthy();
  });

  it("renders optional description", () => {
    renderWithProviders(
      <SettingsSection id="profile" title="Profile" description="Your account details.">
        <p>x</p>
      </SettingsSection>
    );
    expect(screen.getByText("Your account details.")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun scripts/run-tests.ts SettingsSection`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/frontend/src/components/settings/SettingsSection.tsx
import { forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SettingsSectionProps {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export const SettingsSection = forwardRef<HTMLElement, SettingsSectionProps>(
  ({ id, title, description, children, className }, ref) => {
    return (
      <section
        ref={ref}
        id={id}
        data-section-id={id}
        tabIndex={-1}
        className={cn("scroll-mt-4 focus:outline-none", className)}
      >
        <h3
          className="font-heading text-sm font-bold uppercase text-page-accent mb-1"
          style={{ letterSpacing: "0.06em" }}
        >
          {title}
        </h3>
        {description && (
          <p className="text-sm text-foreground/45 leading-relaxed mb-4 max-w-xl">{description}</p>
        )}
        <div className="space-y-4">{children}</div>
      </section>
    );
  }
);
SettingsSection.displayName = "SettingsSection";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun scripts/run-tests.ts SettingsSection`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/settings/SettingsSection.tsx apps/frontend/src/components/settings/SettingsSection.test.tsx
git commit -m "feat(settings): add SettingsSection with page-accent uppercase heading"
```

---

### Task 4: `SettingsLeftPanel` — canonical left panel with flat or grouped nav

**Files:**

- Create: `apps/frontend/src/components/settings/SettingsLeftPanel.tsx`
- Test: `apps/frontend/src/components/settings/SettingsLeftPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/frontend/src/components/settings/SettingsLeftPanel.test.tsx
import { describe, it, expect, mock } from "bun:test";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";
import { SettingsLeftPanel } from "./SettingsLeftPanel";

describe("SettingsLeftPanel", () => {
  it("renders PageHeader title and sub-label", () => {
    renderWithProviders(
      <SettingsLeftPanel
        title="Profile"
        subLabel="Your personal preferences"
        activeId="account"
        items={[
          { id: "account", label: "Account" },
          { id: "display", label: "Display" },
        ]}
        onNavClick={() => {}}
      />
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Profile");
    expect(screen.getByText("Your personal preferences")).toBeTruthy();
  });

  it("renders flat items when no group keys are present", () => {
    renderWithProviders(
      <SettingsLeftPanel
        title="Profile"
        activeId="account"
        items={[
          { id: "account", label: "Account" },
          { id: "display", label: "Display" },
        ]}
        onNavClick={() => {}}
      />
    );
    expect(screen.getByRole("button", { name: "Account" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Display" })).toBeTruthy();
  });

  it("renders group headers when items carry a group key", () => {
    renderWithProviders(
      <SettingsLeftPanel
        title="Household"
        activeId="details"
        items={[
          { id: "details", label: "Details", group: "General" },
          { id: "members", label: "Members & invites", group: "General" },
          { id: "surplus", label: "Surplus benchmark", group: "Financial" },
        ]}
        onNavClick={() => {}}
      />
    );
    expect(screen.getByText("General")).toBeTruthy();
    expect(screen.getByText("Financial")).toBeTruthy();
  });

  it("applies indicator-pattern classes to the active item and aria-current", () => {
    renderWithProviders(
      <SettingsLeftPanel
        title="Profile"
        activeId="display"
        items={[
          { id: "account", label: "Account" },
          { id: "display", label: "Display" },
        ]}
        onNavClick={() => {}}
      />
    );
    const active = screen.getByRole("button", { name: "Display" });
    expect(active.getAttribute("aria-current")).toBe("true");
    expect(active.className).toContain("text-page-accent");
    expect(active.className).toContain("border-l-2");
    expect(active.className).toContain("border-page-accent");
  });

  it("calls onNavClick with the clicked id", () => {
    const onNavClick = mock(() => {});
    renderWithProviders(
      <SettingsLeftPanel
        title="Profile"
        activeId="account"
        items={[
          { id: "account", label: "Account" },
          { id: "display", label: "Display" },
        ]}
        onNavClick={onNavClick}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Display" }));
    expect(onNavClick).toHaveBeenCalledWith("display");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun scripts/run-tests.ts SettingsLeftPanel`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/frontend/src/components/settings/SettingsLeftPanel.tsx
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
  subLabelClassName?: string;
  activeId: string;
  items: SettingsNavItem[];
  onNavClick: (id: string) => void;
}

export function SettingsLeftPanel({
  title,
  subLabel,
  subLabelClassName = "text-foreground/40",
  activeId,
  items,
  onNavClick,
}: SettingsLeftPanelProps) {
  const version = import.meta.env.VITE_APP_VERSION ?? "dev";
  const hasGroups = items.some((i) => i.group);

  // Preserve declared order while grouping
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
        <PageHeader title={title} />
        {subLabel && (
          <p className={cn("px-4 -mt-2 pb-3 text-xs font-medium", subLabelClassName)}>{subLabel}</p>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
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
                    "relative flex w-full items-center px-4 py-2.5 text-left text-sm transition-colors",
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
      </div>
      <div className="shrink-0 border-t border-foreground/10 px-4 py-3 flex justify-between text-sm">
        <span className="text-foreground/40">finplan</span>
        <span className="font-numeric text-xs text-foreground/30">v{version}</span>
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun scripts/run-tests.ts SettingsLeftPanel`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/settings/SettingsLeftPanel.tsx apps/frontend/src/components/settings/SettingsLeftPanel.test.tsx
git commit -m "feat(settings): add SettingsLeftPanel with canonical PageHeader and indicator nav"
```

---

### Task 5: `SettingsRightPanel` — sticky header + scroll-spy

**Files:**

- Create: `apps/frontend/src/components/settings/SettingsRightPanel.tsx`
- Test: `apps/frontend/src/components/settings/SettingsRightPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/frontend/src/components/settings/SettingsRightPanel.test.tsx
import { describe, it, expect, mock } from "bun:test";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";
import { SettingsRightPanel } from "./SettingsRightPanel";
import { SettingsSection } from "./SettingsSection";

describe("SettingsRightPanel", () => {
  it("renders sticky header with title", () => {
    renderWithProviders(
      <SettingsRightPanel title="Profile" activeId="account" onActiveChange={() => {}}>
        <SettingsSection id="account" title="Account">
          content
        </SettingsSection>
      </SettingsRightPanel>
    );
    const header = screen.getByRole("heading", { level: 2 });
    expect(header.textContent).toBe("Profile");
    expect(header.parentElement?.className).toContain("sticky");
  });

  it("renders children inside the scrolling body", () => {
    renderWithProviders(
      <SettingsRightPanel title="Profile" activeId="account" onActiveChange={() => {}}>
        <SettingsSection id="account" title="Account">
          content A
        </SettingsSection>
        <SettingsSection id="display" title="Display">
          content B
        </SettingsSection>
      </SettingsRightPanel>
    );
    expect(screen.getByText("content A")).toBeTruthy();
    expect(screen.getByText("content B")).toBeTruthy();
  });

  it("exposes a scrollToSection method via ref", () => {
    const ref = { current: null as any };
    const onActiveChange = mock(() => {});
    renderWithProviders(
      <SettingsRightPanel
        ref={ref}
        title="Profile"
        activeId="account"
        onActiveChange={onActiveChange}
      >
        <SettingsSection id="account" title="Account">
          A
        </SettingsSection>
        <SettingsSection id="display" title="Display">
          B
        </SettingsSection>
      </SettingsRightPanel>
    );
    expect(typeof ref.current?.scrollToSection).toBe("function");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun scripts/run-tests.ts SettingsRightPanel`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/frontend/src/components/settings/SettingsRightPanel.tsx
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

export interface SettingsRightPanelHandle {
  scrollToSection: (id: string) => void;
}

interface SettingsRightPanelProps {
  title: string;
  activeId: string;
  onActiveChange: (id: string) => void;
  children: ReactNode;
}

const SCROLL_LOCK_MS = 400;

export const SettingsRightPanel = forwardRef<SettingsRightPanelHandle, SettingsRightPanelProps>(
  ({ title, activeId, onActiveChange, children }, ref) => {
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const scrollLockUntilRef = useRef<number>(0);

    const scrollToSection = useCallback((id: string) => {
      const container = scrollRef.current;
      if (!container) return;
      const target = container.querySelector<HTMLElement>(`[data-section-id="${id}"]`);
      if (!target) return;
      scrollLockUntilRef.current = Date.now() + SCROLL_LOCK_MS;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      // Focus the section heading for keyboard users
      window.setTimeout(() => target.focus({ preventScroll: true }), SCROLL_LOCK_MS);
    }, []);

    useImperativeHandle(ref, () => ({ scrollToSection }), [scrollToSection]);

    useEffect(() => {
      const container = scrollRef.current;
      if (!container) return;
      const observer = new IntersectionObserver(
        (entries) => {
          if (Date.now() < scrollLockUntilRef.current) return;
          const topmost = entries
            .filter((e) => e.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
          if (topmost) {
            const id = topmost.target.getAttribute("data-section-id");
            if (id && id !== activeId) onActiveChange(id);
          }
        },
        { root: container, threshold: 0.3 }
      );
      container.querySelectorAll("[data-section-id]").forEach((el) => observer.observe(el));
      return () => observer.disconnect();
      // re-run when children structure changes (sections added/removed)
    }, [activeId, onActiveChange, children]);

    return (
      <main className="flex-1 flex flex-col min-w-0 min-h-0">
        <div
          className={cn(
            "sticky top-0 z-[2] bg-background",
            "flex items-center justify-between px-4 py-3 border-b border-foreground/5"
          )}
        >
          <h2 className="font-heading text-base font-bold text-foreground">{title}</h2>
        </div>
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
          <div className="settings-right-body px-6 pt-6 pb-32 max-w-3xl space-y-12">{children}</div>
        </div>
      </main>
    );
  }
);
SettingsRightPanel.displayName = "SettingsRightPanel";
```

Also add divider styling between successive sections in `apps/frontend/src/index.css`:

```css
/* Settings right panel — horizontal divider between adjacent sections */
.settings-right-body > section + section {
  border-top: 1px solid rgba(238, 242, 255, 0.06);
  padding-top: 48px;
}
```

(then update the body `<div>` to include `settings-right-body` on its className in `SettingsRightPanel.tsx`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun scripts/run-tests.ts SettingsRightPanel`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/settings/SettingsRightPanel.tsx apps/frontend/src/components/settings/SettingsRightPanel.test.tsx apps/frontend/src/index.css
git commit -m "feat(settings): add SettingsRightPanel with sticky header and scroll-spy coordinator"
```

---

### Task 6: `ProfileAvatarDropdown` — overlay panel

**Files:**

- Create: `apps/frontend/src/components/layout/ProfileAvatarDropdown.tsx`

- [ ] **Step 1: No new test file** — covered by `ProfileAvatar.test.tsx` in Task 7.

- [ ] **Step 2: N/A**

- [ ] **Step 3: Write the dropdown**

```tsx
// apps/frontend/src/components/layout/ProfileAvatarDropdown.tsx
import { useNavigate } from "react-router-dom";
import { LogOut, User } from "lucide-react";

interface ProfileAvatarDropdownProps {
  userName: string;
  userEmail: string;
  onSignOut: () => void;
  onClose: () => void;
}

export function ProfileAvatarDropdown({
  userName,
  userEmail,
  onSignOut,
  onClose,
}: ProfileAvatarDropdownProps) {
  const navigate = useNavigate();
  return (
    <div
      role="menu"
      className="absolute right-0 top-[calc(100%+6px)] min-w-[220px] max-w-[300px] bg-popover border rounded-md p-1.5 z-30 shadow-lg"
      style={{ maxHeight: "min(420px, calc(100vh - 70px))", overflowY: "auto" }}
    >
      <div className="px-2.5 pt-1 pb-1">
        <div className="text-sm font-semibold text-foreground truncate">{userName}</div>
        <div className="text-xs text-foreground/40 truncate">{userEmail}</div>
      </div>
      <div className="h-px bg-foreground/10 my-1.5" />
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onClose();
          navigate("/settings/profile");
        }}
        className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded text-sm text-foreground/85 hover:bg-accent/12 hover:text-foreground transition-colors"
      >
        <User className="h-3.5 w-3.5 text-foreground/40" />
        Profile settings
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onClose();
          onSignOut();
        }}
        className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded text-sm text-foreground/85 hover:bg-accent/12 hover:text-foreground transition-colors"
      >
        <LogOut className="h-3.5 w-3.5 text-foreground/40" />
        Sign out
      </button>
    </div>
  );
}
```

- [ ] **Step 4: N/A** (covered by Task 7 tests)

- [ ] **Step 5: Commit (defer)** — commit together with Task 7.

---

### Task 7: `ProfileAvatar` — nav-bar trigger with dropdown

**Files:**

- Create: `apps/frontend/src/components/layout/ProfileAvatar.tsx`
- Test: `apps/frontend/src/components/layout/ProfileAvatar.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/frontend/src/components/layout/ProfileAvatar.test.tsx
import { describe, it, expect, mock } from "bun:test";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";
import { ProfileAvatar } from "./ProfileAvatar";

const mockAuth = {
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      user: { name: "Jane Smith", email: "jane@example.com", id: "u1", activeHouseholdId: "h1" },
      logout: async () => {},
    }),
};

mock.module("@/stores/authStore", () => mockAuth);

describe("ProfileAvatar", () => {
  it("renders initials from user name", () => {
    renderWithProviders(<ProfileAvatar />);
    const trigger = screen.getByRole("button", { name: /profile menu/i });
    expect(trigger.textContent).toBe("JS");
  });

  it("opens dropdown on click", () => {
    renderWithProviders(<ProfileAvatar />);
    fireEvent.click(screen.getByRole("button", { name: /profile menu/i }));
    expect(screen.getByText("Jane Smith")).toBeTruthy();
    expect(screen.getByText("jane@example.com")).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /profile settings/i })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /sign out/i })).toBeTruthy();
  });

  it("closes on Escape", () => {
    renderWithProviders(<ProfileAvatar />);
    fireEvent.click(screen.getByRole("button", { name: /profile menu/i }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Jane Smith")).toBeNull();
  });

  it("dropdown is anchored right-0", () => {
    renderWithProviders(<ProfileAvatar />);
    fireEvent.click(screen.getByRole("button", { name: /profile menu/i }));
    const menu = screen.getByRole("menu");
    expect(menu.className).toContain("right-0");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun scripts/run-tests.ts ProfileAvatar`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/frontend/src/components/layout/ProfileAvatar.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { ProfileAvatarDropdown } from "./ProfileAvatarDropdown";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return "?";
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? first;
  const firstChar = first[0] ?? "";
  const lastChar = last[0] ?? "";
  return (firstChar + lastChar).toUpperCase() || "?";
}

function hashHue(name: string): number {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 360;
}

export function ProfileAvatar() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open, close]);

  const handleSignOut = useCallback(async () => {
    await logout();
    navigate("/login");
  }, [logout, navigate]);

  if (!user) return null;
  const initials = getInitials(user.name ?? user.email ?? "?");
  const hue = hashHue(user.name ?? user.email ?? "x");

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-label="Profile menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="h-8 w-8 rounded-full flex items-center justify-center font-heading font-bold text-xs text-white border-2 border-transparent hover:border-action/40 active:scale-[0.97] transition-[transform,border-color] duration-150"
        style={{
          background: `linear-gradient(135deg, hsl(${hue}, 60%, 55%) 0%, hsl(${(hue + 60) % 360}, 70%, 60%) 100%)`,
        }}
      >
        {initials}
      </button>
      {open && (
        <ProfileAvatarDropdown
          userName={user.name ?? user.email ?? ""}
          userEmail={user.email ?? ""}
          onSignOut={handleSignOut}
          onClose={close}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun scripts/run-tests.ts ProfileAvatar`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/layout/ProfileAvatar.tsx apps/frontend/src/components/layout/ProfileAvatarDropdown.tsx apps/frontend/src/components/layout/ProfileAvatar.test.tsx
git commit -m "feat(layout): add ProfileAvatar nav trigger with viewport-safe dropdown"
```

---

### Task 8: Restructure `HouseholdSwitcher` — two groups, right-0, max-height

**Files:**

- Modify: `apps/frontend/src/components/layout/HouseholdSwitcher.tsx`
- Test: `apps/frontend/src/components/layout/HouseholdSwitcher.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

```tsx
// apps/frontend/src/components/layout/HouseholdSwitcher.test.tsx
import { describe, it, expect, mock } from "bun:test";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";
import { HouseholdSwitcher } from "./HouseholdSwitcher";

mock.module("@/stores/authStore", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      user: { id: "u1", activeHouseholdId: "h1", name: "Josh", email: "jane@example.com" },
      accessToken: "token",
      setUser: () => {},
    }),
}));

mock.module("@/services/household.service", () => ({
  householdService: {
    getHouseholds: async () => ({
      households: [
        { household: { id: "h1", name: "Snaith" } },
        { household: { id: "h2", name: "Parents" } },
      ],
    }),
    switchHousehold: async () => ({}),
    createHousehold: async () => ({}),
  },
}));

describe("HouseholdSwitcher dropdown", () => {
  it("shows two groups with correct entries when open", async () => {
    renderWithProviders(<HouseholdSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: /snaith/i }));
    // Group 1 header
    expect(await screen.findByText(/switch household/i)).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /^snaith/i })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /^parents/i })).toBeTruthy();
    // Group 2 actions
    expect(screen.getByRole("menuitem", { name: /household settings/i })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /create new household/i })).toBeTruthy();
  });

  it("menu is anchored right-0 to prevent viewport overflow", async () => {
    renderWithProviders(<HouseholdSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: /snaith/i }));
    const menu = await screen.findByRole("menu");
    expect(menu.className).toContain("right-0");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun scripts/run-tests.ts HouseholdSwitcher`
Expected: FAIL — selectors unmatched (current dropdown has no `role="menu"` and no "Household settings" item)

- [ ] **Step 3: Write minimal implementation**

Replace the return block of `HouseholdSwitcher.tsx` (the `<div>` containing the dropdown) with:

```tsx
return (
  <div className="relative" ref={dropdownRef}>
    <button
      type="button"
      aria-expanded={isOpen}
      className="flex items-center gap-1 text-sm font-medium text-foreground hover:text-foreground/80 transition-colors truncate max-w-[180px] px-2 py-1 rounded border border-transparent hover:bg-white/[0.02]"
      onClick={() => setIsOpen(!isOpen)}
    >
      <span className="truncate">{activeName}</span>
      <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
    </button>

    {isOpen && (
      <div
        role="menu"
        className="absolute right-0 top-[calc(100%+6px)] min-w-[240px] max-w-[300px] bg-popover border rounded-md p-1.5 z-30 shadow-lg"
        style={{ maxHeight: "min(420px, calc(100vh - 70px))", overflowY: "auto" }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/40 px-2.5 pt-1 pb-1">
          Switch household
        </p>
        {households.map(({ household }) => (
          <button
            key={household.id}
            type="button"
            role="menuitem"
            className="flex items-center justify-between w-full px-2.5 py-2 rounded text-sm text-foreground/85 hover:bg-accent/12 hover:text-foreground transition-colors"
            onClick={() => {
              if (household.id !== activeId) switchMutation.mutate(household.id);
              else setIsOpen(false);
            }}
          >
            <span className="truncate">{household.name}</span>
            {household.id === activeId && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
          </button>
        ))}
        <div className="h-px bg-foreground/10 my-1.5" />
        <button
          type="button"
          role="menuitem"
          className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded text-sm text-foreground/85 hover:bg-accent/12 hover:text-foreground transition-colors"
          onClick={() => {
            setIsOpen(false);
            navigate("/settings/household");
          }}
        >
          <Settings className="h-3.5 w-3.5 text-foreground/40" />
          Household settings
        </button>
        <button
          type="button"
          role="menuitem"
          className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded text-sm text-primary hover:bg-accent/12 transition-colors"
          onClick={() => {
            setIsOpen(false);
            setShowCreate(true);
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Create new household
        </button>
      </div>
    )}

    <CreateHouseholdDialog
      isOpen={showCreate}
      onClose={() => setShowCreate(false)}
      onConfirm={(name) => createMutation.mutate(name)}
      isPending={createMutation.isPending}
    />
  </div>
);
```

Also update imports at the top of `HouseholdSwitcher.tsx` to include `Settings` from `lucide-react` (keep `Check`, `ChevronDown`, `Plus`):

```ts
import { Check, ChevronDown, Plus, Settings } from "lucide-react";
```

Also add `Escape` + outside-click handling (already present via `useEffect`). No change needed there.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun scripts/run-tests.ts HouseholdSwitcher`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/layout/HouseholdSwitcher.tsx apps/frontend/src/components/layout/HouseholdSwitcher.test.tsx
git commit -m "refactor(layout): restructure HouseholdSwitcher with groups and right-0 anchor"
```

---

### Task 9: Update `Layout.tsx` — remove Settings nav link, add ProfileAvatar

**Files:**

- Modify: `apps/frontend/src/components/layout/Layout.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/components/layout/Layout.settings-link.test.tsx`:

```tsx
// apps/frontend/src/components/layout/Layout.settings-link.test.tsx
import { describe, it, expect, mock } from "bun:test";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";
import Layout from "./Layout";

mock.module("@/stores/authStore", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      user: { id: "u1", activeHouseholdId: "h1", name: "Jane Smith", email: "jane@example.com" },
      accessToken: "t",
      setUser: () => {},
      logout: async () => {},
    }),
}));

mock.module("@/services/household.service", () => ({
  householdService: { getHouseholds: async () => ({ households: [] }) },
}));

describe("Layout top nav", () => {
  it("does not render a Settings nav link", () => {
    renderWithProviders(
      <Layout>
        <p>content</p>
      </Layout>
    );
    const link = screen.queryByRole("link", { name: "Settings" });
    expect(link).toBeNull();
  });

  it("renders the ProfileAvatar", () => {
    renderWithProviders(
      <Layout>
        <p>content</p>
      </Layout>
    );
    expect(screen.getByRole("button", { name: /profile menu/i })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun scripts/run-tests.ts Layout.settings-link`
Expected: FAIL — current Layout still has the Settings nav link

- [ ] **Step 3: Write minimal implementation**

Edit `apps/frontend/src/components/layout/Layout.tsx`:

1. Add import at top: `import { ProfileAvatar } from "./ProfileAvatar";`
2. Delete the line: `const SETTINGS_ITEM = { to: "/settings", label: "Settings", colorClass: "text-foreground" };`
3. In the mobile Sheet nav array, remove `SETTINGS_ITEM` from the spread:
   ```tsx
   {[...NAV_ITEMS_GROUP1, ...NAV_ITEMS_GROUP2, ...NAV_ITEMS_GROUP3].map(
   ```
4. In the desktop nav group, replace the block from `<div className="flex items-center gap-3 ml-auto">` through its closing `</div>` with:
   ```tsx
   <div className="flex items-center gap-3 ml-auto">
     <HouseholdSwitcher />
     <ProfileAvatar />
   </div>
   ```
   (i.e. drop the `<NavLink to={SETTINGS_ITEM.to} ...>...</NavLink>` block entirely.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun scripts/run-tests.ts Layout.settings-link`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/layout/Layout.tsx apps/frontend/src/components/layout/Layout.settings-link.test.tsx
git commit -m "refactor(layout): replace Settings nav link with ProfileAvatar trigger"
```

---

### Task 10: Refactor `ProfileSection` — auto-save name via `AutoSaveField`

**Files:**

- Modify: `apps/frontend/src/components/settings/ProfileSection.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/components/settings/ProfileSection.test.tsx`:

```tsx
import { describe, it, expect, mock } from "bun:test";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";
import { ProfileSection } from "./ProfileSection";

mock.module("@/stores/authStore", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      user: { id: "u1", name: "Jane Smith", email: "jane@example.com", activeHouseholdId: "h1" },
      accessToken: "t",
      setUser: () => {},
    }),
}));

mock.module("@/services/auth.service", () => ({
  authService: { updateProfile: async () => ({ user: { name: "New" } }) },
}));

describe("ProfileSection", () => {
  it("renders without a Save button (auto-save)", () => {
    renderWithProviders(<ProfileSection />);
    const save = screen.queryByRole("button", { name: /^save$/i });
    expect(save).toBeNull();
  });

  it("wraps the name input in an AutoSaveField", () => {
    const { container } = renderWithProviders(<ProfileSection />);
    const field = container.querySelector(".autosave-field");
    expect(field).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun scripts/run-tests.ts ProfileSection`
Expected: FAIL — current ProfileSection has a Save button

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/frontend/src/components/settings/ProfileSection.tsx
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/stores/authStore";
import { authService } from "@/services/auth.service";
import { SettingsSection } from "./SettingsSection";
import { AutoSaveField } from "./AutoSaveField";
import { useAutoSave } from "@/hooks/useAutoSave";

export function ProfileSection() {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const setUser = useAuthStore((s) => s.setUser);

  const { value, setValue, status, errorMessage } = useAutoSave<string>({
    initialValue: user?.name ?? "",
    onSave: async (next) => {
      if (!accessToken) throw new Error("Not authenticated");
      const { user: updated } = await authService.updateProfile(accessToken, { name: next });
      setUser(updated, accessToken);
    },
  });

  return (
    <SettingsSection
      id="account"
      title="Account"
      description="Your account details. Applied across every household you're a member of."
    >
      <AutoSaveField
        label="Name"
        htmlFor="profile-name"
        status={status}
        errorMessage={errorMessage}
      >
        <Input
          id="profile-name"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={status === "error"}
        />
      </AutoSaveField>
      <div className="text-sm text-foreground/40">{user?.email}</div>
    </SettingsSection>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun scripts/run-tests.ts ProfileSection`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/settings/ProfileSection.tsx apps/frontend/src/components/settings/ProfileSection.test.tsx
git commit -m "refactor(settings): move ProfileSection to auto-save via AutoSaveField"
```

---

> **Refactor-task test coverage:** Tasks 11–17 are structural refactors of existing section components. Their correctness is covered end-to-end by the page-level tests in Tasks 18 and 19 (which render the new pages with mocked hooks and assert the expected sections, nav items, and AutoSaveField wrappers appear). Each refactor task therefore provides a full code block in Step 3 and runs the relevant test pattern in Step 4; some skip Step 1 (new failing test) where the outcome is a visual/structural migration covered by higher-level assertions. After each refactor task, run `cd apps/frontend && bun scripts/run-tests.ts <section-name>` to catch regressions before committing.

### Task 11: Refactor `DisplaySection` — use `SettingsSection`, keep auto-save

**Files:**

- Modify: `apps/frontend/src/components/settings/DisplaySection.tsx`

- [ ] **Step 1:** (No new test — existing toggle behaviour covered by prior tests; structure change is visual.)
- [ ] **Step 3: Write minimal implementation**

Replace contents of `DisplaySection.tsx` with:

```tsx
import { useState, useEffect } from "react";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { SettingsSection } from "./SettingsSection";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/utils/format";

const EXAMPLE_VALUE = 1234.56;

export function DisplaySection() {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const serverShowPence = settings?.showPence ?? false;
  const [showPence, setShowPence] = useState(serverShowPence);

  useEffect(() => setShowPence(serverShowPence), [serverShowPence]);

  function handleToggle() {
    const next = !showPence;
    setShowPence(next);
    updateSettings.mutate({ showPence: next }, { onError: () => setShowPence(!next) });
  }

  return (
    <SettingsSection
      id="display"
      title="Display"
      description="How values render for you specifically. Does not affect other household members."
    >
      <div className="flex items-start gap-3">
        <Checkbox
          id="show-pence"
          checked={showPence}
          onCheckedChange={handleToggle}
          disabled={updateSettings.isPending}
        />
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-2">
            <Label htmlFor="show-pence" className="text-sm font-medium cursor-pointer">
              Show pence
            </Label>
            <span className="font-numeric text-xs text-muted-foreground">
              e.g. {formatCurrency(EXAMPLE_VALUE, showPence)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Display pence on all financial values for full precision. When off, values are rounded
            to the nearest pound.
          </p>
        </div>
      </div>
    </SettingsSection>
  );
}
```

- [ ] **Step 4: Run tests to verify regression-free**

Run: `cd apps/frontend && bun scripts/run-tests.ts DisplaySection`
Expected: PASS (toasts removed; silence is approval on toggle — test may need updating if it asserts toast text. If an existing DisplaySection test asserts toast content, update the assertion to check state change only.)

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/settings/DisplaySection.tsx
git commit -m "refactor(settings): migrate DisplaySection to SettingsSection wrapper"
```

---

### Task 12: Refactor `SurplusSection`

**Files:**

- Modify: `apps/frontend/src/components/settings/SurplusSection.tsx`

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/frontend/src/components/settings/SurplusSection.tsx
import { Input } from "@/components/ui/input";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { SettingsSection } from "./SettingsSection";
import { AutoSaveField } from "./AutoSaveField";
import { useAutoSave } from "@/hooks/useAutoSave";

export function SurplusSection() {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const initial = settings?.surplusBenchmarkPct ?? 10;
  const { value, setValue, status, errorMessage } = useAutoSave<number>({
    initialValue: initial,
    onSave: async (next) => updateSettings.mutateAsync({ surplusBenchmarkPct: next }),
  });

  return (
    <SettingsSection
      id="surplus"
      title="Surplus benchmark"
      description="Percentage of net income that should remain as surplus before a cashflow attention is surfaced."
    >
      <AutoSaveField
        label="Benchmark"
        htmlFor="surplus-pct"
        status={status}
        errorMessage={errorMessage}
      >
        <div className="flex items-center gap-2 max-w-sm">
          <Input
            id="surplus-pct"
            type="number"
            min={0}
            max={100}
            step={0.1}
            className="w-24"
            value={value}
            onChange={(e) => setValue(parseFloat(e.target.value) || 0)}
            aria-invalid={status === "error"}
          />
          <span className="text-sm">%</span>
        </div>
      </AutoSaveField>
    </SettingsSection>
  );
}
```

Note: `useUpdateSettings` as defined today returns a `UseMutationResult`. Confirm `.mutateAsync` availability — it is standard on TanStack Query mutations.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/settings/SurplusSection.tsx
git commit -m "refactor(settings): auto-save SurplusSection via AutoSaveField"
```

---

### Task 13: Refactor `StalenessSection`

**Files:**

- Modify: `apps/frontend/src/components/settings/StalenessSection.tsx`

- [ ] **Step 3: Write minimal implementation**

Each threshold field wraps in its own `AutoSaveField`, sharing one `useUpdateSettings` mutation. The hook call is per-field.

```tsx
// apps/frontend/src/components/settings/StalenessSection.tsx
import { Input } from "@/components/ui/input";
import type { StalenessThresholds } from "@finplan/shared";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { SettingsSection } from "./SettingsSection";
import { AutoSaveField } from "./AutoSaveField";
import { useAutoSave } from "@/hooks/useAutoSave";

const LABELS: Record<keyof StalenessThresholds, string> = {
  income_source: "Income sources",
  committed_bill: "Monthly bills",
  yearly_bill: "Yearly bills",
  discretionary_category: "Discretionary categories",
  savings_allocation: "Savings allocations",
  wealth_account: "Wealth accounts",
};

const DEFAULTS: StalenessThresholds = {
  income_source: 12,
  committed_bill: 6,
  yearly_bill: 12,
  discretionary_category: 12,
  savings_allocation: 12,
  wealth_account: 3,
};

function ThresholdField({
  thresholdKey,
  current,
  onUpdate,
}: {
  thresholdKey: keyof StalenessThresholds;
  current: StalenessThresholds;
  onUpdate: (next: StalenessThresholds) => Promise<void>;
}) {
  const { value, setValue, status, errorMessage } = useAutoSave<number>({
    initialValue: current[thresholdKey],
    onSave: async (next) => onUpdate({ ...current, [thresholdKey]: next }),
  });
  return (
    <AutoSaveField
      label={LABELS[thresholdKey]}
      htmlFor={`staleness-${thresholdKey}`}
      status={status}
      errorMessage={errorMessage}
    >
      <Input
        id={`staleness-${thresholdKey}`}
        type="number"
        min={1}
        value={value}
        onChange={(e) => setValue(parseInt(e.target.value, 10) || 1)}
        aria-invalid={status === "error"}
      />
    </AutoSaveField>
  );
}

export function StalenessSection() {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const current = settings?.stalenessThresholds ?? DEFAULTS;

  const save = async (next: StalenessThresholds) => {
    await updateSettings.mutateAsync({ stalenessThresholds: next });
  };

  return (
    <SettingsSection
      id="staleness"
      title="Staleness thresholds"
      description="Number of months before each item type is considered stale."
    >
      <div className="grid grid-cols-2 gap-3 max-w-lg">
        {(Object.keys(LABELS) as Array<keyof StalenessThresholds>).map((k) => (
          <ThresholdField key={k} thresholdKey={k} current={current} onUpdate={save} />
        ))}
      </div>
    </SettingsSection>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/settings/StalenessSection.tsx
git commit -m "refactor(settings): auto-save StalenessSection thresholds"
```

---

### Task 14: Refactor `IsaSection` and `GrowthRatesSection`

**Files:**

- Modify: `apps/frontend/src/components/settings/IsaSection.tsx`
- Modify: `apps/frontend/src/components/settings/GrowthRatesSection.tsx`

- [ ] **Step 3: Implementation pattern** — for each numeric/text field in these sections, replace the local-state + Save button with `useAutoSave` + `AutoSaveField` wrapping an `Input`. Use `SettingsSection` for the wrapper.

  Follow the exact pattern from Task 12 (`SurplusSection`) for single-field sections and Task 13 (`StalenessSection`) for multi-field sections. Do NOT duplicate the hook per field when values are interdependent (e.g. a growth-rates map) — use one per field, each calling the update with a merged object.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/settings/IsaSection.tsx apps/frontend/src/components/settings/GrowthRatesSection.tsx
git commit -m "refactor(settings): auto-save ISA and Growth Rates sections"
```

---

### Task 15: Refactor `SubcategoriesSection`

**Files:**

- Modify: `apps/frontend/src/components/settings/SubcategoriesSection.tsx`

- [ ] **Step 3: Implementation guidance**

This section edits subcategory rows (`SubcategoryRow`) — rename + budget. It currently uses a batch Save button for "Changes are saved together" semantics. Keep the existing batch-save UX inside this section but wrap the outer section in `SettingsSection` (so the header matches § 8). Do NOT convert to per-row auto-save — the "saved together" model is load-bearing for the category reassignment flow. This is a deliberate exception to the auto-save default; note it inline in a brief comment.

Minimum edit: swap `<Section id="subcategories" title="Subcategories">` wrapper for `<SettingsSection id="subcategories" title="Subcategories" description="Customise the subcategories for each waterfall tier. Changes are saved together.">`. Leave the Save button and draft state untouched.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/settings/SubcategoriesSection.tsx
git commit -m "refactor(settings): migrate SubcategoriesSection wrapper to SettingsSection"
```

---

### Task 16: Split `HouseholdSection` into `HouseholdDetailsSection` + `HouseholdMembersSection`

**Files:**

- Create: `apps/frontend/src/components/settings/HouseholdDetailsSection.tsx`
- Create: `apps/frontend/src/components/settings/HouseholdMembersSection.tsx`
- Delete: `apps/frontend/src/components/settings/HouseholdSection.tsx` (after consumers migrate in Tasks 19–20)
- Modify: `apps/frontend/src/components/settings/HouseholdSection.test.tsx` → split into two test files (or delete if covered by new sections)

- [ ] **Step 3: Implementation**

`HouseholdDetailsSection` — owns the household name only, wrapped in `AutoSaveField` + `useAutoSave` calling `useRenameHousehold().mutateAsync`. Owner-only edit permissions:

```tsx
// apps/frontend/src/components/settings/HouseholdDetailsSection.tsx
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/stores/authStore";
import { useHouseholdDetails, useRenameHousehold } from "@/hooks/useSettings";
import { SettingsSection } from "./SettingsSection";
import { AutoSaveField } from "./AutoSaveField";
import { useAutoSave } from "@/hooks/useAutoSave";

export function HouseholdDetailsSection() {
  const user = useAuthStore((s) => s.user);
  const householdId = user?.activeHouseholdId ?? "";
  const { data } = useHouseholdDetails(householdId);
  const rename = useRenameHousehold();
  const household = data?.household;
  const currentMember = household?.memberProfiles.find((m) => m.userId === user?.id);
  const isOwner = currentMember?.role === "owner";

  const { value, setValue, status, errorMessage } = useAutoSave<string>({
    initialValue: household?.name ?? "",
    onSave: async (next) => rename.mutateAsync({ id: householdId, name: next }),
  });

  return (
    <SettingsSection
      id="details"
      title="Details"
      description="Name and basic information about this household."
    >
      {isOwner ? (
        <AutoSaveField
          label="Household name"
          htmlFor="hh-name"
          status={status}
          errorMessage={errorMessage}
        >
          <Input
            id="hh-name"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={status === "error"}
          />
        </AutoSaveField>
      ) : (
        <div className="text-sm text-foreground/60">{household?.name}</div>
      )}
    </SettingsSection>
  );
}
```

`HouseholdMembersSection` — owns everything else that was in the original `HouseholdSection` (MemberManagementSection include, invite form + QR + pending invites, Leave button + ConfirmDialog). This is a straight move: copy the corresponding JSX/state from the old `HouseholdSection` into this new component, wrap its outer boundary in `SettingsSection id="members" title="Members & invites" description="..."` rather than the legacy `<Section>`.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/settings/HouseholdDetailsSection.tsx apps/frontend/src/components/settings/HouseholdMembersSection.tsx
git commit -m "feat(settings): split HouseholdSection into Details + Members sections"
```

---

### Task 17: Delete `Section.tsx` and migrate leftover consumers

**Files:**

- Modify: all files still importing `./Section` (ripgrep to find remaining consumers — `DataSection.tsx`, `AuditLogSection.tsx`, and any others).
- Delete: `apps/frontend/src/components/settings/Section.tsx`

- [ ] **Step 3: Implementation**

Run `bun -e "$(cat <<'EOF'\nimport.meta\nEOF\n)"`-equivalent via ripgrep:

```bash
cd apps/frontend && rg -l "from \"./Section\"|from \"\\.\\./Section\"" src/components/settings
```

For each remaining file, replace the `Section` import with `SettingsSection` and replace the `<Section>` element with `<SettingsSection>` (supplying a `description` where available). These are mainly `DataSection` and `AuditLogSection` — both read-only / destructive-only; they do not use `AutoSaveField`.

Once zero imports of `./Section` remain:

```bash
cd apps/frontend && rm src/components/settings/Section.tsx
```

- [ ] **Step 4: Run tests**

Run: `cd apps/frontend && bun scripts/run-tests.ts settings`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/settings
git commit -m "refactor(settings): remove legacy Section.tsx after full migration"
```

---

### Task 18: `ProfileSettingsPage`

**Files:**

- Create: `apps/frontend/src/pages/ProfileSettingsPage.tsx`
- Test: `apps/frontend/src/pages/ProfileSettingsPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/frontend/src/pages/ProfileSettingsPage.test.tsx
import { describe, it, expect, mock } from "bun:test";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";
import ProfileSettingsPage from "./ProfileSettingsPage";

mock.module("@/stores/authStore", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      user: { id: "u1", name: "Jane Smith", email: "jane@example.com", activeHouseholdId: "h1" },
      accessToken: "t",
      setUser: () => {},
    }),
}));

mock.module("@/hooks/useSettings", () => ({
  useSettings: () => ({
    data: { showPence: false },
    isLoading: false,
    isError: false,
    refetch: () => {},
  }),
  useUpdateSettings: () => ({ mutate: () => {}, mutateAsync: async () => ({}), isPending: false }),
}));

describe("ProfileSettingsPage", () => {
  it("renders Profile title and two nav items", () => {
    renderWithProviders(<ProfileSettingsPage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Profile");
    expect(screen.getByRole("button", { name: "Account" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Display" })).toBeTruthy();
  });

  it("renders Account and Display sections in the right panel", () => {
    renderWithProviders(<ProfileSettingsPage />);
    // Both section titles render (one in right panel, labels also in left panel nav)
    const headings = screen.getAllByRole("heading", { level: 3 });
    const titles = headings.map((h) => h.textContent);
    expect(titles).toContain("Account");
    expect(titles).toContain("Display");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun scripts/run-tests.ts ProfileSettingsPage`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/frontend/src/pages/ProfileSettingsPage.tsx
import { useRef, useState, useCallback } from "react";
import { SettingsLeftPanel, type SettingsNavItem } from "@/components/settings/SettingsLeftPanel";
import {
  SettingsRightPanel,
  type SettingsRightPanelHandle,
} from "@/components/settings/SettingsRightPanel";
import { ProfileSection } from "@/components/settings/ProfileSection";
import { DisplaySection } from "@/components/settings/DisplaySection";

const ITEMS: SettingsNavItem[] = [
  { id: "account", label: "Account" },
  { id: "display", label: "Display" },
];

export default function ProfileSettingsPage() {
  const [activeId, setActiveId] = useState<string>(ITEMS[0].id);
  const rightRef = useRef<SettingsRightPanelHandle | null>(null);

  const handleNavClick = useCallback((id: string) => {
    setActiveId(id);
    rightRef.current?.scrollToSection(id);
  }, []);

  return (
    <div data-page="settings" className="relative flex h-full overflow-hidden">
      <SettingsLeftPanel
        title="Profile"
        subLabel="Your personal preferences"
        activeId={activeId}
        items={ITEMS}
        onNavClick={handleNavClick}
      />
      <SettingsRightPanel
        ref={rightRef}
        title="Profile"
        activeId={activeId}
        onActiveChange={setActiveId}
      >
        <ProfileSection />
        <DisplaySection />
      </SettingsRightPanel>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun scripts/run-tests.ts ProfileSettingsPage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/ProfileSettingsPage.tsx apps/frontend/src/pages/ProfileSettingsPage.test.tsx
git commit -m "feat(settings): add ProfileSettingsPage"
```

---

### Task 19: `HouseholdSettingsPage` with role filtering

**Files:**

- Create: `apps/frontend/src/pages/HouseholdSettingsPage.tsx`
- Test: `apps/frontend/src/pages/HouseholdSettingsPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/frontend/src/pages/HouseholdSettingsPage.test.tsx
import { describe, it, expect, mock } from "bun:test";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";
import HouseholdSettingsPage from "./HouseholdSettingsPage";

function mockRole(role: "owner" | "admin" | "member") {
  mock.module("@/stores/authStore", () => ({
    useAuthStore: (selector: (state: unknown) => unknown) =>
      selector({
        user: { id: "u1", name: "Josh", email: "j@x", activeHouseholdId: "h1" },
        accessToken: "t",
        setUser: () => {},
      }),
  }));
  mock.module("@/hooks/useSettings", () => ({
    useSettings: () => ({
      data: { surplusBenchmarkPct: 10 },
      isLoading: false,
      isError: false,
      refetch: () => {},
    }),
    useUpdateSettings: () => ({
      mutate: () => {},
      mutateAsync: async () => ({}),
      isPending: false,
    }),
    useHouseholdDetails: () => ({
      data: {
        household: {
          id: "h1",
          name: "Snaith",
          memberProfiles: [{ userId: "u1", id: "m1", role, name: "Josh" }],
          invites: [],
        },
      },
      isLoading: false,
    }),
  }));
}

describe("HouseholdSettingsPage role-based visibility", () => {
  it("owner sees Data, Growth rates, Audit log entries", () => {
    mockRole("owner");
    renderWithProviders(<HouseholdSettingsPage />);
    expect(screen.getByRole("button", { name: "Data" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Growth rates" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Audit log" })).toBeTruthy();
  });

  it("admin sees Growth rates and Audit log but not Data", () => {
    mockRole("admin");
    renderWithProviders(<HouseholdSettingsPage />);
    expect(screen.queryByRole("button", { name: "Data" })).toBeNull();
    expect(screen.getByRole("button", { name: "Growth rates" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Audit log" })).toBeTruthy();
  });

  it("member sees neither Data, Growth rates, nor Audit log", () => {
    mockRole("member");
    renderWithProviders(<HouseholdSettingsPage />);
    expect(screen.queryByRole("button", { name: "Data" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Growth rates" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Audit log" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun scripts/run-tests.ts HouseholdSettingsPage`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/frontend/src/pages/HouseholdSettingsPage.tsx
import { useMemo, useRef, useState, useCallback } from "react";
import { Navigate } from "react-router-dom";
import { SettingsLeftPanel, type SettingsNavItem } from "@/components/settings/SettingsLeftPanel";
import {
  SettingsRightPanel,
  type SettingsRightPanelHandle,
} from "@/components/settings/SettingsRightPanel";
import { HouseholdDetailsSection } from "@/components/settings/HouseholdDetailsSection";
import { HouseholdMembersSection } from "@/components/settings/HouseholdMembersSection";
import { SurplusSection } from "@/components/settings/SurplusSection";
import { IsaSection } from "@/components/settings/IsaSection";
import { StalenessSection } from "@/components/settings/StalenessSection";
import { GrowthRatesSection } from "@/components/settings/GrowthRatesSection";
import { SubcategoriesSection } from "@/components/settings/SubcategoriesSection";
import { DataSection } from "@/components/settings/DataSection";
import { AuditLogSection } from "@/components/settings/AuditLogSection";
import { useAuthStore } from "@/stores/authStore";
import { useHouseholdDetails } from "@/hooks/useSettings";

type Role = "owner" | "admin" | "member";

function useRole(): Role | null {
  const user = useAuthStore((s) => s.user);
  const { data } = useHouseholdDetails(user?.activeHouseholdId ?? "");
  const member = data?.household?.memberProfiles.find((m) => m.userId === user?.id);
  return (member?.role as Role | undefined) ?? null;
}

export default function HouseholdSettingsPage() {
  const user = useAuthStore((s) => s.user);
  const householdId = user?.activeHouseholdId;
  const role = useRole();
  const { data } = useHouseholdDetails(householdId ?? "");
  const householdName = data?.household?.name ?? "";

  const items = useMemo<SettingsNavItem[]>(() => {
    const base: SettingsNavItem[] = [
      { id: "details", label: "Details", group: "General" },
      { id: "members", label: "Members & invites", group: "General" },
      { id: "surplus", label: "Surplus benchmark", group: "Financial" },
      { id: "isa", label: "ISA settings", group: "Financial" },
      { id: "staleness", label: "Staleness thresholds", group: "Financial" },
    ];
    if (role === "owner" || role === "admin") {
      base.push({ id: "growth-rates", label: "Growth rates", group: "Financial" });
    }
    base.push({ id: "subcategories", label: "Subcategories", group: "Structure" });
    if (role === "owner") base.push({ id: "data", label: "Data", group: "Advanced" });
    if (role === "owner" || role === "admin") {
      base.push({ id: "audit-log", label: "Audit log", group: "Advanced" });
    }
    return base;
  }, [role]);

  const [activeId, setActiveId] = useState<string>("details");
  const rightRef = useRef<SettingsRightPanelHandle | null>(null);
  const handleNavClick = useCallback((id: string) => {
    setActiveId(id);
    rightRef.current?.scrollToSection(id);
  }, []);

  if (!householdId) return <Navigate to="/settings/profile" replace />;

  return (
    <div data-page="settings" className="relative flex h-full overflow-hidden">
      <SettingsLeftPanel
        title="Household"
        subLabel={householdName}
        subLabelClassName="text-foreground/65 font-semibold"
        activeId={activeId}
        items={items}
        onNavClick={handleNavClick}
      />
      <SettingsRightPanel
        ref={rightRef}
        title="Household"
        activeId={activeId}
        onActiveChange={setActiveId}
      >
        <HouseholdDetailsSection />
        <HouseholdMembersSection />
        <SurplusSection />
        <IsaSection />
        <StalenessSection />
        {(role === "owner" || role === "admin") && <GrowthRatesSection />}
        <SubcategoriesSection />
        {role === "owner" && <DataSection />}
        {(role === "owner" || role === "admin") && <AuditLogSection />}
      </SettingsRightPanel>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun scripts/run-tests.ts HouseholdSettingsPage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/HouseholdSettingsPage.tsx apps/frontend/src/pages/HouseholdSettingsPage.test.tsx
git commit -m "feat(settings): add HouseholdSettingsPage with role-based section visibility"
```

---

### Task 20: Update router — add `/settings/profile`, `/settings/household`, redirect

**Files:**

- Modify: `apps/frontend/src/App.tsx`
- Delete: `apps/frontend/src/pages/SettingsPage.tsx`
- Delete: `apps/frontend/src/pages/SettingsPage.test.tsx`

- [ ] **Step 3: Write minimal implementation**

Edit `App.tsx`:

1. Replace the single `SettingsPage` lazy import with two new imports:

```tsx
const ProfileSettingsPage = lazy(() => import("./pages/ProfileSettingsPage"));
const HouseholdSettingsPage = lazy(() => import("./pages/HouseholdSettingsPage"));
```

(Remove the `SettingsPage` import line.)

2. In the `<Routes>` block, replace `<Route path="/settings" element={<SettingsPage />} />` with:

```tsx
<Route path="/settings" element={<Navigate to="/settings/profile" replace />} />
<Route path="/settings/profile" element={<ProfileSettingsPage />} />
<Route path="/settings/household" element={<HouseholdSettingsPage />} />
```

3. Delete the old files via `git rm` so deletion is staged together with the `App.tsx` edit:

```bash
cd apps/frontend && git rm src/pages/SettingsPage.tsx src/pages/SettingsPage.test.tsx
```

- [ ] **Step 4: Run full frontend test suite**

Run: `cd apps/frontend && bun scripts/run-tests.ts`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/App.tsx
git commit -m "feat(settings): split /settings into /settings/profile and /settings/household"
```

---

### Task 21: Verification pass — lint, type, build, manual smoke

**Files:** none

- [ ] Run: `cd apps/frontend && bun run type-check`. Expected: zero errors.
- [ ] Run: `cd apps/frontend && bun run lint`. Expected: zero warnings.
- [ ] Run: `cd apps/frontend && bun scripts/run-tests.ts`. Expected: all tests pass.
- [ ] Run: `bun run build`. Expected: success.
- [ ] Manual smoke — see Verification section below.

---

## Testing

### Backend Tests

No changes — the backend surface is untouched.

### Frontend Tests

- [ ] Hook: `useAutoSave` — debounce timing, immediate toggle save, revert on failure, idle transition on re-edit.
- [ ] Component: `AutoSaveField` — label, saved flash, error alert, status attribute.
- [ ] Component: `SettingsSection` — data-section-id, § 8 heading treatment.
- [ ] Component: `SettingsLeftPanel` — flat vs. grouped rendering, active indicator, onNavClick dispatch.
- [ ] Component: `SettingsRightPanel` — sticky header, scrollToSection exposure, observer activation (integration-level).
- [ ] Component: `ProfileAvatar` — initials, dropdown open/close, Escape, right-0 anchor.
- [ ] Component: `HouseholdSwitcher` — two-group structure, role="menu", right-0 anchor.
- [ ] Layout: no Settings nav link; ProfileAvatar present.
- [ ] Section: `ProfileSection` — no Save button, wrapped in AutoSaveField.
- [ ] Page: `ProfileSettingsPage` — title, two nav items, both sections render.
- [ ] Page: `HouseholdSettingsPage` — role-based section visibility for owner / admin / member.

### Key Scenarios

- [ ] Happy path — navigate from avatar → `/settings/profile` → edit name → confirm border pulse + "✓ saved" flash → reload page and confirm persistence.
- [ ] Happy path — household switcher → "Household settings" → `/settings/household` → edit surplus benchmark → confirm feedback + persistence.
- [ ] Click any left-nav item → right panel smooth-scrolls and active highlight moves.
- [ ] Scroll the right panel → active highlight follows via IntersectionObserver.
- [ ] Error case — intercept the `PUT /api/settings` mutation response with a 500 → confirm field reverts, inline red text appears, no toast.
- [ ] Error recovery — edit the same field again → red text clears (status → idle) → save again → success feedback.
- [ ] Destructive — member role change still requires confirm; Leave household still opens `ConfirmDialog`; Remove member still opens modal.
- [ ] Edge case — `/settings` redirects to `/settings/profile`.
- [ ] Edge case — user with no `activeHouseholdId` navigating to `/settings/household` is redirected to `/settings/profile`.
- [ ] Edge case — at 1024px viewport width, household switcher and profile avatar dropdowns stay fully visible.
- [ ] Accessibility — `prefers-reduced-motion: reduce` disables border-pulse animation; save state still applied; `aria-live` announces "saved"; `role="alert"` announces errors.

## Verification

- [ ] `cd apps/frontend && bun run type-check` — zero errors
- [ ] `cd apps/frontend && bun run lint` — zero warnings
- [ ] `cd apps/frontend && bun scripts/run-tests.ts` — all PASS
- [ ] `bun run build` — clean success at repo root
- [ ] Manual in Docker dev (`bun run start`):
  - [ ] Profile avatar visible at top-right; click opens dropdown; click `Profile settings` → `/settings/profile` loads.
  - [ ] Household switcher shows two groups; `Household settings` → `/settings/household` loads; `+ Create new household` still works.
  - [ ] At 1024px viewport width, both dropdowns stay inside the viewport.
  - [ ] Edit each section field on both pages — observe pulse + inline saved flash; reload to confirm persistence.
  - [ ] Network DevTools: block all `PUT` requests → observe field revert + inline red helper text.
  - [ ] Left-nav indicator pattern matches design system (14% accent background + 2px left border); no full-fill.
  - [ ] Growth rates and Audit log highlights correctly when clicked (swap-ref bug fixed).
  - [ ] `prefers-reduced-motion: reduce` (in DevTools Rendering panel) — pulse animation disabled; save state still visible.
  - [ ] Scroll-spy: scrolling the right panel updates the left-nav active highlight; clicking a nav item scrolls to that section.
  - [ ] As a household member (non-admin), log in and navigate to `/settings/household` — confirm Growth rates, Data, and Audit log entries are hidden.

## Post-conditions

- [ ] Settings is split into two scope-specific pages aligned to the canonical design system.
- [ ] Auto-save is the default save model for Settings; destructive actions remain confirm-gated.
- [ ] `HouseholdSwitcher` is the unified household-scoped entry point and is viewport-safe.
- [ ] `ProfileAvatar` is the personal entry point in the top nav.
- [ ] Three reusable primitives (`useAutoSave`, `AutoSaveField`, `SettingsSection`) and two layout shells (`SettingsLeftPanel`, `SettingsRightPanel`) are available for any future Settings-like surface.
- [ ] No changes to backend surface, schema, or shared schemas — this plan is infrastructure-neutral.
