import { describe, it, expect, mock, beforeEach } from "bun:test";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";

const svc = {
  getSummary: mock(async () => ({ income: {} })),
  getFinancialSummary: mock(async () => ({ netWorth: 0 })),
  getHistory: mock(async () => [{ id: "h1" }]),
  getSubcategories: mock(async () => [{ id: "s1", name: "Salary" }]),
  confirmIncome: mock(async () => ({ id: "x" })),
  confirmCommitted: mock(async () => ({ id: "x" })),
  confirmYearly: mock(async () => ({ id: "x" })),
  confirmDiscretionary: mock(async () => ({ id: "x" })),
  confirmSavings: mock(async () => ({ id: "x" })),
  updateIncome: mock(async () => ({ id: "x" })),
  updateCommitted: mock(async () => ({ id: "x" })),
  updateYearly: mock(async () => ({ id: "x" })),
  updateDiscretionary: mock(async () => ({ id: "x" })),
  updateSavings: mock(async () => ({ id: "x" })),
  createIncome: mock(async () => ({ id: "x" })),
  createCommitted: mock(async () => ({ id: "x" })),
  createDiscretionary: mock(async () => ({ id: "x" })),
  deleteIncome: mock(async () => ({ id: "x" })),
  deleteCommitted: mock(async () => ({ id: "x" })),
  deleteDiscretionary: mock(async () => ({ id: "x" })),
  listIncome: mock(async () => [
    {
      id: "i1",
      name: "Salary",
      amount: 100,
      frequency: "annual",
      lastReviewedAt: new Date(),
      createdAt: new Date(),
      periods: [{ id: "p1", startDate: new Date("2030-01-01"), endDate: null, amount: 100 }],
    },
  ]),
  listCommitted: mock(async () => [
    {
      id: "c1",
      name: "Rent",
      amount: 50,
      spendType: "monthly",
      lastReviewedAt: new Date(),
      createdAt: new Date(),
    },
  ]),
  listDiscretionary: mock(async () => [
    {
      id: "d1",
      name: "Fun",
      amount: 20,
      spendType: "monthly",
      lastReviewedAt: new Date(),
      createdAt: new Date(),
    },
  ]),
  createSubcategory: mock(async () => ({ id: "sub-new" })),
  listPeriods: mock(async () => [{ id: "p1" }]),
  createPeriod: mock(async () => ({ id: "p1" })),
  updatePeriod: mock(async () => ({ id: "p1" })),
  deletePeriod: mock(async () => ({ id: "p1" })),
  deleteAll: mock(async () => ({ ok: true })),
};

mock.module("@/services/waterfall.service", () => ({ waterfallService: svc }));
mock.module("@/lib/toast", () => ({ showError: mock(() => {}), showSuccess: mock(() => {}) }));

const wf = await import("./useWaterfall");

function wrapper({ children }: { children: any }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  for (const fn of Object.values(svc)) (fn as any).mockClear?.();
});

async function runMutation(hookFn: () => any, vars?: unknown) {
  const { result } = renderHook(hookFn, { wrapper });
  await act(async () => {
    await result.current.mutateAsync(vars);
  });
  return result;
}

