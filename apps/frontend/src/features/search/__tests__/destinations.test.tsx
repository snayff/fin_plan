/**
 * Search destination contract. Every searchable kind and every create action
 * is opened on its real destination page — real hooks, services and router,
 * data served asynchronously by MSW like a cold deep link — and must land:
 * the result's row/detail shows, or the add form opens.
 *
 * Adding a kind to SearchResultKindEnum or an entry to CREATE_ACTIONS fails
 * here until it has a check below, so a destination can't ship unwired.
 */
import { describe, it, expect, afterEach } from "bun:test";
import type { ReactElement } from "react";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { SearchResultKindEnum, type SearchResult, type SearchResultKind } from "@finplan/shared";
import { server } from "@/test/msw/server";
import TierPage from "@/components/tier/TierPage";
import AssetsPage from "@/pages/AssetsPage";
import GiftsPage from "@/pages/GiftsPage";
import { RESULT_DESTINATIONS } from "../destinations";
import { CREATE_ACTIONS, type PaletteAction } from "../actions";

const API = "http://localhost:3001/api";
const NOW = "2026-10-01T00:00:00.000Z";

// ─── Fixtures: every target lives in a NON-default panel ─────────────────────

const subcategories = (tier: string) => [
  { id: `${tier}-sub-1`, name: "First", tier, sortOrder: 0, isLocked: false, isDefault: true },
  { id: `${tier}-sub-2`, name: "Second", tier, sortOrder: 1, isLocked: false, isDefault: true },
];

const tierItem = (tier: string, id: string, subcategoryId: string) => ({
  id,
  householdId: "hh",
  subcategoryId,
  name: `Item ${id}`,
  amount: 100,
  spendType: "monthly",
  frequency: "monthly",
  incomeType: "other",
  notes: null,
  memberId: null,
  dueDate: NOW,
  sortOrder: 0,
  lastReviewedAt: NOW,
  createdAt: NOW,
  updatedAt: NOW,
  isPlannerOwned: false,
  linkedAccountId: null,
  linkedAccount: null,
  lifecycleState: "active",
  periods: [{ id: `p-${id}`, startDate: NOW, endDate: null, amount: 100 }],
  tier,
});

const holding = (id: string, type: string) => ({
  id,
  name: `Holding ${id}`,
  type,
  householdId: "hh",
  memberId: null,
  growthRatePct: null,
  lastReviewedAt: NOW,
  disposedAt: null,
  disposalAccountId: null,
  createdAt: NOW,
  updatedAt: NOW,
  currentBalance: 1000,
  currentBalanceDate: NOW,
  balances: [],
  monthlyContribution: 0,
  monthlyContributionLimit: null,
  isISA: false,
  isaYearContribution: null,
  spareMonthly: null,
  isOverCap: false,
  hasSpareCapacityNudge: false,
  higherRateTarget: null,
  effectiveGrowthRatePct: null,
  linkedItems: [],
});

const giftPerson = {
  id: "gp-1",
  name: "Aunt Clare",
  memberId: null,
  isHouseholdMember: false,
  plannedCount: 0,
  boughtCount: 0,
  plannedTotal: 0,
  spentTotal: 0,
  hasOverspend: false,
  sortOrder: 0,
  notes: null,
};

const giftEvent = {
  id: "ge-1",
  name: "Graduation",
  dateType: "personal",
  dateMonth: null,
  dateDay: null,
  isLocked: false,
  sortOrder: 0,
};

const TIERS = ["income", "committed", "discretionary"] as const;

function serveFixtures() {
  server.use(
    http.get(`${API}/waterfall/subcategories/:tier`, ({ params }) =>
      HttpResponse.json(subcategories(String(params.tier)))
    ),
    ...TIERS.map((tier) =>
      http.get(`${API}/waterfall/${tier}`, () =>
        HttpResponse.json([tierItem(tier, `${tier}-item`, `${tier}-sub-2`)])
      )
    ),
    http.get(`${API}/settings`, () => HttpResponse.json({ showPence: false })),
    http.get(`${API}/cashflow/shortfall`, () =>
      HttpResponse.json({ items: [], balanceToday: 0, lowest: null, daysToFirst: null })
    ),
    http.get(`${API}/assets/summary`, () =>
      HttpResponse.json({ grandTotal: 0, assetTotals: {}, accountTotals: {} })
    ),
    http.get(`${API}/assets/assets/:type`, ({ params }) =>
      HttpResponse.json(params.type === "Vehicle" ? [holding("asset-1", "Vehicle")] : [])
    ),
    http.get(`${API}/assets/accounts/:type`, ({ params }) =>
      HttpResponse.json(params.type === "Pension" ? [holding("account-1", "Pension")] : [])
    ),
    http.get(`${API}/gifts/settings`, () =>
      HttpResponse.json({ mode: "independent", syncedDiscretionaryItemId: null })
    ),
    http.get(`${API}/gifts/state`, () =>
      HttpResponse.json({
        mode: "independent",
        year: new Date().getFullYear(),
        isReadOnly: false,
        budget: {
          annualBudget: 0,
          planned: 0,
          spent: 0,
          plannedOverBudgetBy: 0,
          spentOverBudgetBy: 0,
        },
        people: [giftPerson],
        rolloverPending: false,
      })
    ),
    http.get(`${API}/gifts/people/:id`, () =>
      HttpResponse.json({ person: giftPerson, allocations: [] })
    ),
    http.get(`${API}/gifts/config/people`, () => HttpResponse.json([giftPerson])),
    http.get(`${API}/gifts/config/events`, () => HttpResponse.json([giftEvent])),
    http.get(`${API}/gifts/years`, () => HttpResponse.json([new Date().getFullYear()]))
  );
}

