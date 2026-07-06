---
feature: universal-search
category: ui
spec: docs/4. planning/universal-search/universal-search-spec.md
creation_date: 2026-04-19
status: implemented
implemented_date: 2026-07-05
---

# Universal Search — Implementation Plan

> **For Claude:** Use `/execute-plan universal-search` to implement this plan task-by-task.

> **Purpose:** Ordered TDD build guide with complete code per task.

**Goal:** Ship a keyboard-first command palette that finds any household data item, help entry, or action and jumps to it — Ctrl+K / trigger icon, Data→Help→Actions result categories, with deep-link focus highlighting and auto-open add modals.

**Spec:** `docs/4. planning/universal-search/universal-search-spec.md`

**Architecture:** One new Fastify `GET /search` route backed by a `SearchService` that queries the 8 household-scoped entities in parallel via Prisma and returns a unified result list. Frontend introduces a global `SearchPaletteProvider` mounted in `Layout.tsx`, a `Ctrl+K` hotkey, a trigger icon in the top header, and a `SearchPalette` built on `cmdk` + Radix `Dialog`. Two shared hooks (`useFocusParam`, `useAddParam`) wire the `?focus=<id>` / `?add=<kind>` conventions into each list page with minimal per-page code.

**Tech Stack:** Fastify · Prisma · Zod · React 18 · TanStack Query · Tailwind · cmdk · Radix Dialog

**Infrastructure Impact:**

- Touches `packages/shared/`: **yes** (new `search.schemas.ts`)
- Requires DB migration: **no** (reads existing entities only)

## Pre-conditions

- [ ] Spec `docs/4. planning/universal-search/universal-search-spec.md` exists and is approved.
- [ ] Prisma models exist: `IncomeSource`, `CommittedItem`, `DiscretionaryItem`, `Asset`, `Account`, `GiftPerson`, `GiftEvent`, `PurchaseItem` — confirmed in `apps/backend/prisma/schema.prisma`.
- [ ] `authMiddleware` at `apps/backend/src/middleware/auth.middleware.ts` attaches `req.householdId`.
- [ ] `cmdk@^1.0.4` and `@radix-ui/react-dialog@^1.1.15` are installed in `apps/frontend/package.json`.
- [ ] `apps/frontend/src/components/ui/dialog.tsx` wrapper exists.
- [ ] `HelpSidebar.tsx` exists with its `useDebounce` + filter logic (to be reused).
- [ ] `Layout.tsx` header with `NAV_ITEMS_GROUP1/2/3` and `HouseholdSwitcher` exists.
- [ ] 8 list pages exist: `IncomePage`, `CommittedPage`, `DiscretionaryPage`, `AssetsPage`, `GiftsPage`, `GoalsPage`.

## Assumptions flagged for review

- **Nav actions (12):** Overview, Income, Committed, Discretionary, Surplus, Forecast, Assets, Goals, Gifts, Help, Profile Settings, Household Settings. Derived from existing `App.tsx` routes; adjust if the user wants a different selection.
- **Create actions (8):** Add income, Add committed item, Add discretionary item, Add asset, Add account, Add gift person, Add gift event, Add purchase item.
- **Add-param extension:** Spec says `?add=1`; where a page hosts multiple entity types (Assets hosts Asset + Account; Gifts hosts Person + Event), we use `?add=<kind>` (e.g. `?add=account`, `?add=event`). Single-entity pages still accept `?add=1` for the spec's canonical form.
- **Recents localStorage key:** `finplan.search.recents.v1.<userId>`.

---

## Tasks

### Task 1: Shared Zod search schemas

**Files:**

- Create: `packages/shared/src/schemas/search.schemas.ts`
- Modify: `packages/shared/src/schemas/index.ts`
- Test: `packages/shared/src/schemas/__tests__/search.schemas.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/shared/src/schemas/__tests__/search.schemas.test.ts
import { describe, it, expect } from "bun:test";
import {
  SearchQuerySchema,
  SearchResultSchema,
  SearchResponseSchema,
  SearchResultKindEnum,
} from "../search.schemas";

describe("SearchQuerySchema", () => {
  it("trims and accepts a non-empty query", () => {
    const r = SearchQuerySchema.safeParse({ q: "  mortgage  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.q).toBe("mortgage");
  });

  it("rejects an empty query after trim", () => {
    expect(SearchQuerySchema.safeParse({ q: "   " }).success).toBe(false);
  });

  it("rejects a query longer than 100 chars", () => {
    expect(SearchQuerySchema.safeParse({ q: "a".repeat(101) }).success).toBe(false);
  });
});

describe("SearchResultSchema", () => {
  it("accepts a valid data result", () => {
    const r = SearchResultSchema.safeParse({
      kind: "income_source",
      id: "clx1",
      name: "Salary",
      subtitle: "Income · Monthly",
      route: "/income",
      focusId: "clx1",
    });
    expect(r.success).toBe(true);
  });

  it("rejects unknown kind", () => {
    expect(
      SearchResultSchema.safeParse({
        kind: "not_a_kind",
        id: "x",
        name: "x",
        subtitle: "x",
        route: "/",
        focusId: "x",
      }).success
    ).toBe(false);
  });

  it("rejects extra fields (strict)", () => {
    expect(
      SearchResultSchema.safeParse({
        kind: "income_source",
        id: "x",
        name: "x",
        subtitle: "x",
        route: "/",
        focusId: "x",
        amount: 999,
      }).success
    ).toBe(false);
  });
});

describe("SearchResponseSchema", () => {
  it("accepts a results array", () => {
    const r = SearchResponseSchema.safeParse({ results: [] });
    expect(r.success).toBe(true);
  });
});

describe("SearchResultKindEnum", () => {
  it("lists exactly 8 entity kinds", () => {
    expect(SearchResultKindEnum.options).toEqual([
      "income_source",
      "committed_item",
      "discretionary_item",
      "asset",
      "account",
      "gift_person",
      "gift_event",
      "purchase_item",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts search.schemas`
Expected: FAIL — "Cannot find module '../search.schemas'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/shared/src/schemas/search.schemas.ts
import { z } from "zod";

export const SearchResultKindEnum = z.enum([
  "income_source",
  "committed_item",
  "discretionary_item",
  "asset",
  "account",
  "gift_person",
  "gift_event",
  "purchase_item",
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
  })
  .strict();

export type SearchResult = z.infer<typeof SearchResultSchema>;

export const SearchResponseSchema = z
  .object({
    results: z.array(SearchResultSchema),
  })
  .strict();

export type SearchResponse = z.infer<typeof SearchResponseSchema>;
```

Add to `packages/shared/src/schemas/index.ts`:

```typescript
export * from "./search.schemas";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts search.schemas`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas/search.schemas.ts packages/shared/src/schemas/__tests__/search.schemas.test.ts packages/shared/src/schemas/index.ts
git commit -m "feat(shared): add Zod schemas for universal search"
```

