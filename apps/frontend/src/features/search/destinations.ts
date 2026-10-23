import type { SearchResult, SearchResultKind } from "@finplan/shared";

export type Destination = { route: string; params: Record<string, string> };

type DestinationFor = (r: SearchResult) => Destination;

/** Tier pages render one subcategory at a time: select it, then focus the row. */
const tierPage =
  (route: string): DestinationFor =>
  (r) => ({
    route,
    params: { focus: r.focusId, ...(r.subcategoryId ? { subcategory: r.subcategoryId } : {}) },
  });

/** The assets page renders one asset/account type at a time: select it, then focus the row. */
const assetsPage: DestinationFor = (r) => ({
  route: "/assets",
  params: { focus: r.focusId, ...(r.type ? { type: r.type } : {}) },
});

/**
 * Where each search result kind lands, and the params its page consumes.
 * The single source of truth for result destinations: the palette (and
 * recents) navigate with it, and destinations.test.tsx renders every kind's
 * page from it — a new kind fails that test until its page handles the link.
 */
export const RESULT_DESTINATIONS: Record<SearchResultKind, DestinationFor> = {
  income_source: tierPage("/income"),
  committed_item: tierPage("/committed"),
  discretionary_item: tierPage("/discretionary"),
  asset: assetsPage,
  account: assetsPage,
  // GiftsPage opens the person's detail view.
  gift_person: (r) => ({ route: "/gifts", params: { person: r.focusId } }),
  // GiftsPage opens Config → Events, which focuses the event row.
  gift_event: (r) => ({ route: "/gifts", params: { view: "events", focus: r.focusId } }),
};

export function destinationFor(r: SearchResult): Destination {
  return RESULT_DESTINATIONS[r.kind](r);
}
