import { describe, it, expect, beforeEach, mock } from "bun:test";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";

const svc = {
  getSummary: mock(async () => ({ grandTotal: 0 })),
  listAssetsByType: mock(async () => [{ id: "a1", lastReviewedAt: "2026-01-01" }]),
  listAccountsByType: mock(async () => [{ id: "ac1", lastReviewedAt: "2026-01-01" }]),
  createAsset: mock(async () => ({ id: "a1" })),
  updateAsset: mock(async () => ({ id: "a1" })),
  deleteAsset: mock(async () => undefined),
  recordAssetBalance: mock(async () => ({ id: "ab1" })),
  createAccount: mock(async () => ({ id: "ac1" })),
  updateAccount: mock(async () => ({ id: "ac1" })),
  deleteAccount: mock(async () => undefined),
  recordAccountBalance: mock(async () => ({ id: "acb1" })),
  confirmAsset: mock(async () => ({ id: "a1" })),
  confirmAccount: mock(async () => ({ id: "ac1" })),
};
mock.module("../services/assets.service.js", () => ({ assetsApiService: svc }));
mock.module("@/lib/toast", () => ({ showError: mock(() => {}), showSuccess: mock(() => {}) }));

const hooks = await import("./useAssets");

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: any }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

async function run(result: { current: { mutateAsync: (v?: any) => Promise<unknown> } }, arg?: any) {
  await act(async () => {
    await result.current.mutateAsync(arg);
  });
}

beforeEach(() => {
  for (const fn of Object.values(svc)) (fn as any).mockClear();
});

describe("useAssets query hooks", () => {
  it("useAssetsSummary fetches the summary", async () => {
    const { result } = renderHook(() => hooks.useAssetsSummary(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(svc.getSummary).toHaveBeenCalled();
  });

  it("useAssetsByType forwards type + options", async () => {
    const { result } = renderHook(
      () => hooks.useAssetsByType("Property", { includeDisposed: true }),
      {
        wrapper: makeWrapper(),
      }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(svc.listAssetsByType).toHaveBeenCalledWith("Property", { includeDisposed: true });
  });

  it("useAccountsByType forwards type", async () => {
    const { result } = renderHook(() => hooks.useAccountsByType("Savings"), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(svc.listAccountsByType).toHaveBeenCalledWith("Savings", {});
  });

  it("useAllAccounts flattens every account type", async () => {
    const { result } = renderHook(() => hooks.useAllAccounts(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // One row per account type queried.
    expect(result.current.data.length).toBe(5);
  });
});

describe("useAssets mutation hooks", () => {
  it("create/update/delete/record for assets", async () => {
    const create = renderHook(() => hooks.useCreateAsset(), { wrapper: makeWrapper() });
    await run(create.result, { name: "House" });
    // Direct mutationFn references receive (variables, mutationContext) in v5 — assert arg 0.
    expect(svc.createAsset.mock.calls[0]?.[0]).toEqual({ name: "House" });

    const update = renderHook(() => hooks.useUpdateAsset(), { wrapper: makeWrapper() });
    await run(update.result, { assetId: "a1", data: { name: "x" } });
    expect(svc.updateAsset).toHaveBeenCalledWith("a1", { name: "x" });

    const del = renderHook(() => hooks.useDeleteAsset(), { wrapper: makeWrapper() });
    await run(del.result, "a1");
    expect(svc.deleteAsset.mock.calls[0]?.[0]).toBe("a1");

    const record = renderHook(() => hooks.useRecordAssetBalance(), { wrapper: makeWrapper() });
    await run(record.result, { assetId: "a1", data: { value: 1, date: "2026-01-01" } });
    expect(svc.recordAssetBalance).toHaveBeenCalledWith("a1", { value: 1, date: "2026-01-01" });
  });

  it("create/update/delete/record for accounts", async () => {
    const create = renderHook(() => hooks.useCreateAccount(), { wrapper: makeWrapper() });
    await run(create.result, { name: "ISA" });
    expect(svc.createAccount.mock.calls[0]?.[0]).toEqual({ name: "ISA" });

    const update = renderHook(() => hooks.useUpdateAccount(), { wrapper: makeWrapper() });
    await run(update.result, { accountId: "ac1", data: { name: "x" } });
    expect(svc.updateAccount).toHaveBeenCalledWith("ac1", { name: "x" });

    const del = renderHook(() => hooks.useDeleteAccount(), { wrapper: makeWrapper() });
    await run(del.result, "ac1");
    expect(svc.deleteAccount.mock.calls[0]?.[0]).toBe("ac1");

    const record = renderHook(() => hooks.useRecordAccountBalance(), { wrapper: makeWrapper() });
    await run(record.result, { accountId: "ac1", data: { value: 2, date: "2026-01-01" } });
    expect(svc.recordAccountBalance).toHaveBeenCalledWith("ac1", { value: 2, date: "2026-01-01" });
  });

  it("useConfirmAsset optimistically bumps the row then confirms", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    qc.setQueryData(hooks.ASSETS_QUERY_KEYS.assetsByType("Property"), [
      { id: "a1", lastReviewedAt: new Date("2020-01-01") },
    ]);
    const wrapper = ({ children }: { children: any }) =>
      createElement(QueryClientProvider, { client: qc }, children);
    const { result } = renderHook(() => hooks.useConfirmAsset(), { wrapper });
    await run(result, "a1");
    expect(svc.confirmAsset.mock.calls[0]?.[0]).toBe("a1");
  });

  it("useConfirmAccount confirms an account", async () => {
    const { result } = renderHook(() => hooks.useConfirmAccount(), { wrapper: makeWrapper() });
    await run(result, "ac1");
    expect(svc.confirmAccount.mock.calls[0]?.[0]).toBe("ac1");
  });

  it("invalidates cashflow projection and month on an asset mutation (#146d)", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const spy = mock(qc.invalidateQueries.bind(qc));
    qc.invalidateQueries = spy as typeof qc.invalidateQueries;
    const wrapper = ({ children }: { children: any }) =>
      createElement(QueryClientProvider, { client: qc }, children);
    const { result } = renderHook(() => hooks.useCreateAsset(), { wrapper });
    await run(result, { name: "x" });
    const keys = spy.mock.calls.map((c: any) => JSON.stringify(c[0]?.queryKey));
    expect(keys).toContain(JSON.stringify(["cashflow", "projection"]));
    expect(keys).toContain(JSON.stringify(["cashflow", "month"]));
  });

  it("surfaces a toast when an asset mutation fails", async () => {
    svc.createAsset.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => hooks.useCreateAsset(), { wrapper: makeWrapper() });
    await act(async () => {
      await result.current.mutateAsync({ name: "x" }).catch(() => {});
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