// ─── Destination pages ───────────────────────────────────────────────────────

const PAGES: Record<string, () => ReactElement> = {
  "/income": () => <TierPage tier="income" />,
  "/committed": () => <TierPage tier="committed" />,
  "/discretionary": () => <TierPage tier="discretionary" />,
  "/assets": () => <AssetsPage />,
  "/gifts": () => <GiftsPage />,
};

function openAt(route: string, params: Record<string, string>) {
  const page = PAGES[route];
  if (!page) throw new Error(`No destination page registered for ${route}`);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const search = new URLSearchParams(params).toString();
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`${route}${search ? `?${search}` : ""}`]}>
        <Routes>
          <Route path={route} element={page()} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/** The row marked for search focus renders and receives the highlight. */
async function expectFocused(id: string) {
  await waitFor(
    () => {
      const el = document.querySelector(`[data-search-focus="${id}"]`);
      expect(el).not.toBeNull();
      expect(el!.classList.contains("search-focus-pulse")).toBe(true);
    },
    { timeout: 3000 }
  );
}

const result = (kind: SearchResultKind, id: string, extra: Partial<SearchResult> = {}) =>
  ({ kind, id, name: id, subtitle: "", route: "", focusId: id, ...extra }) as SearchResult;

// ─── Per-kind and per-action checks (the contract) ───────────────────────────

const RESULT_CHECKS: Record<
  SearchResultKind,
  { result: SearchResult; lands: () => Promise<void> }
> = {
  income_source: {
    result: result("income_source", "income-item", { subcategoryId: "income-sub-2" }),
    lands: () => expectFocused("income-item"),
  },
  committed_item: {
    result: result("committed_item", "committed-item", { subcategoryId: "committed-sub-2" }),
    lands: () => expectFocused("committed-item"),
  },
  discretionary_item: {
    result: result("discretionary_item", "discretionary-item", {
      subcategoryId: "discretionary-sub-2",
    }),
    lands: () => expectFocused("discretionary-item"),
  },
  asset: {
    result: result("asset", "asset-1", { type: "Vehicle" }),
    lands: () => expectFocused("asset-1"),
  },
  account: {
    result: result("account", "account-1", { type: "Pension" }),
    lands: () => expectFocused("account-1"),
  },
  gift_person: {
    result: result("gift_person", "gp-1"),
    // The person's detail view (breadcrumb + name) replaces the people list.
    lands: async () => {
      await screen.findByTestId("gifts-breadcrumb-back");
      expect(screen.getByText("Aunt Clare")).toBeTruthy();
      expect(screen.queryByTestId("person-row-gp-1")).toBeNull();
    },
  },
  gift_event: {
    result: result("gift_event", "ge-1"),
    lands: () => expectFocused("ge-1"),
  },
};

const ADD_CHECKS: Record<string, () => Promise<void>> = {
  "create.income": async () => void (await screen.findByLabelText("Name")),
  "create.committed": async () => void (await screen.findByLabelText("Name")),
  "create.discretionary": async () => void (await screen.findByLabelText("Name")),
  "create.asset": async () => void (await screen.findByLabelText("Name")),
  "create.account": async () => void (await screen.findByLabelText("Name")),
  "create.gift-person": async () =>
    void (await screen.findByPlaceholderText("e.g. Mum, Best friend")),
  "create.gift-event": async () =>
    void (await screen.findByPlaceholderText("e.g. Halloween, Anniversary")),
};

afterEach(() => cleanup());

describe("search result destinations", () => {
  for (const kind of SearchResultKindEnum.options) {
    it(`${kind} lands on its row`, async () => {
      const check = RESULT_CHECKS[kind];
      expect(check, `no destination check for search kind "${kind}"`).toBeDefined();
      serveFixtures();
      const { route, params } = RESULT_DESTINATIONS[kind](check.result);
      openAt(route, params);
      await check.lands();
    });
  }
});

describe("create action destinations", () => {
  for (const action of CREATE_ACTIONS as PaletteAction[]) {
    it(`${action.id} opens its add form`, async () => {
      const check = ADD_CHECKS[action.id];
      expect(check, `no destination check for create action "${action.id}"`).toBeDefined();
      serveFixtures();
      openAt(action.route, { add: action.addParam ?? "" });
      await check!();
    });
  }
});
