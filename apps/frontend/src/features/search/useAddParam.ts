import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Handles `?add=<kind>` deep links from search "create" actions. Returns the
 * value captured on arrival and strips the param (with `replace`, so refresh
 * and browser-back don't re-open the form).
 *
 * Callers must use the returned value, not re-read the URL: the add form often
 * mounts only after the page's data loads, by which time the param is gone.
 */
export function useAddParam(): string | null {
  const [params, setParams] = useSearchParams();
  const [intent] = useState(() => params.get("add"));
  useEffect(() => {
    if (!intent) return;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("add");
        return next;
      },
      { replace: true }
    );
  }, [intent, setParams]);
  return intent;
}
