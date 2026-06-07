import { describe, it, expect, mock, beforeEach } from "bun:test";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";

const api = {
  getState: mock(async () => ({ mode: "synced", people: [] })),
  getSettings: mock(async () => ({ mode: "synced" })),
  getPerson: mock(async () => ({ person: { id: "p1" }, allocations: [] })),
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
  setBudget: mock(async () => ({ annualBudget: 100 })),
  setMode: mock(async () => ({ mode: "independent" })),
  dismissRollover: mock(async () => undefined),
};

mock.module("@/services/gifts.service", () => ({ giftsApi: api }));
mock.module("@/lib/toast", () => ({ showError: mock(() => {}), showSuccess: mock(() => {}) }));

const g = await import("./useGifts");

function makeWrapper(qc: QueryClient) {
  return ({ children }: { children: any }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}
function freshQc() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}
const wrapper = makeWrapper(freshQc());

beforeEach(() => {
  for (const fn of Object.values(api)) (fn as any).mockClear?.();
});

async function runMutation(hookFn: () => any, vars?: unknown, qc = freshQc()) {
  const { result } = renderHook(hookFn, { wrapper: makeWrapper(qc) });
  await act(async () => {
    await result.current.mutateAsync(vars);
  });
  return { result, qc };
}

describe("useGifts query hooks", () => {
  it.each([
    ["useGiftsState", () => g.useGiftsState(2026), "getState"],
    ["useGiftPlannerSettings", () => g.useGiftPlannerSettings(), "getSettings"],
    ["useGiftsUpcoming", () => g.useGiftsUpcoming(2026), "getUpcoming"],
    ["useGiftsYears", () => g.useGiftsYears(), "listYears"],
    ["useConfigEvents", () => g.useConfigEvents(), "listConfigEvents"],
    ["useQuickAddMatrix", () => g.useQuickAddMatrix(2026), "getQuickAddMatrix"],
  ] as const)("%s fetches", async (_name, hookFn, method) => {
    const { result } = renderHook(hookFn, { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect((api as any)[method]).toHaveBeenCalled();
  });

  it("useGiftPerson is disabled without an id", () => {
    const { result } = renderHook(() => g.useGiftPerson("", 2026), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("useGiftPerson fetches with an id", async () => {
    const { result } = renderHook(() => g.useGiftPerson("p1", 2026), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.getPerson).toHaveBeenCalledWith("p1", 2026);
  });

  it("useConfigPeople fetches with filter + year", async () => {
    const { result } = renderHook(() => g.useConfigPeople("household", 2026), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.listConfigPeople).toHaveBeenCalledWith("household", 2026);
  });

  it("useGiftPlannerSettings can be disabled", () => {
    const { result } = renderHook(() => g.useGiftPlannerSettings({ enabled: false }), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
  });
});

describe("useGifts person/event mutations", () => {
  it("useCreateGiftPerson delegates", async () => {
    await runMutation(() => g.useCreateGiftPerson(), { name: "Mum" });
    expect(api.createPerson).toHaveBeenCalled();
  });
  it("useUpdateGiftPerson delegates with id + data", async () => {
    await runMutation(() => g.useUpdateGiftPerson(), { id: "p1", data: { name: "X" } });
    expect(api.updatePerson).toHaveBeenCalledWith("p1", { name: "X" });
  });
  it("useDeleteGiftPerson delegates", async () => {
    const { result } = renderHook(() => g.useDeleteGiftPerson(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync("p1");
    });
    expect((api.deletePerson.mock.calls[0] as any)[0]).toBe("p1");
  });
  it("useCreateGiftEvent delegates", async () => {
    await runMutation(() => g.useCreateGiftEvent(), { name: "Xmas", dateType: "shared" });
    expect(api.createEvent).toHaveBeenCalled();
  });
  it("useUpdateGiftEvent delegates with id + data", async () => {
    await runMutation(() => g.useUpdateGiftEvent(), { id: "e1", data: { name: "X" } });
    expect(api.updateEvent).toHaveBeenCalledWith("e1", { name: "X" });
  });
  it("useDeleteGiftEvent delegates", async () => {
    const { result } = renderHook(() => g.useDeleteGiftEvent(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync("e1");
    });
    expect((api.deleteEvent.mock.calls[0] as any)[0]).toBe("e1");
  });
});

describe("useGifts allocation + budget + mode + rollover", () => {
  it("useUpsertAllocation optimistically updates the matrix", async () => {
    const qc = freshQc();
    qc.setQueryData(g.GIFTS_KEYS.quickAddMatrix(2026), {
      people: [],
      events: [],
      allocations: [{ personId: "p1", eventId: "e1", planned: 10 }],
      budget: { annual: 100, currentPlanned: 10 },
    });
    await runMutation(
      () => g.useUpsertAllocation(),
      { personId: "p1", eventId: "e1", year: 2026, data: { planned: 40 } },
      qc
    );
    expect(api.upsertAllocation).toHaveBeenCalledWith("p1", "e1", 2026, { planned: 40 });
  });

  it("useUpsertAllocation rolls back the matrix on error", async () => {
    const qc = freshQc();
    const snap = {
      people: [],
      events: [],
      allocations: [{ personId: "p1", eventId: "e1", planned: 10 }],
      budget: { annual: 100, currentPlanned: 10 },
    };
    qc.setQueryData(g.GIFTS_KEYS.quickAddMatrix(2026), snap);
    api.upsertAllocation.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => g.useUpsertAllocation(), { wrapper: makeWrapper(qc) });
    await act(async () => {
      try {
        await result.current.mutateAsync({
          personId: "p1",
          eventId: "e1",
          year: 2026,
          data: { planned: 40 },
        });
      } catch {
        /* expected */
      }
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    const restored = qc.getQueryData<typeof snap>(g.GIFTS_KEYS.quickAddMatrix(2026));
    expect(restored!.allocations[0]!.planned).toBe(10);
  });

  it("useBulkUpsertAllocations delegates", async () => {
    await runMutation(() => g.useBulkUpsertAllocations(), { cells: [] });
    expect(api.bulkUpsert).toHaveBeenCalled();
  });

  it("useSetGiftBudget delegates with year + data", async () => {
    await runMutation(() => g.useSetGiftBudget(), { year: 2026, data: { annualBudget: 500 } });
    expect(api.setBudget).toHaveBeenCalledWith(2026, { annualBudget: 500 });
  });

  it("useSetGiftMode optimistically swaps settings.mode", async () => {
    const qc = freshQc();
    qc.setQueryData(g.GIFTS_KEYS.settings(), { mode: "synced" });
    await runMutation(() => g.useSetGiftMode(), { mode: "independent" }, qc);
    expect(api.setMode).toHaveBeenCalled();
  });

  it("useSetGiftMode rolls back settings on error", async () => {
    const qc = freshQc();
    qc.setQueryData(g.GIFTS_KEYS.settings(), { mode: "synced" });
    api.setMode.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => g.useSetGiftMode(), { wrapper: makeWrapper(qc) });
    await act(async () => {
      try {
        await result.current.mutateAsync({ mode: "independent" });
      } catch {
        /* expected */
      }
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData<{ mode: string }>(g.GIFTS_KEYS.settings())!.mode).toBe("synced");
  });

  it("useDismissRollover delegates", async () => {
    const { result } = renderHook(() => g.useDismissRollover(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(2026);
    });
    expect((api.dismissRollover.mock.calls[0] as any)[0]).toBe(2026);
  });
});
