import { describe, it, expect, beforeEach, mock } from "bun:test";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";

// Full waterfall.service mock so every hook's queryFn / mutationFn resolves.
const svc = {
  getSummary: mock(async () => ({ tiers: [] })),
  getFinancialSummary: mock(async () => ({ netWorth: 0 })),
  getHistory: mock(async () => [{ id: "h1" }]),
  getSubcategories: mock(async () => [{ id: "sub-1", name: "General" }]),
  listIncome: mock(async () => [
    {
      id: "i1",
      name: "Salary",
      amount: 100,
      frequency: "annual",
      lastReviewedAt: "2026-01-01",
      createdAt: "2026-01-01",
      periods: [],
    },
  ]),
  listCommitted: mock(async () => [
    {
      id: "c1",
      name: "Rent",
      amount: 50,
      spendType: "monthly",
      lastReviewedAt: "2026-01-01",
      createdAt: "2026-01-01",
      periods: [],
    },
  ]),
  listDiscretionary: mock(async () => [
    {
      id: "d1",
      name: "Food",
      amount: 30,
      spendType: "monthly",
      lastReviewedAt: "2026-01-01",
      createdAt: "2026-01-01",
      periods: [],
    },
  ]),
  createIncome: mock(async () => ({ id: "i1" })),
  createCommitted: mock(async () => ({ id: "c1" })),
  createDiscretionary: mock(async () => ({ id: "d1" })),
  updateIncome: mock(async () => ({ id: "i1" })),
  updateCommitted: mock(async () => ({ id: "c1" })),
  updateYearly: mock(async () => ({ id: "y1" })),
  updateDiscretionary: mock(async () => ({ id: "d1" })),
  updateSavings: mock(async () => ({ id: "s1" })),
  deleteIncome: mock(async () => undefined),
  deleteCommitted: mock(async () => undefined),
  deleteDiscretionary: mock(async () => undefined),
  createSubcategory: mock(async () => ({ id: "sub-2" })),
  listPeriods: mock(async () => [{ id: "p1" }]),
  createPeriod: mock(async () => ({ id: "p1" })),
  updatePeriod: mock(async () => ({ id: "p1" })),
  deletePeriod: mock(async () => undefined),
  deleteAll: mock(async () => undefined),
  confirmIncome: mock(async () => ({ id: "i1" })),
  confirmCommitted: mock(async () => ({ id: "c1" })),
  confirmDiscretionary: mock(async () => ({ id: "d1" })),
};
mock.module("@/services/waterfall.service", () => ({ waterfallService: svc }));
mock.module("@/lib/toast", () => ({ showError: mock(() => {}), showSuccess: mock(() => {}) }));

const hooks = await import("./useWaterfall");

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: any }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  for (const fn of Object.values(svc)) (fn as any).mockClear();
});

// ─── Query hooks ────────────────────────────────────────────────────────────────

