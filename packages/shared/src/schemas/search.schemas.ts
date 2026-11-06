import { z } from "zod";

export const SearchResultKindEnum = z.enum([
  "income_source",
  "committed_item",
  "discretionary_item",
  "asset",
  "account",
  "gift_person",
  "gift_event",
  // purchase_item returns once Goals is built — its page is a placeholder today.
]);

export type SearchResultKind = z.infer<typeof SearchResultKindEnum>;

export const SearchQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(100),
  })
  .strict();

export type SearchQuery = z.infer<typeof SearchQuerySchema>;

export const SearchResultSchema = z
  .object({
    kind: SearchResultKindEnum,
    id: z.string(),
    name: z.string(),
    subtitle: z.string(),
    route: z.string(),
    focusId: z.string(),
    /** Tier items: the subcategory the destination page must select to render the row. */
    subcategoryId: z.string().optional(),
    /** Assets/accounts: the type the destination page must select to render the row. */
    type: z.string().optional(),
  })
  .strict();

export type SearchResult = z.infer<typeof SearchResultSchema>;

export const SearchResponseSchema = z
  .object({
    results: z.array(SearchResultSchema),
  })
  .strict();

export type SearchResponse = z.infer<typeof SearchResponseSchema>;
