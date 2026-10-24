---
feature: settings-page-enhancements
spec: docs/4. planning/settings-page-enhancements/settings-page-enhancements-spec.md
creation_date: 2026-03-26
status: implemented
implemented_date: 2026-07-05
---

# Settings Page Enhancements — Implementation Plan

> **For Claude:** Use `/execute-plan settings-page-enhancements` to implement this plan task-by-task.

> **Purpose:** An ordered, task-by-task build guide. Each task follows TDD red-green-commit and contains complete, ready-to-run code — no "implement X" placeholders. This is the input to `/execute-plan`. The spec defines _what_ to build; this plan defines _how_.

**Goal:** Simplify the settings page by removing unused sections, trimming ISA fields, and adding scroll-spy sidebar highlighting.
**Spec:** `docs/4. planning/settings-page-enhancements/settings-page-enhancements-spec.md`
**Architecture:** Frontend-only changes. Remove three section components (Snapshots, EndedIncome, Rebuild) and their SECTIONS entries. Simplify IsaSection to only expose the annual limit input. Add IntersectionObserver-based scroll-spy to SettingsPage that highlights the sidebar button for the currently visible section.
**Tech Stack:** React 18 · Tailwind
**Infrastructure Impact:**

- Touches `packages/shared/`: no
- Requires DB migration: no

## Pre-conditions

- [x] Settings page exists with all 9 sections rendering
- [x] ISA section currently renders month, day, and limit fields

## Tasks

---

### Task 1: Simplify IsaSection — remove month/day fields

**Files:**

- Modify: `apps/frontend/src/components/settings/IsaSection.tsx`

- [ ] **Step 1: Write the simplified component**

Replace the entire file content with:

```tsx
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { Section } from "./Section";

export function IsaSection() {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const [limit, setLimit] = useState(settings?.isaAnnualLimit ?? 20000);

  function handleSave() {
    updateSettings.mutate(
      { isaAnnualLimit: limit },
      { onSuccess: () => toast.success("ISA settings saved") }
    );
  }

  return (
    <Section id="isa" title="ISA settings">
      <div className="max-w-xs space-y-1">
        <label htmlFor="isa-limit" className="text-xs text-muted-foreground">
          Annual limit (£)
        </label>
        <Input
          id="isa-limit"
          type="number"
          min={0}
          value={limit}
          onChange={(e) => setLimit(parseFloat(e.target.value) || 0)}
        />
      </div>
      <Button size="sm" onClick={handleSave} disabled={updateSettings.isPending}>
        {updateSettings.isPending ? "Saving…" : "Save"}
      </Button>
    </Section>
  );
}
```

- [ ] **Step 2: Verify lint passes**

Run: `cd apps/frontend && bunx eslint src/components/settings/IsaSection.tsx`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/settings/IsaSection.tsx
git commit -m "refactor(settings): simplify ISA section to annual limit only"
```

---

### Task 2: Delete removed section components

**Files:**

- Delete: `apps/frontend/src/components/settings/SnapshotsSection.tsx`
- Delete: `apps/frontend/src/components/settings/EndedIncomeSection.tsx`
- Delete: `apps/frontend/src/components/settings/RebuildSection.tsx`

- [ ] **Step 1: Delete the three component files**

```bash
rm apps/frontend/src/components/settings/SnapshotsSection.tsx
rm apps/frontend/src/components/settings/EndedIncomeSection.tsx
rm apps/frontend/src/components/settings/RebuildSection.tsx
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/components/settings/SnapshotsSection.tsx apps/frontend/src/components/settings/EndedIncomeSection.tsx apps/frontend/src/components/settings/RebuildSection.tsx
git commit -m "refactor(settings): remove Snapshots, EndedIncome, and Rebuild sections"
```

---

### Task 3: Update SettingsPage — trim sections, add scroll-spy

**Files:**

- Modify: `apps/frontend/src/pages/SettingsPage.tsx`

- [ ] **Step 1: Write the updated SettingsPage**

Replace the entire file content with:

```tsx
import { useRef, useState, useEffect, useCallback } from "react";
import { ProfileSection } from "@/components/settings/ProfileSection";
import { StalenessSection } from "@/components/settings/StalenessSection";
import { SurplusSection } from "@/components/settings/SurplusSection";
import { IsaSection } from "@/components/settings/IsaSection";
import { HouseholdSection } from "@/components/settings/HouseholdSection";
import { TrustAccountsSection } from "@/components/settings/TrustAccountsSection";
import { SkeletonLoader } from "@/components/common/SkeletonLoader";
import { PanelError } from "@/components/common/PanelError";
import { useSettings } from "@/hooks/useSettings";

const SECTIONS = [
  { id: "profile", label: "Profile" },
  { id: "staleness", label: "Staleness thresholds" },
  { id: "surplus", label: "Surplus benchmark" },
  { id: "isa", label: "ISA settings" },
  { id: "household", label: "Household" },
  { id: "trust-accounts", label: "Trust accounts" },
] as const;

