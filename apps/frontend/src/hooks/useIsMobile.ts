/**
 * Returns `true` when the viewport is below the desktop layout breakpoint (`lg: 1024px`).
 *
 * Use sparingly — prefer responsive Tailwind classes (`md:`, `lg:`) where CSS can
 * express the rule. Reach for this hook when behaviour must branch in JS:
 *   - URL hook write strategy (replace vs push)
 *   - ResponsiveDialog variant pick (Sheet vs Dialog)
 *   - Conditionally-hidden interactions (reorder controls, snapshot timeline)
 *
 * Implementation: `window.matchMedia('(max-width: 1023px)')` via `useSyncExternalStore`
 * for safe SSR rendering (returns `false` on the server). See
 * docs/4. planning/mobile-accessibility/plan.md § Phase 1.
 */

import { useSyncExternalStore } from "react";

const MOBILE_QUERY = "(max-width: 1023px)";

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(MOBILE_QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