---

### Task 2: Backend SearchService — data query + ranking

**Files:**

- Create: `apps/backend/src/services/search.service.ts`
- Test: `apps/backend/src/services/__tests__/search.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/services/__tests__/search.service.test.ts
import { describe, it, expect, beforeEach, mock } from "bun:test";
import { prismaMock, resetPrismaMocks } from "../../test/mocks/prisma";

mock.module("../../config/database.js", () => ({ prisma: prismaMock }));

const { searchService } = await import("../search.service.js");

beforeEach(() => {
  resetPrismaMocks();
  // Default all 8 findMany calls to return an empty array
  prismaMock.incomeSource.findMany.mockResolvedValue([]);
  prismaMock.committedItem.findMany.mockResolvedValue([]);
  prismaMock.discretionaryItem.findMany.mockResolvedValue([]);
  prismaMock.asset.findMany.mockResolvedValue([]);
  prismaMock.account.findMany.mockResolvedValue([]);
  prismaMock.giftPerson.findMany.mockResolvedValue([]);
  prismaMock.giftEvent.findMany.mockResolvedValue([]);
  prismaMock.purchaseItem.findMany.mockResolvedValue([]);
});

describe("searchService.search", () => {
  it("passes householdId and case-insensitive contains filter to Prisma", async () => {
    prismaMock.incomeSource.findMany.mockResolvedValue([
      { id: "i1", name: "Mortgage Offset Salary" },
    ] as any);

    const res = await searchService.search("hh-1", "mortgage");

    expect(prismaMock.incomeSource.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          householdId: "hh-1",
          name: { contains: "mortgage", mode: "insensitive" },
        },
      })
    );
    expect(res.results).toHaveLength(1);
    expect(res.results[0]!.kind).toBe("income_source");
    expect(res.results[0]!.name).toBe("Mortgage Offset Salary");
  });

  it("ranks exact name > starts-with > contains within a kind", async () => {
    prismaMock.committedItem.findMany.mockResolvedValue([
      { id: "c1", name: "Monthly Food Budget" },
      { id: "c2", name: "Food" },
      { id: "c3", name: "Food Delivery Subscription" },
    ] as any);

    const res = await searchService.search("hh-1", "food");

    const names = res.results.filter((r) => r.kind === "committed_item").map((r) => r.name);
    expect(names[0]).toBe("Food");
    expect(names[1]).toBe("Food Delivery Subscription");
    expect(names[2]).toBe("Monthly Food Budget");
  });

  it("caps results per entity kind at 5", async () => {
    const seven = Array.from({ length: 7 }, (_, i) => ({
      id: `i${i}`,
      name: `Source ${i}`,
    }));
    prismaMock.incomeSource.findMany.mockResolvedValue(seven as any);

    const res = await searchService.search("hh-1", "source");
    const income = res.results.filter((r) => r.kind === "income_source");
    expect(income).toHaveLength(5);
  });

  it("returns an empty array when nothing matches", async () => {
    const res = await searchService.search("hh-1", "zzz-no-match");
    expect(res.results).toEqual([]);
  });

  it("returns an empty array for a whitespace-only query without hitting Prisma", async () => {
    const res = await searchService.search("hh-1", "   ");
    expect(res.results).toEqual([]);
    expect(prismaMock.incomeSource.findMany).not.toHaveBeenCalled();
  });

  it("produces the design-system subtitle and route for each kind", async () => {
    prismaMock.asset.findMany.mockResolvedValue([{ id: "a1", name: "Flat" }] as any);
    const res = await searchService.search("hh-1", "flat");
    const asset = res.results.find((r) => r.kind === "asset");
    expect(asset?.subtitle).toBe("Wealth · Asset");
    expect(asset?.route).toBe("/assets");
    expect(asset?.focusId).toBe("a1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts search.service`
Expected: FAIL — "Cannot find module '../search.service.js'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/services/search.service.ts
import { prisma } from "../config/database.js";
import type { SearchResponse, SearchResult, SearchResultKind } from "@finplan/shared";

const PER_KIND_LIMIT = 5;

type NamedRow = { id: string; name: string };

type KindConfig = {
  kind: SearchResultKind;
  subtitle: string;
  route: string;
  fetch: (householdId: string, q: string) => Promise<NamedRow[]>;
};

function like(householdId: string, q: string) {
  return {
    where: {
      householdId,
      name: { contains: q, mode: "insensitive" as const },
    },
    select: { id: true, name: true },
    take: PER_KIND_LIMIT * 4, // over-fetch to allow ranking before capping
  };
}

const KINDS: KindConfig[] = [
  {
    kind: "income_source",
    subtitle: "Income · Source",
    route: "/income",
    fetch: (h, q) => prisma.incomeSource.findMany(like(h, q)),
  },
  {
    kind: "committed_item",
    subtitle: "Committed · Item",
    route: "/committed",
    fetch: (h, q) => prisma.committedItem.findMany(like(h, q)),
  },
  {
    kind: "discretionary_item",
    subtitle: "Discretionary · Item",
    route: "/discretionary",
    fetch: (h, q) => prisma.discretionaryItem.findMany(like(h, q)),
  },
  {
    kind: "asset",
    subtitle: "Wealth · Asset",
    route: "/assets",
    fetch: (h, q) => prisma.asset.findMany(like(h, q)),
  },
  {
    kind: "account",
    subtitle: "Wealth · Account",
    route: "/assets",
    fetch: (h, q) => prisma.account.findMany(like(h, q)),
  },
  {
    kind: "gift_person",
    subtitle: "Gifts · Person",
    route: "/gifts",
    fetch: (h, q) => prisma.giftPerson.findMany(like(h, q)),
  },
  {
    kind: "gift_event",
    subtitle: "Gifts · Event",
    route: "/gifts",
    fetch: (h, q) => prisma.giftEvent.findMany(like(h, q)),
  },
  {
    kind: "purchase_item",
    subtitle: "Goals · Purchase item",
    route: "/goals",
    fetch: (h, q) => prisma.purchaseItem.findMany(like(h, q)),
  },
];

function rankScore(name: string, q: string): number {
  const n = name.toLowerCase();
  const t = q.toLowerCase();
  if (n === t) return 0;
  if (n.startsWith(t)) return 1;
  return 2;
}