describe("useWaterfall query hooks", () => {
  it("useWaterfallSummary fetches the summary", async () => {
    const { result } = renderHook(() => wf.useWaterfallSummary(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(svc.getSummary).toHaveBeenCalled();
  });

  it("useFinancialSummary fetches the financial summary", async () => {
    const { result } = renderHook(() => wf.useFinancialSummary(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(svc.getFinancialSummary).toHaveBeenCalled();
  });

  it("useItemHistory is disabled without an id and fetches with one", async () => {
    const disabled = renderHook(() => wf.useItemHistory("income_source", ""), { wrapper });
    expect(disabled.result.current.fetchStatus).toBe("idle");

    const { result } = renderHook(() => wf.useItemHistory("income_source", "i1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(svc.getHistory).toHaveBeenCalledWith("income_source", "i1");
  });

  it("useSubcategories fetches subcategories for a tier", async () => {
    const { result } = renderHook(() => wf.useSubcategories("income"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(svc.getSubcategories).toHaveBeenCalledWith("income");
  });

  it("useTierItems maps income/committed/discretionary rows", async () => {
    for (const tier of ["income", "committed", "discretionary"] as const) {
      const { result } = renderHook(() => wf.useTierItems(tier), { wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data!.length).toBeGreaterThan(0);
    }
    expect(svc.listIncome).toHaveBeenCalled();
    expect(svc.listCommitted).toHaveBeenCalled();
    expect(svc.listDiscretionary).toHaveBeenCalled();
  });

  it("useFullWaterfall aggregates summary + subcategories + items", async () => {
    const { result } = renderHook(() => wf.useFullWaterfall(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.items.income.length).toBeGreaterThan(0);
  });

  it("usePeriods fetches when an itemId is present", async () => {
    const { result } = renderHook(() => wf.usePeriods("income_source", "i1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(svc.listPeriods).toHaveBeenCalledWith("income_source", "i1");
  });
});

describe("useConfirmItem — all segments", () => {
  it.each([
    ["income_source", "confirmIncome"],
    ["committed_bill", "confirmCommitted"],
    ["yearly_bill", "confirmYearly"],
    ["discretionary_category", "confirmDiscretionary"],
    ["savings_allocation", "confirmSavings"],
  ] as const)("routes %s to %s", async (type, method) => {
    await runMutation(() => wf.useConfirmItem(), { type, id: "x" });
    expect((svc as any)[method]).toHaveBeenCalledWith("x");
  });

  it("rejects an unknown type", async () => {
    const { result } = renderHook(() => wf.useConfirmItem(), { wrapper });
    await act(async () => {
      await expect(
        result.current.mutateAsync({ type: "nope" as any, id: "x" })
      ).rejects.toBeInstanceOf(Error);
    });
  });
});

describe("useUpdateItem — all segments", () => {
  it.each([
    ["income_source", "updateIncome"],
    ["committed_bill", "updateCommitted"],
    ["yearly_bill", "updateYearly"],
    ["discretionary_category", "updateDiscretionary"],
    ["savings_allocation", "updateSavings"],
  ] as const)("routes %s to %s", async (type, method) => {
    await runMutation(() => wf.useUpdateItem(), { type, id: "x", data: { name: "n" } });
    expect((svc as any)[method]).toHaveBeenCalled();
  });
});

describe("useCreateItem — per tier", () => {
  it("income maps spendType to frequency", async () => {
    await runMutation(() => wf.useCreateItem("income"), { spendType: "yearly", name: "Bonus" });
    expect(svc.createIncome).toHaveBeenCalledWith(
      expect.objectContaining({ frequency: "annual", name: "Bonus" })
    );
  });
  it("committed delegates to createCommitted", async () => {
    await runMutation(() => wf.useCreateItem("committed"), { name: "Rent" });
    expect(svc.createCommitted).toHaveBeenCalled();
  });
  it("discretionary delegates to createDiscretionary", async () => {
    await runMutation(() => wf.useCreateItem("discretionary"), { name: "Fun" });
    expect(svc.createDiscretionary).toHaveBeenCalled();
  });
});

describe("useConfirmWaterfallItem — optimistic per tier", () => {
  it.each([
    ["income", "confirmIncome"],
    ["committed", "confirmCommitted"],
    ["discretionary", "confirmDiscretionary"],
  ] as const)("confirms %s", async (tier, method) => {
    await runMutation(() => wf.useConfirmWaterfallItem(tier, "x"));
    expect((svc as any)[method]).toHaveBeenCalledWith("x");
  });
});

describe("useDeleteItem", () => {
  it.each([
    ["income", "deleteIncome"],
    ["committed", "deleteCommitted"],
    ["discretionary", "deleteDiscretionary"],
  ] as const)("deletes %s", async (tier, method) => {
    await runMutation(() => wf.useDeleteItem(tier, "x"));
    expect((svc as any)[method]).toHaveBeenCalledWith("x");
  });

  it("rejects when no id is provided", async () => {
    const { result } = renderHook(() => wf.useDeleteItem("income", ""), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toBeInstanceOf(Error);
    });
  });
});

describe("useTierUpdateItem", () => {
  it.each([
    ["income", "updateIncome"],
    ["committed", "updateCommitted"],
    ["discretionary", "updateDiscretionary"],
  ] as const)("updates %s", async (tier, method) => {
    await runMutation(() => wf.useTierUpdateItem(tier, "x"), { name: "n" });
    expect((svc as any)[method]).toHaveBeenCalled();
  });
});

describe("period + subcategory + bulk mutations", () => {
  it("useCreateSubcategory delegates and invalidates", async () => {
    await runMutation(() => wf.useCreateSubcategory("income"), "New Sub");
    expect(svc.createSubcategory).toHaveBeenCalledWith("income", "New Sub");
  });
  it("useCreatePeriod attaches itemType/itemId", async () => {
    await runMutation(() => wf.useCreatePeriod("income_source", "i1"), {
      amount: 5,
      startDate: new Date(),
    });
    expect(svc.createPeriod).toHaveBeenCalledWith(
      expect.objectContaining({ itemType: "income_source", itemId: "i1" })
    );
  });
  it("useUpdatePeriod delegates", async () => {
    await runMutation(() => wf.useUpdatePeriod("income_source", "i1"), { id: "p1", data: {} });
    expect(svc.updatePeriod).toHaveBeenCalled();
  });
  it("useDeletePeriod delegates", async () => {
    await runMutation(() => wf.useDeletePeriod("income_source", "i1"), "p1");
    expect(svc.deletePeriod).toHaveBeenCalledWith("p1");
  });
  it("useDeleteAllWaterfall delegates", async () => {
    await runMutation(() => wf.useDeleteAllWaterfall());
    expect(svc.deleteAll).toHaveBeenCalled();
  });
});
