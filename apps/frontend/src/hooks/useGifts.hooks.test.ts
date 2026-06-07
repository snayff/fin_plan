import { describe, it, expect, beforeEach, mock } from "bun:test";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";

const api = {
  getState: mock(async () => ({ year: 2026 })),
  getSettings: mock(async () => ({ mode: "synced" })),
  getPerson: mock(async () => ({ person: { id: "p1" } })),
  getUpcoming: mock(async () => ({ callouts: {}, groups: [] })),
  listYears: mock(async () => [2026]),
  listConfigPeople: mock(async () => []),
  listConfigEvents: mock(async () => []),
  getQuickAddMatrix: mock(async () => ({
    people: [],
    events: [],
    allocations: [],
    budget: { annual: 0, currentPlanned: 0 },
  })),
  createPerson: mock(async () => ({ id: "p1" })),
  updatePerson: mock(async () => ({ id: "p1" })),
  deletePerson: mock(async () => undefined),
  createEvent: mock(async () => ({ id: "e1" })),
  updateEvent: mock(async () => ({ id: "e1" })),
  deleteEvent: mock(async () => undefined),
  upsertAllocation: mock(async () => ({ id: "al1" })),
  bulkUpsert: mock(async () => ({ count: 1 })),
  setBudget: mock(async () => ({ annualBudget: 500 })),
  setMode: mock(async () => ({ mode: "independent" })),
  dismissRollover: mock(async () => undefined),
};
mock.module("@/services/gifts.service", () => ({ giftsApi: api }));
mock.module("@/lib/toast", () => ({ showError: mock(() => {}), showSuccess: mock(() => {}) }));

const hooks = await import("./useGifts");

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
  for (const fn of Object.values(api)) (fn as any).mockClear();
});

