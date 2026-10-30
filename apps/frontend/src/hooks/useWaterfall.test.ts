import { describe, it, expect, mock } from "bun:test";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";

const mockConfirmIncome = mock(async () => ({ id: "x" }));
const mockShowError = mock((_msg: string) => {});

mock.module("@/services/waterfall.service", () => ({
  waterfallService: {
    confirmIncome: mockConfirmIncome,
    confirmCommitted: mock(async () => ({ id: "x" })),
    confirmYearly: mock(async () => ({ id: "x" })),
    confirmDiscretionary: mock(async () => ({ id: "x" })),
    confirmSavings: mock(async () => ({ id: "x" })),
    updateIncome: mock(async () => ({ id: "x" })),
    updateCommitted: mock(async () => ({ id: "x" })),
    updateYearly: mock(async () => ({ id: "x" })),
    updateDiscretionary: mock(async () => ({ id: "x" })),
    updateSavings: mock(async () => ({ id: "x" })),
  },
}));

mock.module("@/lib/toast", () => ({
  showError: mockShowError,
  showSuccess: mock(() => {}),
}));

const { useConfirmItem, useUpdateItem, useConfirmWaterfallItem, useTierUpdateItem } =
  await import("./useWaterfall");

/** Build a QueryClient whose invalidateQueries records every invalidated key. */
function makeSpyClient() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const keys: unknown[][] = [];
  const orig = qc.invalidateQueries.bind(qc);
  qc.invalidateQueries = ((arg: any) => {
    if (arg?.queryKey) keys.push(arg.queryKey);
    return orig(arg);
  }) as typeof qc.invalidateQueries;
  return { qc, keys };
}

/** True if `keys` contains an entry deep-equal to (or prefix-matching) `key`. */
function hasKey(keys: unknown[][], key: unknown[]): boolean {
  return keys.some(
    (k) =>
      k.length >= key.length && key.every((seg, i) => JSON.stringify(k[i]) === JSON.stringify(seg))
  );
}

