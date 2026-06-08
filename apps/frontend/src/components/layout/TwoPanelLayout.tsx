import type { ReactNode } from "react";
import { useIsMobile } from "@/hooks/useIsMobile";

interface TwoPanelLayoutProps {
  left: ReactNode;
  right: ReactNode | null;
  rightPlaceholder?: string;
  /**
   * Mobile master-detail bridge. When `useIsMobile()` is true:
   *   - `selectedKey == null` (or omitted) → only the left aside renders full-width
   *   - `selectedKey != null`              → only the right main renders full-width
   * Desktop ignores this prop and always renders both panels side-by-side.
   *
   * Pages drive this from their URL-selection state (see useUrlSelection).
   * See docs/4. planning/mobile-accessibility/plan.md § Phase 2.
   */
  selectedKey?: string | null;
}

function PlaceholderMessage({ text }: { text: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        stroke="hsl(var(--muted-foreground))"
        strokeWidth="1.5"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <rect x="3" y="3" width="14" height="14" rx="2" />
        <path d="M3 8h14" />
        <path d="M8 8v9" />
      </svg>
      <p className="max-w-[240px] text-center text-[13px] leading-relaxed text-muted-foreground">
        {text}
      </p>
    </div>
  );
}

export function TwoPanelLayout({
  left,
  right,
  rightPlaceholder = "Select any item to see its detail",
  selectedKey,
}: TwoPanelLayoutProps) {
  const isMobile = useIsMobile();
  const detailActive = selectedKey != null;

  // Mobile push-nav rendering: show one panel at a time.
  if (isMobile) {
    if (detailActive) {
      return (
        <div className="flex h-full overflow-hidden">
          <main id="two-panel-main" className="w-full flex-1 overflow-y-auto p-4">
            {right ?? <PlaceholderMessage text={rightPlaceholder} />}
          </main>
        </div>
      );
    }
    return (
      <div className="flex h-full overflow-hidden">
        <aside aria-label="Waterfall overview" className="flex w-full flex-col overflow-hidden">
          {left}
        </aside>
      </div>
    );
  }

  // Desktop: existing two-panel layout, unchanged.
  return (
    <div className="flex h-full overflow-hidden">
      <a
        href="#two-panel-main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-1 focus:rounded focus:border focus:bg-background focus:px-3 focus:py-1.5 focus:text-xs"
      >
        Skip to detail panel
      </a>
      <aside
        aria-label="Waterfall overview"
        className="flex w-[360px] min-w-[360px] shrink-0 flex-col overflow-hidden border-r"
      >
        {left}
      </aside>
      <main id="two-panel-main" className="flex-1 overflow-y-auto p-6">
        {right ?? <PlaceholderMessage text={rightPlaceholder} />}
      </main>
    </div>
  );
}