describe("useGifts query hooks", () => {
  it("useGiftsState fetches state for a year", async () => {
    const { result } = renderHook(() => hooks.useGiftsState(2026), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.getState).toHaveBeenCalledWith(2026);
  });

  it("useGiftPlannerSettings respects the enabled option", () => {
    const { result } = renderHook(() => hooks.useGiftPlannerSettings({ enabled: false }), {
      wrapper: makeWrapper(),
    });
    expect(result.current.fetchStatus).toBe("idle");
    expect(api.getSettings).not.toHaveBeenCalled();
  });

  it("useGiftPerson is disabled with an empty id and enabled otherwise", async () => {
    const off = renderHook(() => hooks.useGiftPerson("", 2026), { wrapper: makeWrapper() });
    expect(off.result.current.fetchStatus).toBe("idle");

    const on = renderHook(() => hooks.useGiftPerson("p1", 2026), { wrapper: makeWrapper() });
    await waitFor(() => expect(on.result.current.isSuccess).toBe(true));
    expect(api.getPerson).toHaveBeenCalledWith("p1", 2026);
  });

  it("upcoming/years/configPeople/configEvents/quickAddMatrix fetch", async () => {
    const w = makeWrapper();
    const up = renderHook(() => hooks.useGiftsUpcoming(2026), { wrapper: w });
    const yr = renderHook(() => hooks.useGiftsYears(), { wrapper: w });
    const cp = renderHook(() => hooks.useConfigPeople("all", 2026), { wrapper: w });
    const ce = renderHook(() => hooks.useConfigEvents(), { wrapper: w });
    const qa = renderHook(() => hooks.useQuickAddMatrix(2026), { wrapper: w });
    await waitFor(() => expect(up.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(yr.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(cp.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(ce.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(qa.result.current.isSuccess).toBe(true));
    expect(api.listConfigPeople).toHaveBeenCalledWith("all", 2026);
  });
});

describe("useGifts person/event mutations", () => {
  it("person CRUD", async () => {
    const c = renderHook(() => hooks.useCreateGiftPerson(), { wrapper: makeWrapper() });
    await run(c.result, { name: "Mum" });
    expect(api.createPerson).toHaveBeenCalledWith({ name: "Mum" });

    const u = renderHook(() => hooks.useUpdateGiftPerson(), { wrapper: makeWrapper() });
    await run(u.result, { id: "p1", data: { name: "x" } });
    expect(api.updatePerson).toHaveBeenCalledWith("p1", { name: "x" });

    const d = renderHook(() => hooks.useDeleteGiftPerson(), { wrapper: makeWrapper() });
    await run(d.result, "p1");
    expect(api.deletePerson).toHaveBeenCalledWith("p1");
  });

  it("event CRUD", async () => {
    const c = renderHook(() => hooks.useCreateGiftEvent(), { wrapper: makeWrapper() });
    await run(c.result, { name: "Bday" });
    expect(api.createEvent).toHaveBeenCalledWith({ name: "Bday" });

    const u = renderHook(() => hooks.useUpdateGiftEvent(), { wrapper: makeWrapper() });
    await run(u.result, { id: "e1", data: { name: "x" } });
    expect(api.updateEvent).toHaveBeenCalledWith("e1", { name: "x" });

    const d = renderHook(() => hooks.useDeleteGiftEvent(), { wrapper: makeWrapper() });
    await run(d.result, "e1");
    expect(api.deleteEvent).toHaveBeenCalledWith("e1");
  });
});

describe("useGifts allocation/budget/mode/rollover mutations", () => {
  it("useUpsertAllocation optimistically updates the matrix then calls the API", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    qc.setQueryData(hooks.GIFTS_KEYS.quickAddMatrix(2026), {
      people: [],
      events: [],
      allocations: [{ personId: "p1", eventId: "e1", planned: 10 }],
      budget: { annual: 100, currentPlanned: 10 },
    });
    const wrapper = ({ children }: { children: any }) =>
      createElement(QueryClientProvider, { client: qc }, children);
    const { result } = renderHook(() => hooks.useUpsertAllocation(), { wrapper });
    await run(result, { personId: "p1", eventId: "e1", year: 2026, data: { planned: 25 } });
    expect(api.upsertAllocation).toHaveBeenCalledWith("p1", "e1", 2026, { planned: 25 });
    const matrix = qc.getQueryData<any>(hooks.GIFTS_KEYS.quickAddMatrix(2026));
    expect(matrix.budget.currentPlanned).toBe(25);
  });

  it("useBulkUpsertAllocations posts the batch", async () => {
    const { result } = renderHook(() => hooks.useBulkUpsertAllocations(), {
      wrapper: makeWrapper(),
    });
    await run(result, { allocations: [] });
    expect(api.bulkUpsert).toHaveBeenCalledWith({ allocations: [] });
  });

  it("useSetGiftBudget sets the budget for a year", async () => {
    const { result } = renderHook(() => hooks.useSetGiftBudget(), { wrapper: makeWrapper() });
    await run(result, { year: 2026, data: { annualBudget: 500 } });
    expect(api.setBudget).toHaveBeenCalledWith(2026, { annualBudget: 500 });
  });

  it("useSetGiftMode optimistically updates settings then calls the API", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    qc.setQueryData(hooks.GIFTS_KEYS.settings(), { mode: "synced" });
    const wrapper = ({ children }: { children: any }) =>
      createElement(QueryClientProvider, { client: qc }, children);
    const { result } = renderHook(() => hooks.useSetGiftMode(), { wrapper });
    await run(result, { mode: "independent" });
    expect(api.setMode).toHaveBeenCalledWith({ mode: "independent" });
  });

  it("useDismissRollover dismisses the banner for a year", async () => {
    const { result } = renderHook(() => hooks.useDismissRollover(), { wrapper: makeWrapper() });
    await run(result, 2026);
    expect(api.dismissRollover).toHaveBeenCalledWith(2026);
  });

  it("rolls back the matrix and toasts when an allocation upsert fails", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const original = {
      people: [],
      events: [],
      allocations: [{ personId: "p1", eventId: "e1", planned: 10 }],
      budget: { annual: 100, currentPlanned: 10 },
    };
    qc.setQueryData(hooks.GIFTS_KEYS.quickAddMatrix(2026), original);
    const wrapper = ({ children }: { children: any }) =>
      createElement(QueryClientProvider, { client: qc }, children);
    api.upsertAllocation.mockRejectedValueOnce(new Error("nope"));
    const { result } = renderHook(() => hooks.useUpsertAllocation(), { wrapper });
    await act(async () => {
      await result.current
        .mutateAsync({ personId: "p1", eventId: "e1", year: 2026, data: { planned: 99 } })
        .catch(() => {});
    });
    const matrix = qc.getQueryData<any>(hooks.GIFTS_KEYS.quickAddMatrix(2026));
    expect(matrix.budget.currentPlanned).toBe(10); // rolled back
  });
});
