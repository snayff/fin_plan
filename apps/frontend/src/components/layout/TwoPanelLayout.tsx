import type { ReactNode } from "react";

interface TwoPanelLayoutProps {
  left: ReactNode;
  right: ReactNode | null;
  rightPlaceholder?: string;
}

function PlaceholderMessage({ text }: { text: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3">
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
      <p className="text-[13px] text-muted-foreground max-w-[240px] text-center leading-relaxed">
        {text}
      </p>
    </div>
  );
}

export function TwoPanelLayout({
  left,
  right,
  rightPlaceholder = "Select any item to see its detail",
}: TwoPanelLayoutProps) {
  return (
    <div className="flex h-full overflow-hidden">
      <a
        href="#two-panel-main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:px-3 focus:py-1.5 focus:text-xs focus:bg-background focus:border focus:rounded focus:m-1"
      >
        Skip to detail panel
      </a>
      <aside
        aria-label="Waterfall overview"
        className="w-[360px] min-w-[360px] border-r overflow-hidden shrink-0 flex flex-col"
      >
        {left}
      </aside>
      <main id="two-panel-main" className="flex-1 overflow-y-auto p-6">
        {right ?? <PlaceholderMessage text={rightPlaceholder} />}
      </main>
    </div>
  );
}
