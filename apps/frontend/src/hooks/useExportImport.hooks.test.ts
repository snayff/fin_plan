import { describe, it, expect, beforeEach, mock } from "bun:test";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";

const householdService = {
  exportHousehold: mock(async () => ({ household: { name: "Test household" } })),
  importHousehold: mock(async () => ({ success: true })),
  validateImport: mock(async () => ({ valid: true })),
};
const authService = { getCurrentUser: mock(async () => ({ user: { id: "u1" } })) };

const authState = {
  accessToken: "tok",
  user: { activeHouseholdId: "h1" },
  setUser: mock(() => {}),
};

mock.module("@/services/household.service", () => ({ householdService }));
mock.module("@/services/auth.service", () => ({ authService }));
// The global test setup calls useAuthStore.setState/getState, so the mock must
// expose them. setState is a no-op here to keep authState stable for the file.
const useAuthStore: any = (sel: any) => sel(authState);
useAuthStore.setState = () => {};
useAuthStore.getState = () => authState;
mock.module("@/stores/authStore", () => ({ useAuthStore }));
mock.module("@/lib/toast", () => ({ showError: mock(() => {}), showSuccess: mock(() => {}) }));

const hooks = await import("./useExportImport");

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function makeWrapper(qc: QueryClient) {
  return ({ children }: { children: any }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  householdService.exportHousehold.mockClear();
  householdService.importHousehold.mockClear();
  householdService.validateImport.mockClear();
  authService.getCurrentUser.mockClear();
  authState.setUser.mockClear();
});

describe("useImportHousehold", () => {
  it("imports with the chosen mode and refreshes the auth user", async () => {
    const qc = makeClient();
    const { result } = renderHook(() => hooks.useImportHousehold(), {
      wrapper: makeWrapper(qc),
    });

    await act(async () => {
      await result.current.mutateAsync({ data: { household: {} }, mode: "create_new" });
    });

    expect(householdService.importHousehold).toHaveBeenCalledWith({ household: {} }, "create_new");
    expect(authService.getCurrentUser).toHaveBeenCalledWith("tok");
    expect(authState.setUser).toHaveBeenCalled();
  });

  it("purges cached query data that predates the import", async () => {
    const qc = makeClient();
    qc.setQueryData(["waterfall", "summary"], { surplus: 100 });
    qc.setQueryData(["accounts"], [{ id: "ac1", name: "Old account" }]);
    const { result } = renderHook(() => hooks.useImportHousehold(), {
      wrapper: makeWrapper(qc),
    });

    await act(async () => {
      await result.current.mutateAsync({ data: { household: {} }, mode: "overwrite" });
    });

    expect(qc.getQueryData(["waterfall", "summary"])).toBeUndefined();
    expect(qc.getQueryData(["accounts"])).toBeUndefined();
  });
});

describe("useValidateImport", () => {
  it("posts the candidate payload for validation", async () => {
    const qc = makeClient();
    const { result } = renderHook(() => hooks.useValidateImport(), {
      wrapper: makeWrapper(qc),
    });

    await act(async () => {
      await result.current.mutateAsync({ some: "payload" });
    });

    expect(householdService.validateImport).toHaveBeenCalledWith({ some: "payload" });
  });
});
