import { Prisma } from "@prisma/client";
import { prisma } from "../config/database.js";
import type { SearchResponse, SearchResult, SearchResultKind } from "@finplan/shared";

const PER_KIND_LIMIT = 5;

/** Column the destination page needs to select the panel that renders the row. */
type ScopeColumn = "subcategoryId" | "type";

type NamedRow = { id: string; name: string; scope?: string | null };

type KindConfig = {
  kind: SearchResultKind;
  subtitle: string;
  route: string;
  /** Table to search. Models have no @@map, so the model name is the table name. Never user input. */
  table: Prisma.ModelName;
  /** Selected alongside id/name and returned under the same name on the result. */
  scope?: ScopeColumn;
};

/** Escape LIKE metacharacters so the query matches literally (Postgres' default escape is `\`). */
function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Case-insensitive substring match, ranked in SQL: exact name, then prefix,
 * then contains, then alphabetical — and only then limited. Ranking before the
 * LIMIT guarantees the best matches are returned however many rows match.
 */
function findRanked(
  table: Prisma.ModelName,
  scope: ScopeColumn | undefined,
  householdId: string,
  q: string
): Promise<NamedRow[]> {
  const escaped = escapeLike(q);
  // `scope` is a fixed column name from KINDS (never user input), cast to text
  // so enum columns like Asset.type come back as plain strings.
  const scopeSelect = scope ? Prisma.raw(`, "${scope}"::text AS "scope"`) : Prisma.empty;
  return prisma.$queryRaw<NamedRow[]>`
    SELECT "id", "name"${scopeSelect}
    FROM ${Prisma.raw(`"${table}"`)}
    WHERE "householdId" = ${householdId}
      AND "name" ILIKE ${`%${escaped}%`}
    ORDER BY
      CASE
        WHEN lower("name") = lower(${q}) THEN 0
        WHEN "name" ILIKE ${`${escaped}%`} THEN 1
        ELSE 2
      END,
      "name",
      "id"
    LIMIT ${PER_KIND_LIMIT}
  `;
}

const KINDS: KindConfig[] = [
  {
    kind: "income_source",
    subtitle: "Income · Source",
    route: "/income",
    table: "IncomeSource",
    scope: "subcategoryId",
  },
  {
    kind: "committed_item",
    subtitle: "Committed · Item",
    route: "/committed",
    table: "CommittedItem",
    scope: "subcategoryId",
  },
  {
    kind: "discretionary_item",
    subtitle: "Discretionary · Item",
    route: "/discretionary",
    table: "DiscretionaryItem",
    scope: "subcategoryId",
  },
  {
    kind: "asset",
    subtitle: "Wealth · Asset",
    route: "/assets",
    table: "Asset",
    scope: "type",
  },
  {
    kind: "account",
    subtitle: "Wealth · Account",
    route: "/assets",
    table: "Account",
    scope: "type",
  },
  {
    kind: "gift_person",
    subtitle: "Gifts · Person",
    route: "/gifts",
    table: "GiftPerson",
  },
  {
    kind: "gift_event",
    subtitle: "Gifts · Event",
    route: "/gifts",
    table: "GiftEvent",
  },
];

export const searchService = {
  async search(householdId: string, rawQuery: string): Promise<SearchResponse> {
    const q = rawQuery.trim();
    if (q.length === 0) return { results: [] };

    const buckets = await Promise.all(
      KINDS.map(async (cfg) => {
        const rows = await findRanked(cfg.table, cfg.scope, householdId, q);
        return rows.map<SearchResult>((row) => ({
          kind: cfg.kind,
          id: row.id,
          name: row.name,
          subtitle: cfg.subtitle,
          route: cfg.route,
          focusId: row.id,
          ...(cfg.scope && row.scope ? { [cfg.scope]: row.scope } : {}),
        }));
      })
    );

    return { results: buckets.flat() };
  },
};
