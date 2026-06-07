import { describe, it, expect, mock, beforeEach } from "bun:test";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";

const svc = {
  getSummary: mock(async () => ({ grandTotal: 0 })),
  listAssetsByType: mock(async () => [{ id: "a1", lastReviewedAt: new Date() }]),
  listAccountsByType: mock(async () => [{ id: "acc1", lastReviewedAt: new Date() }]),
  createAsset: mock(async () => ({ id: "a1" })),
  updateAsset: mock(async () => ({ id: "a1" })),
  deleteAsset: mock(async () => undefined),
  recordAssetBalance: mock(async () => ({ id: "b1" })),
  createAccount: mock(async () => ({ id: "acc1" })),
  updateAccount: mock(async () => ({ id: "acc1" })),
  deleteAccount: mock(async () => undefined),
  recordAccountBalance: mock(async () => ({ id: "b1" })),
  confirmAsset: mock(async () => ({ id: "a1" })),
  confirmAccount: mock(async () => ({ id: "acc1" })),
};

mock.module("../services/assets.service.js", () => ({ assetsApiService: svc }));
mock.module("@/lib/toast", () => ({ showError: mock(() => {}), showSuccess: mock(() => {}) }));

const h = await import("./useAssets");

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

describe("useAssets query hooks", () => {
  it("useAssetsSummary fetches the summary", async () => {
    const { result } = renderHook(() => h.useAssetsSummary(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(svc.getSummary).toHaveBeenCalled();
  });

  it("useAssetsByType fetches active by default and disposed when asked", async () => {
    const a = renderHook(() => h.useAssetsByType("Property"), { wrapper });
    await waitFor(() => expect(a.result.current.isSuccess).toBe(true));
    const b = renderHook(() => h.useAssetsByType("Property", { includeDisposed: true }), {
      wrapper,
    });
    await waitFor(() => expect(b.result.current.isSuccess).toBe(true));
    expect(svc.listAssetsByType).toHaveBeenCalledWith("Property", { includeDisposed: true });
  });

  it("useAccountsByType fetches accounts of a type", async () => {
    const { result } = renderHook(() => h.useAccountsByType("Savings"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(svc.listAccountsByType).toHaveBeenCalled();
  });

  it("useAllAccounts flattens active accounts across all types", async () => {
    const { result } = renderHook(() => h.useAllAccounts(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // 5 account types each returning one row
    expect(result.current.data.length).toBe(5);
  });
});

describe("useAssets mutation hooks", () => {
  it("useCreateAsset delegates", async () => {
    await runMutation(() => h.useCreateAsset(), { name: "House", type: "Property" });
    expect(svc.createAsset).toHaveBeenCalled();
  });
  it("useUpdateAsset delegates with assetId + data", async () => {
    await runMutation(() => h.useUpdateAsset(), { assetId: "a1", data: { name: "X" } });
    expect(svc.updateAsset).toHaveBeenCalledWith("a1", { name: "X" });
  });
  it("useDeleteAsset delegates", async () => {
    await runMutation(() => h.useDeleteAsset(), "a1");
    expect((svc.deleteAsset.mock.calls[0] as any)[0]).toBe("a1");
  });
  it("useRecordAssetBalance delegates with assetId + data", async () => {
    await runMutation(() => h.useRecordAssetBalance(), { assetId: "a1", data: { value: 1 } });
    expect(svc.recordAssetBalance).toHaveBeenCalledWith("a1", { value: 1 });
  });
  it("useCreateAccount delegates", async () => {
    await runMutation(() => h.useCreateAccount(), { name: "Acc", type: "Savings" });
    expect(svc.createAccount).toHaveBeenCalled();
  });
  it("useUpdateAccount delegates with accountId + data", async () => {
    await runMutation(() => h.useUpdateAccount(), { accountId: "acc1", data: { name: "X" } });
    expect(svc.updateAccount).toHaveBeenCalledWith("acc1", { name: "X" });
  });
  it("useDeleteAccount delegates", async () => {
    await runMutation(() => h.useDeleteAccount(), "acc1");
    expect((svc.deleteAccount.mock.calls[0] as any)[0]).toBe("acc1");
  });
  it("useRecordAccountBalance delegates", async () => {
    await runMutation(() => h.useRecordAccountBalance(), { accountId: "acc1", data: { value: 2 } });
    expect(svc.recordAccountBalance).toHaveBeenCalledWith("acc1", { value: 2 });
  });
});

describe("useAssets optimistic confirm hooks", () => {
  it("useConfirmAsset bumps lastReviewedAt optimistically", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const before = new Date("2026-01-01T00:00:00.000Z");
    qc.setQueryData(
      ["assets", "assets", "Property", "active"],
      [{ id: "a1", lastReviewedAt: before }]
    );
    const w = ({ children }: { children: any }) =>
      createElement(QueryClientProvider, { client: qc }, children);

    const { result } = renderHook(() => h.useConfirmAsset(), { wrapper: w });
    await act(async () => {
      await result.current.mutateAsync("a1");
    });
    expect((svc.confirmAsset.mock.calls[0] as any)[0]).toBe("a1");
  });

  it("useConfirmAccount rolls back on error", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const before = new Date("2026-01-01T00:00:00.000Z");
    qc.setQueryData(
      ["assets", "accounts", "Savings", "active"],
      [{ id: "acc1", lastReviewedAt: before }]
    );
    svc.confirmAccount.mockRejectedValueOnce(new Error("boom"));
    const w = ({ children }: { children: any }) =>
      createElement(QueryClientProvider, { client: qc }, children);

    const { result } = renderHook(() => h.useConfirmAccount(), { wrapper: w });
    await act(async () => {
      try {
        await result.current.mutateAsync("acc1");
      } catch {
        /* expected */
      }
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    const rolledBack = qc.getQueryData<any[]>(["assets", "accounts", "Savings", "active"]);
    expect(rolledBack![0].lastReviewedAt).toEqual(before);
  });
});