describe("useWaterfall query hooks", () => {
  it("useWaterfallSummary fetches the summary", async () => {
    const { result } = renderHook(() => hooks.useWaterfallSummary(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(svc.getSummary).toHaveBeenCalled();
  });

  it("useFinancialSummary fetches the financial summary", async () => {
    const { result } = renderHook(() => hooks.useFinancialSummary(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(svc.getFinancialSummary).toHaveBeenCalled();
  });

  it("useItemHistory fetches history when an id is provided", async () => {
    const { result } = renderHook(() => hooks.useItemHistory("income_source", "i1"), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(svc.getHistory).toHaveBeenCalledWith("income_source", "i1");
  });

  it("useItemHistory stays disabled with an empty id", () => {
    const { result } = renderHook(() => hooks.useItemHistory("income_source", ""), {
      wrapper: makeWrapper(),
    });
    expect(result.current.fetchStatus).toBe("idle");
    expect(svc.getHistory).not.toHaveBeenCalled();
  });

  it("useSubcategories fetches subcategories for a tier", async () => {
    const { result } = renderHook(() => hooks.useSubcategories("committed"), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(svc.getSubcategories).toHaveBeenCalledWith("committed");
  });

  it.each(["income", "committed", "discretionary"] as const)(
    "useTierItems maps %s rows",
    async (tier) => {
      const { result } = renderHook(() => hooks.useTierItems(tier), { wrapper: makeWrapper() });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.[0]).toHaveProperty("lastReviewedAt");
    }
  );

  it("usePeriods fetches periods for an item", async () => {
    const { result } = renderHook(() => hooks.usePeriods("income_source", "i1"), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(svc.listPeriods).toHaveBeenCalledWith("income_source", "i1");
  });

  it("useFullWaterfall aggregates summary, subcategories and items", async () => {
    const { result } = renderHook(() => hooks.useFullWaterfall(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items.income.length).toBeGreaterThan(0);
    expect(result.current.isError).toBe(false);
  });
});

// ─── Mutation hooks ─────────────────────────────────────────────────────────────

async function runMutation(
  hookResult: { current: { mutateAsync: (v?: any) => Promise<unknown> } },
  arg?: any
) {
  await act(async () => {
    await hookResult.current.mutateAsync(arg);
  });
}

describe("useWaterfall mutation hooks", () => {
  it("useUpdateItem routes each item type to the matching service call", async () => {
    const { result } = renderHook(() => hooks.useUpdateItem(), { wrapper: makeWrapper() });
    await runMutation(result, { type: "income_source", id: "i1", data: { name: "x" } });
    await runMutation(result, { type: "yearly_bill", id: "y1", data: { name: "x" } });
    await runMutation(result, { type: "savings_allocation", id: "s1", data: { name: "x" } });
    expect(svc.updateIncome).toHaveBeenCalledWith("i1", { name: "x" });
    expect(svc.updateYearly).toHaveBeenCalledWith("y1", { name: "x" });
    expect(svc.updateSavings).toHaveBeenCalledWith("s1", { name: "x" });
  });

  it("useCreateItem maps income spendType to frequency and routes committed/discretionary", async () => {
    const inc = renderHook(() => hooks.useCreateItem("income"), { wrapper: makeWrapper() });
    await runMutation(inc.result, { spendType: "monthly", name: "Pay", amount: 1 });
    expect(svc.createIncome).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Pay", frequency: "monthly" })
    );

    const com = renderHook(() => hooks.useCreateItem("committed"), { wrapper: makeWrapper() });
    await runMutation(com.result, { name: "Rent" });
    expect(svc.createCommitted).toHaveBeenCalled();

    const dis = renderHook(() => hooks.useCreateItem("discretionary"), { wrapper: makeWrapper() });
    await runMutation(dis.result, { name: "Food" });
    expect(svc.createDiscretionary).toHaveBeenCalled();
  });

  it("useDeleteItem deletes per tier and rejects when no id is supplied", async () => {
    const ok = renderHook(() => hooks.useDeleteItem("committed", "c1"), { wrapper: makeWrapper() });
    await runMutation(ok.result);
    expect(svc.deleteCommitted).toHaveBeenCalledWith("c1");

    const noId = renderHook(() => hooks.useDeleteItem("income", ""), { wrapper: makeWrapper() });
    await act(async () => {
      await noId.result.current.mutateAsync().catch(() => {});
    });
    await waitFor(() => expect(noId.result.current.isError).toBe(true));
  });

  it("useTierUpdateItem updates the targeted tier item", async () => {
    const { result } = renderHook(() => hooks.useTierUpdateItem("discretionary", "d1"), {
      wrapper: makeWrapper(),
    });
    await runMutation(result, { name: "x" });
    expect(svc.updateDiscretionary).toHaveBeenCalledWith("d1", { name: "x" });
  });

  it("useCreateSubcategory creates a subcategory for the tier", async () => {
    const { result } = renderHook(() => hooks.useCreateSubcategory("income"), {
      wrapper: makeWrapper(),
    });
    await runMutation(result, "Bonuses");
    expect(svc.createSubcategory).toHaveBeenCalledWith("income", "Bonuses");
  });

  it("period mutations call through with itemType/itemId context", async () => {
    const create = renderHook(() => hooks.useCreatePeriod("income_source", "i1"), {
      wrapper: makeWrapper(),
    });
    await runMutation(create.result, { amount: 5, startDate: "2026-01-01" });
    expect(svc.createPeriod).toHaveBeenCalledWith(
      expect.objectContaining({ itemType: "income_source", itemId: "i1", amount: 5 })
    );

    const update = renderHook(() => hooks.useUpdatePeriod("income_source", "i1"), {
      wrapper: makeWrapper(),
    });
    await runMutation(update.result, { id: "p1", data: { amount: 9 } });
    expect(svc.updatePeriod).toHaveBeenCalledWith("p1", { amount: 9 });

    const del = renderHook(() => hooks.useDeletePeriod("income_source", "i1"), {
      wrapper: makeWrapper(),
    });
    await runMutation(del.result, "p1");
    expect(svc.deletePeriod).toHaveBeenCalledWith("p1");
  });

  it("useDeleteAllWaterfall wipes all waterfall data", async () => {
    const { result } = renderHook(() => hooks.useDeleteAllWaterfall(), { wrapper: makeWrapper() });
    await runMutation(result);
    expect(svc.deleteAll).toHaveBeenCalled();
  });
});
