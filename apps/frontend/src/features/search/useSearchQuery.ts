import { useMemo, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchService } from "../../services/search.service";
import type { SearchResult } from "@finplan/shared";
import { ALL_ACTIONS, type PaletteAction } from "./actions";
import { matchHelp, type HelpMatch } from "./helpMatch";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export type SearchGroups = {
  data: SearchResult[];
  help: HelpMatch[];
  actions: PaletteAction[];
};

export function useSearchQuery(query: string) {
  const q = query.trim();
  const debounced = useDebounced(q, 150);

  const dataQuery = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => searchService.search(debounced),
    enabled: debounced.length > 0,
    staleTime: 15_000,
  });

  const groups = useMemo<SearchGroups>(() => {
    if (debounced.length === 0) {
      return { data: [], help: [], actions: [] };
    }
    const lc = debounced.toLowerCase();
    return {
      data: dataQuery.data?.results ?? [],
      help: matchHelp(debounced),
      actions: ALL_ACTIONS.filter((a) => a.label.toLowerCase().includes(lc)).slice(0, 5),
    };
  }, [debounced, dataQuery.data]);

  return {
    groups,
    /** True while typing is debouncing or the data request is in flight. */
    isPending: q !== debounced || (debounced.length > 0 && dataQuery.isFetching),
    error: dataQuery.error,
    retry: () => void dataQuery.refetch(),
  };
}
