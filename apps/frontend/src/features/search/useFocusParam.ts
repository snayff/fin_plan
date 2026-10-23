import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

const RETRY_MS = 100;
const DEFAULT_MAX_WAIT_MS = 10_000;
const PULSE_MS = 1200;
// Record ids are cuids; anything else can't match a row (and could break the selector).
const VALID_ID = /^[\w-]+$/;

/** Scroll the row marked `data-search-focus={id}` into view and pulse it. */
function focusTarget(id: string): boolean {
  const el = document.querySelector(`[data-search-focus="${id}"]`);
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("search-focus-pulse");
  setTimeout(() => el.classList.remove("search-focus-pulse"), PULSE_MS);
  return true;
}

type Options = {
  /** False while the page's data is still loading — nothing happens until it flips. */
  ready: boolean;
  /** How long to keep looking for the row after `ready` before giving up. */
  maxWaitMs?: number;
};

/**
 * Handles `?focus=<id>` deep links from search: once the page is `ready`,
 * waits for the `[data-search-focus=<id>]` row to render (child panels may
 * still be fetching or animating in), highlights it, then strips the param
 * with `replace` so browser-back doesn't re-trigger the scroll. If the row
 * never appears within `maxWaitMs` the param is stripped anyway.
 */
export function useFocusParam({ ready, maxWaitMs = DEFAULT_MAX_WAIT_MS }: Options) {
  const [params, setParams] = useSearchParams();
  const focus = params.get("focus");

  useEffect(() => {
    if (!focus || !ready) return;

    const strip = () =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("focus");
          return next;
        },
        { replace: true }
      );

    if (!VALID_ID.test(focus)) {
      strip();
      return;
    }

    const deadline = Date.now() + maxWaitMs;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = () => {
      if (focusTarget(focus) || Date.now() >= deadline) {
        strip();
        return;
      }
      timer = setTimeout(attempt, RETRY_MS);
    };
    attempt();
    return () => clearTimeout(timer);
  }, [focus, ready, maxWaitMs, setParams]);
}
