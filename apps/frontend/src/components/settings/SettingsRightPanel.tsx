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
  /** When provided (mobile master-detail), renders a back button in the header. */
  onMobileBack?: () => void;
}

const SCROLL_LOCK_MS = 400;

export const SettingsRightPanel = forwardRef<SettingsRightPanelHandle, SettingsRightPanelProps>(
  ({ title, activeId, onActiveChange, children, onMobileBack }, ref) => {
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
      <div className="flex flex-1 flex-col min-w-0 min-h-0">
        <div
          className={cn(
            "sticky top-0 z-[2] bg-background",
            "flex items-center justify-between px-4 py-3 border-b border-foreground/5"
          )}
        >
          <div className="flex items-center gap-2">
            {onMobileBack && (
              <button
                type="button"
                onClick={onMobileBack}
                aria-label="Back to settings sections"
                className="text-sm text-foreground/60 transition-colors hover:text-foreground"
              >
                ‹ Back
              </button>
            )}
            <h2 className="font-heading text-base font-bold text-foreground">{title}</h2>
          </div>
        </div>
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
          <div className="settings-right-body px-6 pt-6 pb-32 max-w-3xl space-y-12">{children}</div>
        </div>
      </div>
    );
  }
);
SettingsRightPanel.displayName = "SettingsRightPanel";
