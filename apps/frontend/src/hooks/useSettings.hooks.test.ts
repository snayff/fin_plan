import { describe, it, expect, beforeEach, mock } from "bun:test";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";

const settingsService = {
  getSettings: mock(async () => ({ showPence: false })),
  updateSettings: mock(async () => ({})),
  dismissWaterfallTip: mock(async () => ({})),
};
const snapshotService = {
  listSnapshots: mock(async () => [{ id: "sn1" }]),
  getSnapshot: mock(async () => ({ id: "sn1" })),
  createSnapshot: mock(async () => ({ id: "sn1" })),
  renameSnapshot: mock(async () => ({ id: "sn1" })),
  deleteSnapshot: mock(async () => undefined),
};
const householdService = {
  getHouseholdDetails: mock(async () => ({
    household: { memberProfiles: [{ id: "m1", userId: "u1", name: "Alex Smith", role: "owner" }] },
  })),
  renameHousehold: mock(async () => ({ household: { id: "h1" } })),
  inviteMember: mock(async () => ({ token: "t" })),
  cancelInvite: mock(async () => ({ success: true })),
  removeMember: mock(async () => ({ success: true })),
  leaveHousehold: mock(async () => ({ success: true })),
  deleteHousehold: mock(async () => undefined),
  createMember: mock(async () => ({ member: { id: "m2" } })),
  updateMember: mock(async () => ({ member: { id: "m1" } })),
  deleteMember: mock(async () => ({ success: true })),
};
const authService = { getCurrentUser: mock(async () => ({ user: { id: "u1" } })) };
const fetchAuditLog = mock(async () => ({ items: [], nextCursor: null }));
const updateMemberRole = mock(async () => ({ success: true }));
const fetchSecurityActivity = mock(async () => ({ items: [], nextCursor: null }));

const authState = {
  accessToken: "tok",
  user: { activeHouseholdId: "h1" },
  setUser: mock(() => {}),
};

mock.module("@/services/settings.service", () => ({ settingsService }));
mock.module("@/services/snapshot.service", () => ({ snapshotService }));
mock.module("@/services/household.service", () => ({ householdService }));
mock.module("@/services/auth.service", () => ({ authService }));
mock.module("@/services/auditLog.service", () => ({ fetchAuditLog, updateMemberRole }));
mock.module("@/services/securityActivity.service", () => ({ fetchSecurityActivity }));
// The global test setup calls useAuthStore.setState/getState, so the mock must
// expose them. setState is a no-op here to keep authState stable for the file.
const useAuthStore: any = (sel: any) => sel(authState);
useAuthStore.setState = () => {};
useAuthStore.getState = () => authState;
mock.module("@/stores/authStore", () => ({ useAuthStore }));
mock.module("@/lib/toast", () => ({ showError: mock(() => {}), showSuccess: mock(() => {}) }));

const hooks = await import("./useSettings");

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
  const all = [
    ...Object.values(settingsService),
    ...Object.values(snapshotService),
    ...Object.values(householdService),
    authService.getCurrentUser,
    fetchAuditLog,
    updateMemberRole,
    fetchSecurityActivity,
  ];
  for (const fn of all) (fn as any).mockClear();
});

