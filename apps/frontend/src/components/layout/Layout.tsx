import { type ReactNode, useState, useCallback } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Menu } from "lucide-react";
import { Toaster } from "@/components/common/Toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/authStore";
import { HouseholdSwitcher } from "./HouseholdSwitcher";
import { ProfileAvatar } from "./ProfileAvatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useStaleDataBanner } from "@/hooks/useStaleDataBanner";
import { StaleDataBanner } from "@/components/common/StaleDataBanner";
import { cn } from "@/lib/utils";
import { GlossaryPopoverProvider } from "@/components/help/GlossaryPopoverContext";
import { SearchTriggerIcon } from "@/features/search/SearchTriggerIcon";
import { SearchPalette } from "@/features/search/SearchPalette";
import { useSearchHotkey } from "@/features/search/useSearchHotkey";
import { useIsMobile } from "@/hooks/useIsMobile";

/**
 * Nav item config. `desktopOnly: true` marks routes that soft-block on mobile
 * (FullWaterfall, Goals, Gifts, Help, Household Settings — see Decision 1).
 * On mobile, the hamburger nav renders these with a "(desktop only)" badge;
 * tapping still navigates and shows the soft-block notice (Item 2 amendment).
 */
type NavItem = {
  to: string;
  label: string;
  colorClass: string;
  desktopOnly?: boolean;
};

const NAV_ITEMS_GROUP1: readonly NavItem[] = [
  { to: "/overview", label: "Overview", colorClass: "text-page-accent" },
];

const NAV_ITEMS_GROUP2: readonly NavItem[] = [
  { to: "/income", label: "Income", colorClass: "text-tier-income" },
  { to: "/committed", label: "Committed", colorClass: "text-tier-committed" },
  { to: "/discretionary", label: "Discretionary", colorClass: "text-tier-discretionary" },
  { to: "/surplus", label: "Surplus", colorClass: "text-tier-surplus" },
];

const NAV_ITEMS_GROUP3: readonly NavItem[] = [
  { to: "/forecast", label: "Forecast", colorClass: "text-foreground" },
  { to: "/assets", label: "Assets", colorClass: "text-foreground" },
  { to: "/goals", label: "Goals", colorClass: "text-foreground", desktopOnly: true },
  { to: "/gifts", label: "Gifts", colorClass: "text-foreground", desktopOnly: true },
  { to: "/help", label: "Help", colorClass: "text-foreground", desktopOnly: true },
];

/**
 * Nav link styling. Inactive links use a neutral muted foreground
 * (`text-text-secondary`) which clears WCAG AA on the nav background; the
 * saturated tier/accent colour is reserved for the active link (paired with an
 * underline). Previously inactive links dimmed the tier colour with
 * `opacity-70`, dropping the composite below AA — see issue #71.
 */
function desktopNavLinkClass(isActive: boolean, colorClass: string): string {
  return cn(
    "relative pb-0.5 text-sm font-medium transition-colors duration-150",
    isActive
      ? cn(
          colorClass,
          "after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-full after:bg-current"
        )
      : "text-text-secondary hover:text-foreground"
  );
}

function mobileNavLinkClass(isActive: boolean, colorClass: string): string {
  return cn(
    "px-3 py-2 rounded text-sm font-medium transition-colors flex items-center",
    isActive
      ? cn(colorClass, "bg-accent/10")
      : "text-text-secondary hover:text-foreground hover:bg-accent/5"
  );
}

function DesktopOnlyBadge() {
  return (
    <span
      aria-label="Desktop only"
      className="ml-1.5 rounded-sm bg-foreground/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-foreground/55"
    >
      desktop only
    </span>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const logout = useAuthStore((s) => s.logout);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const navigate = useNavigate();
  const [navOpen, setNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  useSearchHotkey(() => setSearchOpen(true));
  const isMobile = useIsMobile();

  const handleSignOut = useCallback(async () => {
    await logout();
    navigate("/login");
  }, [logout, navigate]);

  const { showBanner, lastSyncedAt } = useStaleDataBanner();
  const qc = useQueryClient();

  const handleBannerRetry = useCallback(() => {
    qc.getQueryCache()
      .getAll()
      .forEach((query) => {
        if (query.state.status === "error") {
          void qc.refetchQueries({ queryKey: query.queryKey });
        }
      });
  }, [qc]);

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-card focus:text-foreground focus:rounded-md focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      {/* Top bar */}
      <header className="h-12 shrink-0 border-b flex items-center px-4 gap-4">
        {/* Left: wordmark + switcher */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Mobile hamburger */}
          <Sheet open={navOpen} onOpenChange={setNavOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring lg:hidden"
                aria-label="Open navigation"
                aria-expanded={navOpen}
              >
                <Menu className="h-5 w-5" aria-hidden="true" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <nav className="flex flex-col gap-1 p-4 pt-8">
                {[...NAV_ITEMS_GROUP1, ...NAV_ITEMS_GROUP2, ...NAV_ITEMS_GROUP3].map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setNavOpen(false)}
                    className={({ isActive }) => mobileNavLinkClass(isActive, item.colorClass)}
                  >
                    {item.label}
                    {isMobile && item.desktopOnly && <DesktopOnlyBadge />}
                  </NavLink>
                ))}
                <div className="border-t mt-4 pt-4 space-y-2">
                  <button
                    onClick={() => {
                      setNavOpen(false);
                      void handleSignOut();
                    }}
                    className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full text-left"
                    type="button"
                  >
                    Sign out
                  </button>
                </div>
              </nav>
            </SheetContent>
          </Sheet>
          <NavLink
            to="/overview"
            aria-label="finplan home"
            className="font-heading text-lg font-bold tracking-tight text-foreground hover:opacity-80 transition-opacity"
          >
            finplan
          </NavLink>
        </div>

        {/* Centre: nav (desktop) — visible at lg:1024px+ to match the layout
            breakpoint. Tablets in portrait use the hamburger nav. */}
        <nav className="hidden flex-1 items-center gap-3 lg:flex">
          {NAV_ITEMS_GROUP1.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => desktopNavLinkClass(isActive, item.colorClass)}
            >
              {item.label}
            </NavLink>
          ))}
          <div
            role="separator"
            aria-orientation="vertical"
            className="h-4 w-px bg-foreground/[0.12] mx-1"
          />
          {NAV_ITEMS_GROUP2.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => desktopNavLinkClass(isActive, item.colorClass)}
            >
              {item.label}
            </NavLink>
          ))}
          <div
            role="separator"
            aria-orientation="vertical"
            className="h-4 w-px bg-foreground/[0.12] mx-1"
          />
          {NAV_ITEMS_GROUP3.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => desktopNavLinkClass(isActive, item.colorClass)}
            >
              {item.label}
            </NavLink>
          ))}
          <div className="flex items-center gap-3 ml-auto">
            <SearchTriggerIcon onOpen={() => setSearchOpen(true)} />
            <HouseholdSwitcher />
            <ProfileAvatar />
          </div>
        </nav>
      </header>

      {showBanner && <StaleDataBanner lastSyncedAt={lastSyncedAt} onRetry={handleBannerRetry} />}

      {/* Page content */}
      <main id="main-content" className="flex-1 min-h-0 overflow-hidden">
        <GlossaryPopoverProvider>{children}</GlossaryPopoverProvider>
      </main>

      <Toaster />
      {userId && <SearchPalette open={searchOpen} onOpenChange={setSearchOpen} userId={userId} />}
    </div>
  );
}
