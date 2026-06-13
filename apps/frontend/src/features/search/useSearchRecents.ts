import { useCallback, useEffect, useState } from "react";

export type RecentEntry = {
  kind: "nav" | "create" | "help" | "data";
  id: string;
  label: string;
  subtitle: string;
  route: string;
  addParam?: string;
  focusId?: string;
};

const CAP = 3;

/**
 * Storage key prefix for persisted recents (per user). Exported so session
 * cleanup can remove these entries when the user signs out.
 */
export const SEARCH_RECENTS_STORAGE_PREFIX = "finplan.search.recents.v1.";

const key = (userId: string) => `${SEARCH_RECENTS_STORAGE_PREFIX}${userId}`;

function read(userId: string): RecentEntry[] {
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentEntry[];
    return Array.isArray(parsed) ? parsed.slice(0, CAP) : [];
  } catch {
    return [];
  }
}

export function useSearchRecents(userId: string) {
  const [list, setList] = useState<RecentEntry[]>(() => read(userId));

  useEffect(() => {
    setList(read(userId));
  }, [userId]);

  const push = useCallback(
    (entry: RecentEntry) => {
      setList((prev) => {
        const filtered = prev.filter((e) => !(e.kind === entry.kind && e.id === entry.id));
        const next = [entry, ...filtered].slice(0, CAP);
        try {
          localStorage.setItem(key(userId), JSON.stringify(next));
        } catch {
          /* storage quota — ignore */
        }
        return next;
      });
    },
    [userId]
  );

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(key(userId));
    } catch {
      /* ignore */
    }
    setList([]);
  }, [userId]);

  return { list, push, clear };
}