describe("useSettings query hooks", () => {
  it("useSettings + useSnapshots fetch", async () => {
    const w = makeWrapper();
    const s = renderHook(() => hooks.useSettings(), { wrapper: w });
    const sn = renderHook(() => hooks.useSnapshots(), { wrapper: w });
    await waitFor(() => expect(s.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(sn.result.current.isSuccess).toBe(true));
    expect(settingsService.getSettings).toHaveBeenCalled();
    expect(snapshotService.listSnapshots).toHaveBeenCalled();
  });

  it("useSnapshot is disabled when id is null", () => {
    const { result } = renderHook(() => hooks.useSnapshot(null), { wrapper: makeWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
    expect(snapshotService.getSnapshot).not.toHaveBeenCalled();
  });

  it("useHouseholdDetails fetches when an id is present", async () => {
    const { result } = renderHook(() => hooks.useHouseholdDetails("h1"), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(householdService.getHouseholdDetails).toHaveBeenCalledWith("h1");
  });

  it("useHouseholdMembers derives member rows from the active household", async () => {
    const { result } = renderHook(() => hooks.useHouseholdMembers(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.data.length).toBeGreaterThan(0));
    expect(result.current.data[0]).toMatchObject({ id: "m1", firstName: "Alex" });
  });

  it("useAuditLog + useSecurityActivity paginate via infinite query", async () => {
    const w = makeWrapper();
    const al = renderHook(() => hooks.useAuditLog({}), { wrapper: w });
    const sa = renderHook(() => hooks.useSecurityActivity(), { wrapper: w });
    await waitFor(() => expect(al.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(sa.result.current.isSuccess).toBe(true));
    expect(fetchAuditLog).toHaveBeenCalled();
    expect(fetchSecurityActivity).toHaveBeenCalled();
  });
});

describe("useSettings mutation hooks", () => {
  it("settings + snapshot mutations", async () => {
    const w = makeWrapper();
    await run(renderHook(() => hooks.useUpdateSettings(), { wrapper: w }).result, {
      showPence: true,
    });
    expect(settingsService.updateSettings).toHaveBeenCalledWith({ showPence: true });

    await run(renderHook(() => hooks.useDismissWaterfallTip(), { wrapper: w }).result);
    expect(settingsService.dismissWaterfallTip).toHaveBeenCalled();

    await run(renderHook(() => hooks.useCreateSnapshot(), { wrapper: w }).result, "Q1");
    expect(snapshotService.createSnapshot).toHaveBeenCalledWith({ name: "Q1" });

    await run(renderHook(() => hooks.useRenameSnapshot(), { wrapper: w }).result, {
      id: "sn1",
      name: "Q2",
    });
    expect(snapshotService.renameSnapshot).toHaveBeenCalledWith("sn1", { name: "Q2" });

    await run(renderHook(() => hooks.useDeleteSnapshot(), { wrapper: w }).result, "sn1");
    expect(snapshotService.deleteSnapshot).toHaveBeenCalledWith("sn1");
  });

  it("household + invite + member mutations", async () => {
    const w = makeWrapper();
    await run(renderHook(() => hooks.useRenameHousehold(), { wrapper: w }).result, {
      id: "h1",
      name: "Home",
    });
    expect(householdService.renameHousehold).toHaveBeenCalledWith("h1", "Home");

    await run(renderHook(() => hooks.useInviteMember(), { wrapper: w }).result, {
      householdId: "h1",
      email: "a@b.com",
    });
    expect(householdService.inviteMember).toHaveBeenCalledWith("h1", "a@b.com");

    await run(renderHook(() => hooks.useCancelInvite(), { wrapper: w }).result, {
      householdId: "h1",
      inviteId: "inv1",
    });
    expect(householdService.cancelInvite).toHaveBeenCalledWith("h1", "inv1");

    await run(renderHook(() => hooks.useRemoveMember(), { wrapper: w }).result, {
      householdId: "h1",
      memberId: "m1",
    });
    expect(householdService.removeMember).toHaveBeenCalledWith("h1", "m1");

    await run(renderHook(() => hooks.useCreateMember(), { wrapper: w }).result, {
      householdId: "h1",
      data: { name: "Sam" },
    });
    expect(householdService.createMember).toHaveBeenCalledWith("h1", { name: "Sam" });

    await run(renderHook(() => hooks.useUpdateMember(), { wrapper: w }).result, {
      householdId: "h1",
      memberId: "m1",
      data: { name: "Samuel" },
    });
    expect(householdService.updateMember).toHaveBeenCalledWith("h1", "m1", { name: "Samuel" });

    await run(renderHook(() => hooks.useDeleteMember(), { wrapper: w }).result, {
      householdId: "h1",
      memberId: "m1",
      reassignToMemberId: "m2",
    });
    expect(householdService.deleteMember).toHaveBeenCalledWith("h1", "m1", "m2");
  });

  it("leave + delete household refresh the auth user", async () => {
    const w = makeWrapper();
    await run(renderHook(() => hooks.useLeaveHousehold(), { wrapper: w }).result, "h1");
    expect(householdService.leaveHousehold).toHaveBeenCalledWith("h1");
    expect(authService.getCurrentUser).toHaveBeenCalledWith("tok");

    await run(renderHook(() => hooks.useDeleteHousehold(), { wrapper: w }).result, "h1");
    expect(householdService.deleteHousehold).toHaveBeenCalledWith("h1");
  });

  it("leaving a household purges cached data from other queries", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    qc.setQueryData(["waterfall", "summary"], { surplus: 100 });
    qc.setQueryData(["accounts"], [{ id: "ac1", name: "Joint account" }]);
    const wrapper = ({ children }: { children: any }) =>
      createElement(QueryClientProvider, { client: qc }, children);

    await run(renderHook(() => hooks.useLeaveHousehold(), { wrapper }).result, "h1");

    expect(qc.getQueryData(["waterfall", "summary"])).toBeUndefined();
    expect(qc.getQueryData(["accounts"])).toBeUndefined();
  });

  it("deleting a household purges cached data from other queries", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    qc.setQueryData(["forecast"], { years: [2026] });
    qc.setQueryData(["gifts", "state"], { people: [] });
    const wrapper = ({ children }: { children: any }) =>
      createElement(QueryClientProvider, { client: qc }, children);

    await run(renderHook(() => hooks.useDeleteHousehold(), { wrapper }).result, "h1");

    expect(qc.getQueryData(["forecast"])).toBeUndefined();
    expect(qc.getQueryData(["gifts", "state"])).toBeUndefined();
  });

  it("useUpdateMemberRole optimistically updates the cached role", async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    qc.setQueryData(hooks.SETTINGS_KEYS.household("h1"), {
      household: { memberProfiles: [{ id: "m1", userId: "u1", name: "Alex", role: "member" }] },
    });
    const wrapper = ({ children }: { children: any }) =>
      createElement(QueryClientProvider, { client: qc }, children);
    const { result } = renderHook(() => hooks.useUpdateMemberRole("h1"), { wrapper });
    await run(result, { targetUserId: "u1", role: "admin" });
    expect(updateMemberRole).toHaveBeenCalledWith("u1", "admin", "h1");
  });
});