export const searchService = {
  async search(householdId: string, rawQuery: string): Promise<SearchResponse> {
    const q = rawQuery.trim();
    if (q.length === 0) return { results: [] };

    const buckets = await Promise.all(
      KINDS.map(async (cfg) => {
        const rows = await cfg.fetch(householdId, q);
        return rows
          .slice()
          .sort((a, b) => {
            const sa = rankScore(a.name, q);
            const sb = rankScore(b.name, q);
            if (sa !== sb) return sa - sb;
            return a.name.localeCompare(b.name);
          })
          .slice(0, PER_KIND_LIMIT)
          .map<SearchResult>((row) => ({
            kind: cfg.kind,
            id: row.id,
            name: row.name,
            subtitle: cfg.subtitle,
            route: cfg.route,
            focusId: row.id,
          }));
      })
    );

    return { results: buckets.flat() };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts search.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/search.service.ts apps/backend/src/services/__tests__/search.service.test.ts
git commit -m "feat(backend): add SearchService for universal search data queries"
```

---

### Task 3: Backend search route

**Files:**

- Create: `apps/backend/src/routes/search.routes.ts`
- Modify: `apps/backend/src/app.ts` (register route)
- Test: `apps/backend/src/routes/search.routes.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/routes/search.routes.test.ts
import { describe, it, expect, mock, beforeEach, beforeAll, afterAll } from "bun:test";
import type { FastifyInstance } from "fastify";
import { buildTestApp } from "../test/helpers/fastify";
import { errorHandler } from "../middleware/errorHandler";
import { AuthenticationError } from "../utils/errors";

const searchServiceMock = {
  search: mock(() => Promise.resolve({ results: [] })),
};

mock.module("../services/search.service", () => ({
  searchService: searchServiceMock,
}));

mock.module("../middleware/auth.middleware", () => ({
  authMiddleware: mock(() => {}),
}));

mock.module("../config/database", () => ({
  prisma: {},
}));

import { authMiddleware } from "../middleware/auth.middleware";
import { searchRoutes } from "./search.routes";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
  app.setErrorHandler(errorHandler);
  await app.register(searchRoutes, { prefix: "/api/search" });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  searchServiceMock.search.mockReset();
  searchServiceMock.search.mockResolvedValue({ results: [] });

  (authMiddleware as any).mockImplementation(async (request: any) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AuthenticationError("No authorization token provided");
    }
    request.user = { userId: "user-1", email: "test@test.com" };
    request.householdId = "hh-1";
  });
});

