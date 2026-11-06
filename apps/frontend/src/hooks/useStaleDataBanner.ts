import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

export function useStaleDataBanner() {
  const qc = useQueryClient();
  const cache = qc.getQueryCache();
  const [erroredAt, setErroredAt] = useState<Date | null>(null);

  useEffect(() => {
    const unsub = cache.subscribe((event) => {
      if (event.type === "updated" && event.query.state.status === "error") {
        setErroredAt(new Date());
      }
      if (event.type === "updated" && event.query.state.status === "success") {
        setErroredAt(null);
      }
    });
    return unsub;
  }, [cache]);

  return { showBanner: erroredAt !== null, erroredAt };
}
