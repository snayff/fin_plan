/**
 * A11y smoke pass for the mobile-accessibility work.
 *
 * Mounts each of the new primitives plus a representative authenticated-page
 * structure (PageHeader + TwoPanelLayout) and asserts no axe violations. Heavy
 * top-level pages (Overview, Tier pages, Assets) are out of scope here — they
 * require MSW fixtures + the full auth context and are better exercised by
 * the per-page test files that already exist.
 *
 * Manual TalkBack pass on Android remains in Phase 5 of the plan; this file
 * is the automated portion. iOS verification gap documented in the plan.
 */

import { afterEach, beforeEach, describe, mock, test } from "bun:test";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { renderWithProviders } from "./helpers/render";
import { expectNoA11yViolations } from "./a11y";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/common/PageHeader";
import { TwoPanelLayout } from "@/components/layout/TwoPanelLayout";
import { MobileUnsupportedNotice } from "@/components/common/MobileUnsupportedNotice";
import { Dialog, DialogTitle } from "@/components/ui/dialog";
import { ResponsiveDialogContent } from "@/components/ui/responsive-dialog";

// Stub the React Query-backed value animator so PageHeader's total renders without
// pulling in MSW + QueryClient. We're testing a11y attributes here, not the
// animation behaviour.
mock.module("@/hooks/useAnimatedValue", () => ({
  useAnimatedValue: (target: number) => target,
}));

type MqlListener = (e: MediaQueryListEvent) => void;
const originalMatchMedia = window.matchMedia;

function setViewport(mobile: boolean) {
  const listeners = new Set<MqlListener>();
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: mobile,
      media: query,
      onchange: null,
      addEventListener: (event: string, listener: MqlListener) => {
        if (event === "change") listeners.add(listener);
      },
      removeEventListener: (event: string, listener: MqlListener) => {
        if (event === "change") listeners.delete(listener);
      },
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

function withRouter(node: ReactNode) {
  return <MemoryRouter>{node}</MemoryRouter>;
}

describe("a11y smoke — mobile-accessibility primitives", () => {
  beforeEach(() => setViewport(false));
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  test("Button — all sizes and variants render without a11y violations", async () => {
    const { container } = render(
      <>
        <Button>Default</Button>
        <Button size="sm">Small</Button>
        <Button size="lg">Large</Button>
        <Button size="icon" aria-label="Settings">
          <span aria-hidden="true">⚙</span>
        </Button>
        <Button variant="destructive">Delete</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
      </>
    );
    await expectNoA11yViolations(container);
  });

  test("Input + Label — labelled input is a11y-clean", async () => {
    const { container } = render(
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" placeholder="you@example.com" />
      </div>
    );
    await expectNoA11yViolations(container);
  });

  test("PageHeader (no back button) — clean on desktop", async () => {
    setViewport(false);
    const { container } = renderWithProviders(<PageHeader title="Income" total={3500} />);
    await expectNoA11yViolations(container);
  });

  test("PageHeader (with onBack) — mobile back button has accessible name", async () => {
    setViewport(true);
    const { container } = renderWithProviders(<PageHeader title="Pension" onBack={() => {}} />);
    await expectNoA11yViolations(container);
  });

  test("TwoPanelLayout — desktop mode renders both panels cleanly", async () => {
    setViewport(false);
    const { container } = render(
      withRouter(
        <div className="h-[600px]">
          <TwoPanelLayout
            left={
              <div className="flex h-full flex-col">
                <PageHeader title="Income" />
                <div className="flex-1 overflow-y-auto" />
              </div>
            }
            right={<div className="p-4">Detail content</div>}
          />
        </div>
      )
    );
    await expectNoA11yViolations(container);
  });

  test("TwoPanelLayout — mobile push-nav (left only) is clean", async () => {
    setViewport(true);
    const { container } = render(
      withRouter(
        <div className="h-[600px]">
          <TwoPanelLayout
            selectedKey={null}
            left={
              <div className="flex h-full flex-col">
                <PageHeader title="Income" />
                <div className="flex-1 overflow-y-auto" />
              </div>
            }
            right={<div className="p-4">Detail</div>}
          />
        </div>
      )
    );
    await expectNoA11yViolations(container);
  });

  test("MobileUnsupportedNotice — soft-block screen is accessible", async () => {
    const { container } = render(withRouter(<MobileUnsupportedNotice pageName="Goals" />));
    await expectNoA11yViolations(container);
  });

  test("ResponsiveDialog — sheet variant on mobile is a11y-clean", async () => {
    setViewport(true);
    const { container } = render(
      <Dialog open>
        <ResponsiveDialogContent variant="sheet">
          <DialogTitle>Edit asset</DialogTitle>
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" />
          </div>
        </ResponsiveDialogContent>
      </Dialog>
    );
    await expectNoA11yViolations(container);
  });

  test("ResponsiveDialog — fullscreen variant on mobile is a11y-clean", async () => {
    setViewport(true);
    const { container } = render(
      <Dialog open>
        <ResponsiveDialogContent variant="fullscreen">
          <DialogTitle>Search</DialogTitle>
          <div>
            <Label htmlFor="q">Query</Label>
            <Input id="q" type="search" />
          </div>
        </ResponsiveDialogContent>
      </Dialog>
    );
    await expectNoA11yViolations(container);
  });
});