describe("GET /api/search", () => {
  it("returns 401 without a JWT", async () => {
    const res = await app.inject({ method: "GET", url: "/api/search?q=x" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 400 for an empty query", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/search?q=",
      headers: { authorization: "Bearer valid-token" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("passes req.householdId (not client input) to the service", async () => {
    searchServiceMock.search.mockResolvedValue({
      results: [
        {
          kind: "income_source",
          id: "i1",
          name: "Salary",
          subtitle: "Income · Source",
          route: "/income",
          focusId: "i1",
        },
      ],
    } as any);

    const res = await app.inject({
      method: "GET",
      url: "/api/search?q=salary",
      headers: { authorization: "Bearer valid-token" },
    });

    expect(res.statusCode).toBe(200);
    expect(searchServiceMock.search).toHaveBeenCalledWith("hh-1", "salary");
    const body = res.json();
    expect(body.results).toHaveLength(1);
    expect(body.results[0].kind).toBe("income_source");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/backend && bun scripts/run-tests.ts search.routes`
Expected: FAIL — "Cannot find module './search.routes'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/routes/search.routes.ts
import type { FastifyInstance } from "fastify";
import { SearchQuerySchema } from "@finplan/shared";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { searchService } from "../services/search.service.js";
import { AppError } from "../utils/errors.js";

export async function searchRoutes(fastify: FastifyInstance) {
  const pre = { preHandler: [authMiddleware] };

  fastify.get("/", pre, async (req, reply) => {
    const parsed = SearchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(parsed.error.errors[0]?.message ?? "Invalid query", 400);
    }
    const result = await searchService.search(req.householdId!, parsed.data.q);
    return reply.send(result);
  });
}
```

Register in `apps/backend/src/app.ts` — add alongside existing `app.register(...)` calls with the `/api/...` prefix convention:

```typescript
import { searchRoutes } from "./routes/search.routes.js";
// ...inside buildApp:
await app.register(searchRoutes, { prefix: "/api/search" });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/backend && bun scripts/run-tests.ts search.routes`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes/search.routes.ts apps/backend/src/routes/search.routes.test.ts apps/backend/src/app.ts
git commit -m "feat(backend): add GET /search route for universal search"
```

---

### Task 4: Frontend search service

**Files:**

- Create: `apps/frontend/src/services/search.service.ts`
- Test: `apps/frontend/src/services/search.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/services/search.service.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const getMock = vi.fn();
vi.mock("@/lib/api", () => ({
  apiClient: { get: getMock },
}));

import { searchService } from "./search.service";

beforeEach(() => {
  getMock.mockReset();
});

describe("searchService.search", () => {
  it("calls GET /api/search with an encoded query and returns results", async () => {
    getMock.mockResolvedValue({
      results: [
        {
          kind: "income_source",
          id: "1",
          name: "Salary",
          subtitle: "Income · Source",
          route: "/income",
          focusId: "1",
        },
      ],
    });

    const res = await searchService.search("sal ary");

    expect(getMock).toHaveBeenCalledWith("/api/search?q=sal%20ary");
    expect(res.results).toHaveLength(1);
    expect(res.results[0]?.kind).toBe("income_source");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun run test -- search.service`
Expected: FAIL — "Cannot find module './search.service'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/frontend/src/services/search.service.ts
import { apiClient } from "@/lib/api";
import type { SearchResponse } from "@finplan/shared";

export const searchService = {
  search: (q: string) => apiClient.get<SearchResponse>(`/api/search?q=${encodeURIComponent(q)}`),
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun run test -- search.service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/services/search.service.ts apps/frontend/src/services/search.service.test.ts
git commit -m "feat(frontend): add searchService client for universal search"
```

---

### Task 5: Action registry (static)

**Files:**

- Create: `apps/frontend/src/features/search/actions.ts`
- Test: `apps/frontend/src/features/search/__tests__/actions.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/features/search/__tests__/actions.test.ts
import { describe, it, expect } from "vitest";
import { NAV_ACTIONS, CREATE_ACTIONS, ALL_ACTIONS } from "../actions";

describe("action registry", () => {
  it("has exactly 12 navigation actions", () => {
    expect(NAV_ACTIONS).toHaveLength(12);
  });

  it("has exactly 8 create actions", () => {
    expect(CREATE_ACTIONS).toHaveLength(8);
  });

  it("every nav action has a route and no addParam", () => {
    for (const a of NAV_ACTIONS) {
      expect(a.kind).toBe("nav");
      expect(a.route).toMatch(/^\//);
      expect(a.addParam).toBeUndefined();
    }
  });

  it("every create action has a route and an addParam", () => {
    for (const a of CREATE_ACTIONS) {
      expect(a.kind).toBe("create");
      expect(a.route).toMatch(/^\//);
      expect(a.addParam).toBeTruthy();
    }
  });

  it("ids are unique", () => {
    const ids = ALL_ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test actions`
Expected: FAIL — "Cannot find module '../actions'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/frontend/src/features/search/actions.ts
export type PaletteAction = {
  id: string;
  label: string;
  kind: "nav" | "create";
  route: string;
  addParam?: string;
};

export const NAV_ACTIONS: PaletteAction[] = [
  { id: "nav.overview", label: "Go to Overview", kind: "nav", route: "/overview" },
  { id: "nav.income", label: "Go to Income", kind: "nav", route: "/income" },
  { id: "nav.committed", label: "Go to Committed", kind: "nav", route: "/committed" },
  { id: "nav.discretionary", label: "Go to Discretionary", kind: "nav", route: "/discretionary" },
  { id: "nav.surplus", label: "Go to Surplus", kind: "nav", route: "/surplus" },
  { id: "nav.forecast", label: "Go to Forecast", kind: "nav", route: "/forecast" },
  { id: "nav.assets", label: "Go to Assets", kind: "nav", route: "/assets" },
  { id: "nav.goals", label: "Go to Goals", kind: "nav", route: "/goals" },
  { id: "nav.gifts", label: "Go to Gifts", kind: "nav", route: "/gifts" },
  { id: "nav.help", label: "Go to Help", kind: "nav", route: "/help" },
  {
    id: "nav.settings.profile",
    label: "Go to Profile Settings",
    kind: "nav",
    route: "/settings/profile",
  },
  {
    id: "nav.settings.household",
    label: "Go to Household Settings",
    kind: "nav",
    route: "/settings/household",
  },
];

export const CREATE_ACTIONS: PaletteAction[] = [
  {
    id: "create.income",
    label: "Add income source",
    kind: "create",
    route: "/income",
    addParam: "1",
  },
  {
    id: "create.committed",
    label: "Add committed item",
    kind: "create",
    route: "/committed",
    addParam: "1",
  },
  {
    id: "create.discretionary",
    label: "Add discretionary item",
    kind: "create",
    route: "/discretionary",
    addParam: "1",
  },
  { id: "create.asset", label: "Add asset", kind: "create", route: "/assets", addParam: "asset" },
  {
    id: "create.account",
    label: "Add account",
    kind: "create",
    route: "/assets",
    addParam: "account",
  },
  {
    id: "create.gift-person",
    label: "Add gift recipient",
    kind: "create",
    route: "/gifts",
    addParam: "person",
  },
  {
    id: "create.gift-event",
    label: "Add gift event",
    kind: "create",
    route: "/gifts",
    addParam: "event",
  },
  {
    id: "create.purchase-item",
    label: "Add purchase item",
    kind: "create",
    route: "/goals",
    addParam: "1",
  },
];

export const ALL_ACTIONS: PaletteAction[] = [...NAV_ACTIONS, ...CREATE_ACTIONS];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test actions`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/search/actions.ts apps/frontend/src/features/search/__tests__/actions.test.ts
git commit -m "feat(frontend): add universal search action registry"
```

---

### Task 6: `useSearchRecents` hook (localStorage, per-user MRU)

**Files:**

- Create: `apps/frontend/src/features/search/useSearchRecents.ts`
- Test: `apps/frontend/src/features/search/__tests__/useSearchRecents.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/features/search/__tests__/useSearchRecents.test.tsx
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSearchRecents, type RecentEntry } from "../useSearchRecents";

const entry = (id: string, kind: RecentEntry["kind"] = "nav"): RecentEntry => ({
  id,
  kind,
  label: `Entry ${id}`,
  subtitle: "x",
  route: "/x",
});

describe("useSearchRecents", () => {
  beforeEach(() => localStorage.clear());

  it("returns empty list for a user with no recents", () => {
    const { result } = renderHook(() => useSearchRecents("user-1"));
    expect(result.current.list).toEqual([]);
  });

  it("pushes entries to the top and caps at 3", () => {
    const { result } = renderHook(() => useSearchRecents("user-1"));
    act(() => result.current.push(entry("a")));
    act(() => result.current.push(entry("b")));
    act(() => result.current.push(entry("c")));
    act(() => result.current.push(entry("d")));
    expect(result.current.list.map((e) => e.id)).toEqual(["d", "c", "b"]);
  });

  it("dedupes by (kind,id) and moves existing entry to top", () => {
    const { result } = renderHook(() => useSearchRecents("user-1"));
    act(() => result.current.push(entry("a")));
    act(() => result.current.push(entry("b")));
    act(() => result.current.push(entry("a")));
    expect(result.current.list.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("keeps recents isolated per user", () => {
    const { result: u1 } = renderHook(() => useSearchRecents("user-1"));
    act(() => u1.current.push(entry("a")));
    const { result: u2 } = renderHook(() => useSearchRecents("user-2"));
    expect(u2.current.list).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test useSearchRecents`
Expected: FAIL — "Cannot find module '../useSearchRecents'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/frontend/src/features/search/useSearchRecents.ts
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
const key = (userId: string) => `finplan.search.recents.v1.${userId}`;

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test useSearchRecents`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/search/useSearchRecents.ts apps/frontend/src/features/search/__tests__/useSearchRecents.test.tsx
git commit -m "feat(frontend): add useSearchRecents hook (per-user MRU in localStorage)"
```

---

### Task 7: `useSearchHotkey` hook

**Files:**

- Create: `apps/frontend/src/features/search/useSearchHotkey.ts`
- Test: `apps/frontend/src/features/search/__tests__/useSearchHotkey.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/features/search/__tests__/useSearchHotkey.test.tsx
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSearchHotkey } from "../useSearchHotkey";

function fireKey(key: string, meta = false, ctrl = false) {
  const ev = new KeyboardEvent("keydown", { key, metaKey: meta, ctrlKey: ctrl });
  window.dispatchEvent(ev);
}

describe("useSearchHotkey", () => {
  it("invokes callback on Ctrl+K", () => {
    const cb = vi.fn();
    renderHook(() => useSearchHotkey(cb));
    fireKey("k", false, true);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("invokes callback on Cmd+K", () => {
    const cb = vi.fn();
    renderHook(() => useSearchHotkey(cb));
    fireKey("k", true, false);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("does not invoke on plain 'k'", () => {
    const cb = vi.fn();
    renderHook(() => useSearchHotkey(cb));
    fireKey("k");
    expect(cb).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test useSearchHotkey`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/frontend/src/features/search/useSearchHotkey.ts
import { useEffect } from "react";

export function useSearchHotkey(onOpen: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onOpen]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test useSearchHotkey`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/search/useSearchHotkey.ts apps/frontend/src/features/search/__tests__/useSearchHotkey.test.tsx
git commit -m "feat(frontend): add useSearchHotkey hook (Ctrl+K / Cmd+K)"
```

---

### Task 8: `useSearchQuery` — debounce, fetch, merge

**Files:**

- Create: `apps/frontend/src/features/search/useSearchQuery.ts`
- Create: `apps/frontend/src/features/search/helpMatch.ts` (extract HelpSidebar filter for reuse)
- Test: `apps/frontend/src/features/search/__tests__/useSearchQuery.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/features/search/__tests__/useSearchQuery.test.tsx
import { describe, it, expect } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useSearchQuery } from "../useSearchQuery";

const server = setupServer(
  http.get("*/api/search", ({ request }) => {
    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? "";
    if (q.toLowerCase().includes("mortgage")) {
      return HttpResponse.json({
        results: [
          {
            kind: "committed_item",
            id: "1",
            name: "Mortgage",
            subtitle: "Committed · Item",
            route: "/committed",
            focusId: "1",
          },
        ],
      });
    }
    return HttpResponse.json({ results: [] });
  }),
);

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useSearchQuery", () => {
  it("returns grouped results: data + help + actions", async () => {
    server.listen();
    const { result } = renderHook(() => useSearchQuery("mortgage"), { wrapper });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.groups.data.length).toBeGreaterThan(0);
    expect(result.current.groups.data[0]!.name).toBe("Mortgage");
    server.close();
  });

  it("returns empty groups when query is empty", () => {
    const { result } = renderHook(() => useSearchQuery(""), { wrapper });
    expect(result.current.groups.data).toEqual([]);
    expect(result.current.groups.help).toEqual([]);
    expect(result.current.groups.actions).toEqual([]);
  });

  it("filters actions by label substring", async () => {
    server.listen();
    const { result } = renderHook(() => useSearchQuery("settings"), { wrapper });
    await waitFor(() => expect(result.current.groups.actions.length).toBeGreaterThan(0));
    expect(result.current.groups.actions.some((a) => a.label.includes("Settings"))).toBe(true);
    server.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test useSearchQuery`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/frontend/src/features/search/helpMatch.ts
import { GLOSSARY_ENTRIES } from "../../data/glossary";
import { CONCEPT_ENTRIES } from "../../data/concepts";

export type HelpMatch = {
  id: string;
  title: string;
  subtitle: string;
  entryType: "glossary" | "concept";
};

export function matchHelp(query: string): HelpMatch[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const gloss = GLOSSARY_ENTRIES.filter(
    (e) =>
      e.term.toLowerCase().includes(q) ||
      e.definition.toLowerCase().includes(q) ||
      e.tag.toLowerCase().includes(q)
  ).map<HelpMatch>((e) => ({
    id: e.id,
    title: e.term,
    subtitle: e.definition.slice(0, 60),
    entryType: "glossary",
  }));
  const concepts = CONCEPT_ENTRIES.filter(
    (e) =>
      e.title.toLowerCase().includes(q) ||
      e.summary.toLowerCase().includes(q) ||
      e.whyItMatters.toLowerCase().includes(q)
  ).map<HelpMatch>((e) => ({
    id: e.id,
    title: e.title,
    subtitle: e.summary.slice(0, 60),
    entryType: "concept",
  }));
  return [...gloss, ...concepts].slice(0, 5);
}
```

```typescript
// apps/frontend/src/features/search/useSearchQuery.ts
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
    isPending: dataQuery.isFetching,
    error: dataQuery.error,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test useSearchQuery`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/search/useSearchQuery.ts apps/frontend/src/features/search/helpMatch.ts apps/frontend/src/features/search/__tests__/useSearchQuery.test.tsx
git commit -m "feat(frontend): add useSearchQuery hook with data+help+actions merge"
```

---

### Task 9: Result row + group components

**Files:**

- Create: `apps/frontend/src/features/search/SearchResultRow.tsx`
- Create: `apps/frontend/src/features/search/SearchResultGroup.tsx`
- Test: `apps/frontend/src/features/search/__tests__/SearchResultRow.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/features/search/__tests__/SearchResultRow.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SearchResultRow } from "../SearchResultRow";

describe("SearchResultRow", () => {
  it("renders title and subtitle", () => {
    render(<SearchResultRow title="Mortgage" subtitle="Committed · Item" onSelect={() => {}} />);
    expect(screen.getByText("Mortgage")).toBeInTheDocument();
    expect(screen.getByText("Committed · Item")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test SearchResultRow`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/frontend/src/features/search/SearchResultRow.tsx
import { Command } from "cmdk";

type Props = {
  title: string;
  subtitle: string;
  onSelect: () => void;
  value?: string;
};

export function SearchResultRow({ title, subtitle, onSelect, value }: Props) {
  return (
    <Command.Item
      value={value ?? `${title}::${subtitle}`}
      onSelect={onSelect}
      className="flex items-center justify-between px-3 py-2 rounded-sm data-[selected=true]:bg-foreground/[0.06] cursor-pointer"
    >
      <div className="flex flex-col min-w-0">
        <span className="text-sm text-foreground truncate">{title}</span>
        <span className="text-xs text-foreground/60 truncate">{subtitle}</span>
      </div>
    </Command.Item>
  );
}
```

```typescript
// apps/frontend/src/features/search/SearchResultGroup.tsx
import { Command } from "cmdk";
import type { ReactNode } from "react";

type Props = { heading: string; children: ReactNode; hidden?: boolean };

export function SearchResultGroup({ heading, children, hidden }: Props) {
  if (hidden) return null;
  return (
    <Command.Group
      heading={heading}
      className="text-xs uppercase tracking-wide text-foreground/50 px-3 pt-2"
    >
      {children}
    </Command.Group>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test SearchResultRow`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/search/SearchResultRow.tsx apps/frontend/src/features/search/SearchResultGroup.tsx apps/frontend/src/features/search/__tests__/SearchResultRow.test.tsx
git commit -m "feat(frontend): add SearchResultRow and SearchResultGroup"
```

---

### Task 10: `SearchPalette` — Dialog + cmdk + navigation wiring

**Files:**

- Create: `apps/frontend/src/features/search/SearchPalette.tsx`
- Test: `apps/frontend/src/features/search/__tests__/SearchPalette.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/features/search/__tests__/SearchPalette.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { SearchPalette } from "../SearchPalette";

const server = setupServer(
  http.get("/search", () => HttpResponse.json({ results: [] })),
);

function renderPalette(open = true, onOpenChange = () => {}) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/overview"]}>
        <SearchPalette open={open} onOpenChange={onOpenChange} userId="u-1" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("SearchPalette", () => {
  it("renders the input when open", () => {
    server.listen();
    renderPalette(true);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    server.close();
  });

  it("shows 'No results' when a non-empty query yields nothing", async () => {
    server.listen();
    const user = userEvent.setup();
    renderPalette(true);
    await user.type(screen.getByRole("textbox"), "zzz-no-match");
    expect(await screen.findByText(/No results/i)).toBeInTheDocument();
    server.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test SearchPalette`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/frontend/src/features/search/SearchPalette.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Command } from "cmdk";
import * as Dialog from "@radix-ui/react-dialog";
import { SearchResultRow } from "./SearchResultRow";
import { SearchResultGroup } from "./SearchResultGroup";
import { useSearchQuery } from "./useSearchQuery";
import { useSearchRecents, type RecentEntry } from "./useSearchRecents";
import type { PaletteAction } from "./actions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
};

export function SearchPalette({ open, onOpenChange, userId }: Props) {
  const [query, setQuery] = useState("");
  const { groups } = useSearchQuery(query);
  const { list: recents, push } = useSearchRecents(userId);
  const navigate = useNavigate();

  const close = () => {
    setQuery("");
    onOpenChange(false);
  };

  const navigateTo = (route: string, params?: Record<string, string>) => {
    const search = params ? `?${new URLSearchParams(params).toString()}` : "";
    navigate(`${route}${search}`);
    close();
  };

  const selectData = (r: { kind: string; id: string; name: string; subtitle: string; route: string; focusId: string }) => {
    push({ kind: "data", id: r.id, label: r.name, subtitle: r.subtitle, route: r.route, focusId: r.focusId });
    navigateTo(r.route, { focus: r.focusId });
  };

  const selectHelp = (h: { id: string; title: string; subtitle: string }) => {
    push({ kind: "help", id: h.id, label: h.title, subtitle: h.subtitle, route: "/help" });
    navigateTo("/help", { entry: h.id });
  };

  const selectAction = (a: PaletteAction) => {
    push({
      kind: a.kind === "create" ? "create" : "nav",
      id: a.id,
      label: a.label,
      subtitle: a.kind === "create" ? "Action · Create" : "Action · Navigate",
      route: a.route,
      addParam: a.addParam,
    });
    navigateTo(a.route, a.addParam ? { add: a.addParam } : undefined);
  };

  const selectRecent = (r: RecentEntry) => {
    if (r.kind === "data" && r.focusId) return navigateTo(r.route, { focus: r.focusId });
    if (r.kind === "help") return navigateTo(r.route, { entry: r.id });
    if (r.kind === "create" && r.addParam) return navigateTo(r.route, { add: r.addParam });
    return navigateTo(r.route);
  };

  const isEmptyQuery = query.trim().length === 0;
  const hasAnyResults =
    groups.data.length > 0 || groups.help.length > 0 || groups.actions.length > 0;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-background/60 backdrop-blur-[1px] z-40" />
        <Dialog.Content
          className="fixed left-0 right-0 top-0 z-50 mx-auto max-w-3xl"
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">Search</Dialog.Title>
          <Command
            label="Universal search"
            className="bg-background border border-foreground/10 rounded-b-md shadow-lg overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-foreground/5">
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Search..."
                className="w-full bg-transparent outline-none text-sm text-foreground"
                autoFocus
              />
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto min-h-0">
              {isEmptyQuery ? (
                recents.length === 0 ? (
                  <div className="px-3 py-6 text-xs text-foreground/50">Start typing to search…</div>
                ) : (
                  <SearchResultGroup heading="Recent">
                    {recents.map((r) => (
                      <SearchResultRow
                        key={`${r.kind}:${r.id}`}
                        value={`recent::${r.kind}::${r.id}`}
                        title={r.label}
                        subtitle={r.subtitle}
                        onSelect={() => selectRecent(r)}
                      />
                    ))}
                  </SearchResultGroup>
                )
              ) : !hasAnyResults ? (
                <Command.Empty className="px-3 py-6 text-xs text-foreground/50">No results</Command.Empty>
              ) : (
                <>
                  <SearchResultGroup heading="Data" hidden={groups.data.length === 0}>
                    {groups.data.map((r) => (
                      <SearchResultRow
                        key={`data::${r.kind}::${r.id}`}
                        value={`data::${r.kind}::${r.id}`}
                        title={r.name}
                        subtitle={r.subtitle}
                        onSelect={() => selectData(r)}
                      />
                    ))}
                  </SearchResultGroup>
                  <SearchResultGroup heading="Help" hidden={groups.help.length === 0}>
                    {groups.help.map((h) => (
                      <SearchResultRow
                        key={`help::${h.id}`}
                        value={`help::${h.id}`}
                        title={h.title}
                        subtitle={h.subtitle}
                        onSelect={() => selectHelp(h)}
                      />
                    ))}
                  </SearchResultGroup>
                  <SearchResultGroup heading="Actions" hidden={groups.actions.length === 0}>
                    {groups.actions.map((a) => (
                      <SearchResultRow
                        key={`action::${a.id}`}
                        value={`action::${a.id}`}
                        title={a.label}
                        subtitle={a.kind === "create" ? "Action · Create" : "Action · Navigate"}
                        onSelect={() => selectAction(a)}
                      />
                    ))}
                  </SearchResultGroup>
                </>
              )}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test SearchPalette`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/search/SearchPalette.tsx apps/frontend/src/features/search/__tests__/SearchPalette.test.tsx
git commit -m "feat(frontend): add SearchPalette (cmdk + Radix Dialog)"
```

---

### Task 11: `SearchTriggerIcon` + mount in `Layout.tsx`

**Files:**

- Create: `apps/frontend/src/features/search/SearchTriggerIcon.tsx`
- Modify: `apps/frontend/src/components/layout/Layout.tsx`
- Test: `apps/frontend/src/features/search/__tests__/SearchTriggerIcon.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/features/search/__tests__/SearchTriggerIcon.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchTriggerIcon } from "../SearchTriggerIcon";

describe("SearchTriggerIcon", () => {
  it("renders a button with a Search icon and tooltip label", () => {
    render(<SearchTriggerIcon onOpen={() => {}} />);
    const btn = screen.getByRole("button", { name: /search/i });
    expect(btn).toBeInTheDocument();
  });

  it("calls onOpen when clicked", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<SearchTriggerIcon onOpen={spy} />);
    await user.click(screen.getByRole("button", { name: /search/i }));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test SearchTriggerIcon`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/frontend/src/features/search/SearchTriggerIcon.tsx
import { Search } from "lucide-react";

type Props = { onOpen: () => void };

export function SearchTriggerIcon({ onOpen }: Props) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Search (Ctrl+K)"
      title="Search (Ctrl+K)"
      className="p-1.5 rounded-sm text-foreground/70 hover:text-foreground hover:bg-foreground/[0.06]"
    >
      <Search className="h-4 w-4" />
    </button>
  );
}
```

Modify `apps/frontend/src/components/layout/Layout.tsx`:

1. Add imports:
   ```typescript
   import { useState } from "react";
   import { SearchTriggerIcon } from "@/features/search/SearchTriggerIcon";
   import { SearchPalette } from "@/features/search/SearchPalette";
   import { useSearchHotkey } from "@/features/search/useSearchHotkey";
   ```
   (Layout already imports `useAuthStore`.)
2. Inside the Layout component, alongside the existing `logout` selector, add:
   ```typescript
   const userId = useAuthStore((s) => s.user?.id ?? null);
   const [searchOpen, setSearchOpen] = useState(false);
   useSearchHotkey(() => setSearchOpen(true));
   ```
3. In the header JSX, after the `NAV_ITEMS_GROUP3` map and before `<HouseholdSwitcher />`, insert:
   ```tsx
   <SearchTriggerIcon onOpen={() => setSearchOpen(true)} />
   ```
4. At the end of the Layout return (outside the header, inside the outer wrapper), render:
   ```tsx
   {
     userId && <SearchPalette open={searchOpen} onOpenChange={setSearchOpen} userId={userId} />;
   }
   ```
   The `userId` guard ensures recents-scoping is well-defined; pre-auth the Layout won't mount this component path anyway, but the guard keeps the type non-null.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test SearchTriggerIcon`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/search/SearchTriggerIcon.tsx apps/frontend/src/features/search/__tests__/SearchTriggerIcon.test.tsx apps/frontend/src/components/layout/Layout.tsx
git commit -m "feat(frontend): mount universal search in Layout (trigger + hotkey)"
```

---

### Task 12: `useFocusParam` + `useAddParam` shared page hooks

**Files:**

- Create: `apps/frontend/src/features/search/useFocusParam.ts`
- Create: `apps/frontend/src/features/search/useAddParam.ts`
- Test: `apps/frontend/src/features/search/__tests__/params.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/features/search/__tests__/params.test.tsx
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { render } from "@testing-library/react";
import { useFocusParam } from "../useFocusParam";
import { useAddParam } from "../useAddParam";

function FocusProbe({ onFocus }: { onFocus: (id: string) => void }) {
  useFocusParam(onFocus);
  return null;
}

function AddProbe({ onAdd }: { onAdd: (kind: string) => void }) {
  useAddParam(onAdd);
  return null;
}

describe("useFocusParam", () => {
  it("calls onFocus with the id from ?focus=<id>", () => {
    const spy = vi.fn();
    render(
      <MemoryRouter initialEntries={["/x?focus=abc"]}>
        <Routes>
          <Route path="/x" element={<FocusProbe onFocus={spy} />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(spy).toHaveBeenCalledWith("abc");
  });

  it("does not call onFocus when param absent", () => {
    const spy = vi.fn();
    render(
      <MemoryRouter initialEntries={["/x"]}>
        <Routes>
          <Route path="/x" element={<FocusProbe onFocus={spy} />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("useAddParam", () => {
  it("calls onAdd with the kind from ?add=<kind>", () => {
    const spy = vi.fn();
    render(
      <MemoryRouter initialEntries={["/x?add=asset"]}>
        <Routes>
          <Route path="/x" element={<AddProbe onAdd={spy} />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(spy).toHaveBeenCalledWith("asset");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test params`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/frontend/src/features/search/useFocusParam.ts
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

export function useFocusParam(onFocus: (id: string) => void) {
  const [params, setParams] = useSearchParams();
  const focus = params.get("focus");
  useEffect(() => {
    if (!focus) return;
    onFocus(focus);
    const next = new URLSearchParams(params);
    next.delete("focus");
    setParams(next, { replace: true });
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps
}
```

```typescript
// apps/frontend/src/features/search/useAddParam.ts
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

export function useAddParam(onAdd: (kind: string) => void) {
  const [params, setParams] = useSearchParams();
  const add = params.get("add");
  useEffect(() => {
    if (!add) return;
    onAdd(add);
    const next = new URLSearchParams(params);
    next.delete("add");
    setParams(next, { replace: true });
  }, [add]); // eslint-disable-line react-hooks/exhaustive-deps
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test params`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/search/useFocusParam.ts apps/frontend/src/features/search/useAddParam.ts apps/frontend/src/features/search/__tests__/params.test.tsx
git commit -m "feat(frontend): add useFocusParam and useAddParam hooks"
```

---

### Task 13: Wire `?focus=<id>` + `?add=1` on single-entity tier pages (Income, Committed, Discretionary, Goals)

IncomePage, CommittedPage, and DiscretionaryPage each render `<TierPage tier="..." />`, so the shared wiring lives in `TierPage.tsx` (keyed off the `tier` prop). GoalsPage is wired separately.

**Files:**

- Modify: `apps/frontend/src/components/tier/TierPage.tsx` (shared for Income, Committed, Discretionary)
- Modify: `apps/frontend/src/pages/GoalsPage.tsx`
- Test: `apps/frontend/src/components/tier/__tests__/TierPage.params.test.tsx` — one representative test for the shared wiring

- [ ] **Step 1: Write the failing test** (one representative test)

```typescript
// apps/frontend/src/components/tier/__tests__/TierPage.params.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TierPage from "../TierPage";

// Stub the data-fetching hooks TierPage uses so the render is deterministic.
// The real hook path is identified during implementation — the mock target is
// whatever hook (or tRPC client) TierPage calls to load the tier's items.
vi.mock("@/features/tier/useTierItems", () => ({
  useTierItems: () => ({ data: [], isLoading: false }),
}));

function renderAt(url: string) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/income" element={<TierPage tier="income" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("TierPage ?add=1", () => {
  it("opens the add-income modal when navigated with ?add=1", async () => {
    renderAt("/income?add=1");
    expect(await screen.findByRole("dialog", { name: /add income/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun run test -- TierPage.params`
Expected: FAIL — modal not opened on URL load

- [ ] **Step 3: Write minimal implementation**

In `TierPage.tsx` (covers Income/Committed/Discretionary) and in `GoalsPage.tsx`:

1. Import `useFocusParam` and `useAddParam`.
2. In the component body, find the existing state that controls the add modal (e.g. `const [isAddingItem, setIsAddingItem] = useState(false);` in the `ItemArea.tsx` pattern, or the equivalent on the page). Lift the state up to the page/TierPage level so the URL param handler can flip it.
3. Call:
   ```tsx
   useAddParam(() => setIsAddingItem(true));
   useFocusParam((id) => {
     const el = document.querySelector(`[data-search-focus="${id}"]`);
     if (el) {
       el.scrollIntoView({ behavior: "smooth", block: "center" });
       el.classList.add("search-focus-pulse");
       setTimeout(() => el.classList.remove("search-focus-pulse"), 1200);
     }
   });
   ```
4. Add `data-search-focus={item.id}` on each row element rendered in the list.
5. Add a `.search-focus-pulse` utility to `apps/frontend/src/index.css` (the sole global stylesheet) — short fade from accent-tinted background to transparent, using existing design tokens. Example:
   ```css
   @keyframes search-focus-pulse {
     0% {
       background-color: hsl(var(--accent) / 0.24);
     }
     100% {
       background-color: transparent;
     }
   }
   .search-focus-pulse {
     animation: search-focus-pulse 1.2s ease-out forwards;
   }
   ```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test IncomePage.params`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/tier/TierPage.tsx apps/frontend/src/pages/GoalsPage.tsx apps/frontend/src/components/tier/__tests__/TierPage.params.test.tsx apps/frontend/src/index.css
git commit -m "feat(frontend): wire ?focus/?add params on single-entity pages"
```

---

### Task 14: Wire `?focus=<id>` + `?add=<kind>` on multi-entity pages (Assets, Gifts)

**Files:**

- Modify: `apps/frontend/src/pages/AssetsPage.tsx` (handles Asset + Account)
- Modify: `apps/frontend/src/pages/GiftsPage.tsx` (handles GiftPerson + GiftEvent)
- Test: `apps/frontend/src/pages/__tests__/AssetsPage.params.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/frontend/src/pages/__tests__/AssetsPage.params.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AssetsPage from "../AssetsPage";

vi.mock("@/services/assets.service", () => ({
  assetsService: {
    listAssets: vi.fn(() => Promise.resolve([])),
    listAccounts: vi.fn(() => Promise.resolve([])),
  },
}));

function renderAt(url: string) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/assets" element={<AssetsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AssetsPage ?add=<kind>", () => {
  it("opens the add-asset modal when navigated with ?add=asset", async () => {
    renderAt("/assets?add=asset");
    expect(await screen.findByRole("dialog", { name: /add asset/i })).toBeInTheDocument();
  });

  it("opens the add-account modal when navigated with ?add=account", async () => {
    renderAt("/assets?add=account");
    expect(await screen.findByRole("dialog", { name: /add account/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun test AssetsPage.params`
Expected: FAIL — modals not wired

- [ ] **Step 3: Write minimal implementation**

In `AssetsPage.tsx`:

```typescript
useAddParam((kind) => {
  if (kind === "asset" || kind === "1") setAddingAsset(true);
  else if (kind === "account") setAddingAccount(true);
});
useFocusParam((id) => {
  const el = document.querySelector(`[data-search-focus="${id}"]`);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("search-focus-pulse");
    setTimeout(() => el.classList.remove("search-focus-pulse"), 1200);
  }
});
```

In `GiftsPage.tsx`:

```typescript
useAddParam((kind) => {
  if (kind === "person" || kind === "1") setAddingPerson(true);
  else if (kind === "event") setAddingEvent(true);
});
useFocusParam((id) => {
  /* same pattern as above */
});
```

Add `data-search-focus={row.id}` on each Asset row, Account row, GiftPerson row, GiftEvent row.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun test AssetsPage.params`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/AssetsPage.tsx apps/frontend/src/pages/GiftsPage.tsx apps/frontend/src/pages/__tests__/AssetsPage.params.test.tsx
git commit -m "feat(frontend): wire ?focus/?add params on multi-entity pages"
```

---

## Testing

### Backend Tests

- [ ] Service: case-insensitive substring match on `name` across 8 entities
- [ ] Service: rank order (exact > starts-with > contains) within each entity kind
- [ ] Service: 5-per-kind cap applied after ranking
- [ ] Service: household scoping — items from other households never returned
- [ ] Endpoint: `GET /search` returns 401 without JWT
- [ ] Endpoint: `GET /search?q=` returns 400 (Zod rejects empty)
- [ ] Endpoint: `GET /search?q=<long>` returns 400 (>100 chars)
- [ ] Endpoint: happy-path returns `results` array shaped per `SearchResponseSchema`

### Frontend Tests

- [ ] Hook: `useSearchHotkey` fires on Ctrl+K and Cmd+K, not on plain "k"
- [ ] Hook: `useSearchRecents` dedupes, caps at 3, isolates per user id
- [ ] Hook: `useSearchQuery` returns grouped results; empty query → empty groups
- [ ] Hook: `useFocusParam` / `useAddParam` consume their param and strip it from the URL
- [ ] Component: `SearchPalette` renders input, shows "No results" for empty matches, navigates on selection
- [ ] Component: `SearchTriggerIcon` calls `onOpen` on click
- [ ] Integration: `?add=1` on IncomePage opens the add-income modal; `?add=asset` on AssetsPage opens add-asset modal
- [ ] Integration: `?focus=<id>` on a list page scrolls + pulse-highlights the row

### Key Scenarios

- [ ] Happy path: press Ctrl+K → type "mortgage" → see Committed · Mortgage → hit Enter → land on /committed with the mortgage row highlighted
- [ ] Launcher path: press Ctrl+K (empty state) → pick "Go to Settings" from Recents → land on /settings/profile
- [ ] Create path: press Ctrl+K → type "add income" → hit Enter → land on /income with add-income modal open
- [ ] Empty-state path (first use): press Ctrl+K → input shows hint "Start typing…"
- [ ] Cross-household isolation: two users on the same device see only their own recents after logout/login
- [ ] Error path: backend /search returns 500 → palette shows "No results" (or an error row), no crash

## Verification

- [ ] `bun run build` passes clean
- [ ] `bun run lint` — zero warnings
- [ ] `cd apps/backend && bun scripts/run-tests.ts search` passes
- [ ] `cd apps/frontend && bun test search` passes
- [ ] Manual desktop journey: open palette with `Ctrl+K` and with trigger icon; search each of the 8 entity types; select each and verify focus highlight on arrival; select "Add income" / "Add asset" / "Add account" and verify the correct modal opens; log out and back in — recents are gone; switch accounts on same browser — no cross-user leakage.
- [ ] Design review: palette uses design-system tokens (no hex, no `rgba()`), Lucide icons only, no dashed borders.
- [ ] Accessibility: focus traps inside palette, Escape closes and restores focus to trigger, input has `aria-label`.

## Post-conditions

- [ ] Feature shipped: cross-app search is now available on desktop.
- [ ] `?focus=<id>` and `?add=<kind>` URL conventions are now established — future features can reuse them.
- [ ] Help-page match logic is now shared via `helpMatch.ts` — `HelpSidebar` can be refactored to consume this helper as a later tidy-up.
- [ ] Unblocks future mobile pass (separate spec) — backend + registries + hooks are platform-agnostic; only the trigger surface needs new design.
