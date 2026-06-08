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

const NAV_ITEMS_GROUP1 = [
  { to: "/overview", label: "Overview", colorClass: "text-page-accent" },
] as const;

const NAV_ITEMS_GROUP2 = [
  { to: "/income", label: "Income", colorClass: "text-tier-income" },
  { to: "/committed", label: "Committed", colorClass: "text-tier-committed" },
  { to: "/discretionary", label: "Discretionary", colorClass: "text-tier-discretionary" },
  { to: "/surplus", label: "Surplus", colorClass: "text-tier-surplus" },
] as const;

const NAV_ITEMS_GROUP3 = [
  { to: "/forecast", label: "Forecast", colorClass: "text-foreground" },
  { to: "/assets", label: "Assets", colorClass: "text-foreground" },
  { to: "/goals", label: "Goals", colorClass: "text-foreground" },
  { to: "/gifts", label: "Gifts", colorClass: "text-foreground" },
  { to: "/help", label: "Help", colorClass: "text-foreground" },
] as const;

export default function Layout({ children }: { children: ReactNode }) {
  const logout = useAuthStore((s) => s.logout);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const navigate = useNavigate();
  const [navOpen, setNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  useSearchHotkey(() => setSearchOpen(true));

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
    <div className="flex flex-col h-screen bg-background text-foreground">
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
                className="md:hidden p-1 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Open navigation"
              >
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <nav className="flex flex-col gap-1 p-4 pt-8">
                {[...NAV_ITEMS_GROUP1, ...NAV_ITEMS_GROUP2, ...NAV_ITEMS_GROUP3].map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setNavOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "px-3 py-2 rounded text-sm font-medium transition-colors",
                        item.colorClass,
                        isActive
                          ? "opacity-100 bg-accent/10"
                          : "opacity-70 hover:opacity-90 hover:bg-accent/5"
                      )
                    }
                  >
                    {item.label}
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
          <span className="font-heading font-bold text-lg tracking-tight text-foreground">
            finplan
          </span>
        </div>

        {/* Centre: nav (desktop) */}
        <nav className="hidden md:flex items-center gap-3 flex-1">
          {NAV_ITEMS_GROUP1.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "relative pb-0.5 text-sm font-medium transition-colors duration-150",
                  item.colorClass,
                  isActive
                    ? "opacity-100 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-full after:bg-current"
                    : "opacity-70 hover:opacity-90"
                )
              }
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
              className={({ isActive }) =>
                cn(
                  "relative pb-0.5 text-sm font-medium transition-colors duration-150",
                  item.colorClass,
                  isActive
                    ? "opacity-100 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-full after:bg-current"
                    : "opacity-70 hover:opacity-90"
                )
              }
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
              className={({ isActive }) =>
                cn(
                  "relative pb-0.5 text-sm font-medium transition-colors duration-150",
                  item.colorClass,
                  isActive
                    ? "opacity-100 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-full after:bg-current"
                    : "opacity-70 hover:opacity-90"
                )
              }
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