export default function SettingsPage() {
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const { isLoading, isError, refetch } = useSettings();
  const [activeSection, setActiveSection] = useState<string>(SECTIONS[0].id);

  const handleIntersection = useCallback((entries: IntersectionObserverEntry[]) => {
    const visible = entries
      .filter((e) => e.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

    if (visible.length > 0) {
      const id = visible[0].target.getAttribute("data-section-id");
      if (id) setActiveSection(id);
    }
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || isLoading || isError) return;

    const observer = new IntersectionObserver(handleIntersection, {
      root: container,
      threshold: 0.3,
    });

    for (const ref of Object.values(sectionRefs.current)) {
      if (ref) observer.observe(ref);
    }

    return () => observer.disconnect();
  }, [isLoading, isError, handleIntersection]);

  function scrollTo(id: string) {
    sectionRefs.current[id]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function setRef(id: string) {
    return (el: HTMLElement | null) => {
      sectionRefs.current[id] = el;
    };
  }

  return (
    <div data-page="settings" className="relative flex h-full overflow-hidden">
      {/* Left nav */}
      <aside className="w-48 shrink-0 border-r p-4 space-y-1 overflow-y-auto">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
          Settings
        </p>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`w-full text-left text-sm px-2 py-1.5 rounded transition-colors ${
              activeSection === s.id ? "bg-accent text-accent-foreground" : "hover:bg-accent"
            }`}
            onClick={() => scrollTo(s.id)}
          >
            {s.label}
          </button>
        ))}
      </aside>

      {/* Content */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-8" aria-busy={isLoading}>
        <h1 className="sr-only">Settings</h1>
        {isLoading ? (
          <SkeletonLoader variant="right-panel" />
        ) : isError ? (
          <PanelError variant="right" onRetry={refetch} message="Could not load settings" />
        ) : (
          <div className="max-w-2xl space-y-12">
            <div ref={setRef("profile")} data-section-id="profile">
              <ProfileSection />
            </div>
            <div ref={setRef("staleness")} data-section-id="staleness">
              <StalenessSection />
            </div>
            <div ref={setRef("surplus")} data-section-id="surplus">
              <SurplusSection />
            </div>
            <div ref={setRef("isa")} data-section-id="isa">
              <IsaSection />
            </div>
            <div ref={setRef("household")} data-section-id="household">
              <HouseholdSection />
            </div>
            <div ref={setRef("trust-accounts")} data-section-id="trust-accounts">
              <TrustAccountsSection />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify lint passes**

Run: `cd apps/frontend && bunx eslint src/pages/SettingsPage.tsx`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/pages/SettingsPage.tsx
git commit -m "feat(settings): trim to 6 sections and add scroll-spy sidebar highlighting"
```

---

### Task 4: Update SettingsPage test — clean up stale mocks

**Files:**

- Modify: `apps/frontend/src/pages/SettingsPage.test.tsx`

- [ ] **Step 1: Write the updated test file**

Replace the entire file content with:

```tsx
import { describe, it, expect, mock } from "bun:test";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";
import SettingsPage from "./SettingsPage";

mock.module("@/hooks/useSettings", () => ({
  useSettings: () => ({
    data: undefined,
    isLoading: false,
    isError: true,
    refetch: () => {},
  }),
  useUpdateSettings: () => ({ mutate: () => {}, isPending: false }),
  useUpdateProfile: () => ({ mutate: () => {}, isPending: false }),
  useHousehold: () => ({ data: undefined, isLoading: false }),
  useHouseholdMembers: () => ({ data: undefined, isLoading: false }),
  useInviteMember: () => ({ mutate: () => {}, isPending: false }),
  useRemoveMember: () => ({ mutate: () => {}, isPending: false }),
}));

mock.module("@/hooks/useWealth", () => ({
  useIsaAllowance: () => ({ data: undefined }),
  useWealthSummary: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
  }),
  useWealthAccounts: () => ({ data: undefined, isLoading: false }),
  useAccountHistory: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
  }),
  useUpdateValuation: () => ({ mutate: () => {}, isPending: false }),
  useConfirmAccount: () => ({ mutate: () => {}, isPending: false }),
  useUpdateAccount: () => ({ mutate: () => {}, isPending: false }),
}));

mock.module("@/hooks/useWaterfall", () => ({
  useWaterfallSummary: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
  }),
  useCashflow: () => ({ data: undefined, isLoading: false, isError: false }),
  useItemHistory: () => ({ data: undefined, isLoading: false, isError: false }),
  useConfirmItem: () => ({ mutate: () => {}, isPending: false }),
  useUpdateItem: () => ({ mutate: () => {}, isPending: false }),
  useEndIncome: () => ({ mutate: () => {}, isPending: false }),
  useCreateSetupSession: () => ({ mutate: () => {}, isPending: false }),
  useUpdateSetupSession: () => ({ mutate: () => {}, isPending: false }),
}));

describe("SettingsPage error state", () => {
  it("shows PanelError in content area when settings query fails", () => {
    renderWithProviders(<SettingsPage />);
    expect(screen.getByText("Failed to load")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd apps/frontend && bun test src/pages/SettingsPage.test.tsx`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/pages/SettingsPage.test.tsx
git commit -m "test(settings): clean up stale mocks for removed sections"
```

---

## Testing

### Frontend Tests

- [ ] SettingsPage error state test passes (existing test, updated mocks)
- [ ] ISA section renders only the annual limit input (manual verification)
- [ ] Sidebar has exactly 6 buttons (manual verification)

### Key Scenarios

- [ ] Happy path: settings page loads, sidebar shows 6 sections, scroll-spy highlights active section
- [ ] ISA: only annual limit field visible, Save sends only `isaAnnualLimit`
- [ ] Scroll-spy: scrolling through sections updates sidebar highlight to topmost visible section
- [ ] Error case: error state still renders correctly
- [ ] Loading: skeleton loader still renders correctly

## Verification

- [ ] `bun run build` passes clean
- [ ] `bun run lint` — zero warnings
- [ ] `bun run type-check` — no errors
- [ ] `cd apps/frontend && bun test src/pages/SettingsPage.test.tsx` passes
- [ ] Manual: open settings page, verify 6 sections, scroll through and verify sidebar highlight follows, verify ISA shows only annual limit input

## Post-conditions

- [ ] Settings page is simplified to only active features
- [ ] Scroll-spy provides navigation orientation on longer pages
- [ ] No backend changes needed — ISA month/day remain in DB schema