function wrapper({ children }: { children: any }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("useConfirmItem onError", () => {
  it("calls showError with the API error message when the mutation fails", async () => {
    mockConfirmIncome.mockRejectedValueOnce(new Error("Network down"));
    mockShowError.mockClear();

    const { result } = renderHook(() => useConfirmItem(), { wrapper });
    await act(async () => {
      try {
        await result.current.mutateAsync({ type: "income_source", id: "i1" });
      } catch {
        /* expected */
      }
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockShowError).toHaveBeenCalledWith("Network down");
  });
});

describe("waterfallService.createSubcategory", () => {
  it("exists as a function (preserved from prior smoke test)", async () => {
    const mod = await import("@/services/waterfall.service");
    expect(typeof (mod.waterfallService as any).createSubcategory).toBeDefined();
  });
});

describe("useConfirmWaterfallItem optimistic", () => {
  it("bumps lastReviewedAt for the targeted row before server resolves", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const before = new Date("2026-01-01T00:00:00.000Z");
    qc.setQueryData(
      ["waterfall", "tier-items", "income"],
      [{ id: "i1", name: "Salary", lastReviewedAt: before, amount: 100 }]
    );

    let resolveConfirm: (v: unknown) => void;
    const mod = await import("@/services/waterfall.service");
    (mod.waterfallService.confirmIncome as any).mockImplementationOnce(
      () => new Promise((r) => (resolveConfirm = r))
    );

    const localWrapper = ({ children }: { children: any }) =>
      createElement(QueryClientProvider, { client: qc }, children);

    const { useConfirmWaterfallItem } = await import("./useWaterfall");
    const { result } = renderHook(() => useConfirmWaterfallItem("income", "i1"), {
      wrapper: localWrapper,
    });

    act(() => {
      result.current.mutate();
    });

    await waitFor(() => {
      const data = qc.getQueryData<any[]>(["waterfall", "tier-items", "income"]);
      const row = data?.find((r) => r.id === "i1");
      expect(new Date(row.lastReviewedAt).getTime()).toBeGreaterThan(before.getTime());
    });

    resolveConfirm!({});
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe("useWaterfall cache invalidation (PERF-3)", () => {
  it("edit mutation invalidates the full cashflow set (projection + month + shortfall)", async () => {
    const { qc, keys } = makeSpyClient();
    const localWrapper = ({ children }: { children: any }) =>
      createElement(QueryClientProvider, { client: qc }, children);

    const { result } = renderHook(() => useUpdateItem(), { wrapper: localWrapper });
    await act(async () => {
      await result.current.mutateAsync({ type: "income_source", id: "i1", data: { name: "New" } });
    });

    // Under-invalidation fix: editing income/bills must refresh the cashflow
    // projection and month views, not just the shortfall.
    expect(hasKey(keys, ["cashflow", "projection"])).toBe(true);
    expect(hasKey(keys, ["cashflow", "month"])).toBe(true);
    expect(hasKey(keys, ["cashflow", "shortfall"])).toBe(true);
    // Existing waterfall/forecast invalidations still fire.
    expect(hasKey(keys, ["waterfall", "summary"])).toBe(true);
    expect(hasKey(keys, ["forecast"])).toBe(true);
  });

  it("tier edit mutation invalidates the full cashflow set", async () => {
    const { qc, keys } = makeSpyClient();
    const localWrapper = ({ children }: { children: any }) =>
      createElement(QueryClientProvider, { client: qc }, children);

    const { result } = renderHook(() => useTierUpdateItem("committed", "c1"), {
      wrapper: localWrapper,
    });
    await act(async () => {
      await result.current.mutateAsync({ name: "New" });
    });

    expect(hasKey(keys, ["cashflow", "projection"])).toBe(true);
    expect(hasKey(keys, ["cashflow", "month"])).toBe(true);
    expect(hasKey(keys, ["cashflow", "shortfall"])).toBe(true);
  });

  it("confirm mutation (useConfirmItem) does NOT invalidate forecast/financial-summary/cashflow", async () => {
    const { qc, keys } = makeSpyClient();
    const localWrapper = ({ children }: { children: any }) =>
      createElement(QueryClientProvider, { client: qc }, children);

    const { result } = renderHook(() => useConfirmItem(), { wrapper: localWrapper });
    await act(async () => {
      await result.current.mutateAsync({ type: "income_source", id: "i1" });
    });

    // Over-invalidation fix: confirm only touches lastReviewedAt — no numbers
    // change, so downstream projections must NOT be invalidated.
    expect(hasKey(keys, ["forecast"])).toBe(false);
    expect(hasKey(keys, ["waterfall", "financial-summary"])).toBe(false);
    expect(hasKey(keys, ["cashflow", "shortfall"])).toBe(false);
    expect(hasKey(keys, ["cashflow", "projection"])).toBe(false);
    expect(hasKey(keys, ["cashflow", "month"])).toBe(false);
    // The review-state surfaces still refresh.
    expect(hasKey(keys, ["waterfall", "summary"])).toBe(true);
  });

  it("confirm mutation (useConfirmWaterfallItem) does NOT invalidate forecast/financial-summary/cashflow", async () => {
    const { qc, keys } = makeSpyClient();
    const localWrapper = ({ children }: { children: any }) =>
      createElement(QueryClientProvider, { client: qc }, children);

    const { result } = renderHook(() => useConfirmWaterfallItem("income", "i1"), {
      wrapper: localWrapper,
    });
    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(hasKey(keys, ["forecast"])).toBe(false);
    expect(hasKey(keys, ["waterfall", "financial-summary"])).toBe(false);
    expect(hasKey(keys, ["cashflow", "shortfall"])).toBe(false);
    // Review-state surfaces (summary + the tier-items row) still refresh.
    expect(hasKey(keys, ["waterfall", "summary"])).toBe(true);
    expect(hasKey(keys, ["waterfall", "tier-items", "income"])).toBe(true);
  });
});
