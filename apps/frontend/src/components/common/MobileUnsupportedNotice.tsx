/**
 * Soft-block notice rendered on mobile in place of pages that are
 * desktop-only by scope (FullWaterfall, Goals, Gifts, Help, Household Settings,
 * snapshot routes — see docs/4. planning/mobile-accessibility/plan.md § Scope).
 *
 * Used at the top of a page component:
 *
 *   ```tsx
 *   const isMobile = useIsMobile();
 *   if (isMobile) return <MobileUnsupportedNotice pageName="Gifts" />;
 *   return <ActualPage />;
 *   ```
 *
 * URL stays as-is; the user can navigate back via the in-app back button or
 * native browser back. The page reappears as soon as the viewport widens to
 * `lg: 1024px`.
 */

import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ChevronLeftIcon, MonitorIcon } from "lucide-react";

interface MobileUnsupportedNoticeProps {
  /** Display name of the page being soft-blocked (e.g. "Gifts", "Household Settings"). */
  pageName: string;
  /** Override the default body message — keep it brief. */
  message?: string;
}

export function MobileUnsupportedNotice({ pageName, message }: MobileUnsupportedNoticeProps) {
  const navigate = useNavigate();
  return (
    <div
      data-testid="mobile-unsupported-notice"
      data-page-name={pageName}
      className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center"
    >
      <div className="rounded-full bg-foreground/5 p-5">
        <MonitorIcon className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="space-y-2">
        <h1 className="font-heading text-lg font-bold text-foreground">{pageName}</h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          {message ??
            `${pageName} is best used on a larger screen. Open finplan on desktop to continue.`}
        </p>
      </div>
      <Button variant="outline" onClick={() => navigate(-1)}>
        <ChevronLeftIcon className="h-4 w-4" aria-hidden="true" />
        Back
      </Button>
    </div>
  );
}
