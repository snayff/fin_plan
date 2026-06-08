/**
 * URL-backed selection state for master-detail pages.
 *
 * Single source of truth for "which detail row is selected" across
 * desktop + mobile. The URL is the authoritative state — there is no
 * accompanying Zustand slice or local mirror.
 *
 *   - Desktop writes use `replace: true` (no history pollution from list clicks).
 *   - Mobile writes use `replace: false` (browser/OS back button clears detail).
 *   - Invalid values clear silently via effect when `validate` is supplied.
 *
 * Feature-specific param names per Decision 5 — e.g. `?subcategory=`, `?type=`,
 * `?view=` — never a generic `?detail=`. Coexists with existing `?add=`,
 * `?focus=` params.
 *
 * See docs/4. planning/mobile-accessibility/plan.md § Decision 5 and § Phase 2.
 */

import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useIsMobile } from "./useIsMobile";

interface UseUrlSelectionOptions {
  /** URL search param name (e.g. "subcategory", "type", "view"). */
  param: string;
  /**
   * Optional validator. Return `true` if the current value is acceptable.
   * Invalid values are silently cleared (no error, no toast).
   *
   * Use cases:
   *   - id-in-list:   `(v) => loadedItems?.some(i => i.id === v) ?? false`
   *   - enum-member:  `(v) => ALL_TYPES.includes(v)`
   *   - resolver-ok:  `(v) => resolve(v, summary) != null`
   */
  validate?: (value: string) => boolean;
}

type Result = readonly [
  value: string | null,
  setValue: (next: string | null) => void,
  clear: () => void,
];

export function useUrlSelection({ param, validate }: UseUrlSelectionOptions): Result {
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const value = searchParams.get(param);

  const setValue = useCallback(
    (next: string | null) => {
      setSearchParams(
        (prev) => {
          const out = new URLSearchParams(prev);
          if (next === null || next === "") {
            out.delete(param);
          } else {
            out.set(param, next);
          }
          return out;
        },
        // Mobile: push so OS back clears the detail. Desktop: replace so list
        // clicks don't pollute history.
        { replace: !isMobile }
      );
    },
    [param, setSearchParams, isMobile]
  );

  const clear = useCallback(() => setValue(null), [setValue]);

  // Silently clear invalid values. Runs after render so that callers can
  // populate their list/enum first.
  useEffect(() => {
    if (value !== null && validate && !validate(value)) {
      clear();
    }
  }, [value, validate, clear]);

  return [value, setValue, clear] as const;
}
