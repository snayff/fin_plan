import { describe, it, expect, mock, beforeEach } from "bun:test";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";

const settingsService = {
  getSettings: mock(async () => ({ showPence: true })),
  updateSettings: mock(async () => ({ showPence: false })),
  dismissWaterfallTip: mock(async () => ({ ok: true })),
};
const snapshotService = {
  listSnapshots: mock(async () => [{ id: "s1" }]),
  getSnapshot: mock(async () => ({ id: "s1" })),
  createSnapshot: mock(async () => ({ id: "s1" })),
  renameSnapshot: mock(async () => ({ id: "s1" })),
  deleteSnapshot: mock(async () => undefined),
};
const householdService = {
  getHouseholdDetails: mock(async () => ({
    household: {
      memberProfiles: [{ id: "m1", userId: "u1", name: "Alice Smith", role: "member" }],
    },
  })),
  renameHousehold: mock(async () => ({ id: "hh1" })),
  inviteMember: mock(async () => ({ token: "t" })),
  cancelInvite: mock(async () => undefined),
  removeMember: mock(async () => undefined),
  leaveHousehold: mock(async () => undefined),
  deleteHousehold: mock(async () => undefined),
  createMember: mock(async () => ({ id: "m2" })),
  updateMember: mock(async () => ({ id: "m2" })),
  deleteMember: mock(async () => undefined),
};
const authService = {
  getCurrentUser: mock(async () => ({ user: { id: "u1", activeHouseholdId: "hh1" } })),
};
const auditLogService = {
  fetchAuditLog: mock(async () => ({ entries: [], nextCursor: null })),
  updateMemberRole: mock(async () => ({ ok: true })),
};
const securityActivityService = {
  fetchSecurityActivity: mock(async () => ({ entries: [], nextCursor: null })),
};

mock.module("@/services/settings.service", () => ({ settingsService }));
mock.module("@/services/snapshot.service", () => ({ snapshotService }));
mock.module("@/services/household.service", () => ({ householdService }));
mock.module("@/services/auth.service", () => ({ authService }));
mock.module("@/services/auditLog.service", () => auditLogService);
mock.module("@/services/securityActivity.service", () => securityActivityService);
mock.module("@/lib/toast", () => ({ showError: mock(() => {}), showSuccess: mock(() => {}) }));

const h = await import("./useSettings");
const { useAuthStore } = await import("@/stores/authStore");

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
  const all = [
    settingsService,
    snapshotService,
    householdService,
    authService,
    auditLogService,
    securityActivityService,
  ];
  for (const svc of all) for (const fn of Object.values(svc)) (fn as any).mockClear?.();
  useAuthStore.setState({
    user: { id: "u1", activeHouseholdId: "hh1" } as any,
    accessToken: "tok",
    isAuthenticated: true,
    authStatus: "authenticated",
  });
});

async function runMutation(hookFn: () => any, vars?: unknown, qc = freshQc()) {
  const { result } = renderHook(hookFn, { wrapper: makeWrapper(qc) });
  await act(async () => {
    await result.current.mutateAsync(vars);
  });
  return { result, qc };
}

describe("useSettings queries", () => {
  it("useSettings fetches settings", async () => {
    const { result } = renderHook(() => h.useSettings(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(settingsService.getSettings).toHaveBeenCalled();
  });

  it("useSnapshots fetches the list", async () => {
    const { result } = renderHook(() => h.useSnapshots(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(snapshotService.listSnapshots).toHaveBeenCalled();
  });

  it("useSnapshot is disabled without an id and enabled with one", async () => {
    const off = renderHook(() => h.useSnapshot(null), { wrapper });
    expect(off.result.current.fetchStatus).toBe("idle");
    const { result } = renderHook(() => h.useSnapshot("s1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(snapshotService.getSnapshot).toHaveBeenCalledWith("s1");
  });

  it("useHouseholdDetails fetches when an id is present", async () => {
    const { result } = renderHook(() => h.useHouseholdDetails("hh1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(householdService.getHouseholdDetails).toHaveBeenCalledWith("hh1");
  });

  it("useHouseholdMembers derives firstName from the active household", async () => {
    const { result } = renderHook(() => h.useHouseholdMembers(), { wrapper });
    await waitFor(() => expect(result.current.data.length).toBe(1));
    expect(result.current.data[0]).toMatchObject({ id: "m1", firstName: "Alice" });
  });

  it("useAuditLog paginates via infinite query", async () => {
    const { result } = renderHook(() => h.useAuditLog({}), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(auditLogService.fetchAuditLog).toHaveBeenCalled();
  });

  it("useSecurityActivity paginates via infinite query", async () => {
    const { result } = renderHook(() => h.useSecurityActivity(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(securityActivityService.fetchSecurityActivity).toHaveBeenCalled();
  });
});

describe("useSettings simple mutations", () => {
  it("useUpdateSettings delegates", async () => {
    await runMutation(() => h.useUpdateSettings(), { showPence: false });
    expect(settingsService.updateSettings).toHaveBeenCalledWith({ showPence: false });
  });
  it("useCreateSnapshot delegates with a name", async () => {
    await runMutation(() => h.useCreateSnapshot(), "My snapshot");
    expect(snapshotService.createSnapshot).toHaveBeenCalledWith({ name: "My snapshot" });
  });
  it("useRenameSnapshot delegates", async () => {
    await runMutation(() => h.useRenameSnapshot(), { id: "s1", name: "New" });
    expect(snapshotService.renameSnapshot).toHaveBeenCalledWith("s1", { name: "New" });
  });
  it("useDeleteSnapshot delegates", async () => {
    await runMutation(() => h.useDeleteSnapshot(), "s1");
    expect((snapshotService.deleteSnapshot.mock.calls[0] as any)[0]).toBe("s1");
  });
  it("useRenameHousehold delegates", async () => {
    await runMutation(() => h.useRenameHousehold(), { id: "hh1", name: "Home" });
    expect(householdService.renameHousehold).toHaveBeenCalledWith("hh1", "Home");
  });
  it("useInviteMember delegates", async () => {
    await runMutation(() => h.useInviteMember(), { householdId: "hh1", email: "x@y.com" });
    expect(householdService.inviteMember).toHaveBeenCalledWith("hh1", "x@y.com");
  });
  it("useCancelInvite delegates", async () => {
    await runMutation(() => h.useCancelInvite(), { householdId: "hh1", inviteId: "inv1" });
    expect(householdService.cancelInvite).toHaveBeenCalledWith("hh1", "inv1");
  });
  it("useRemoveMember delegates", async () => {
    await runMutation(() => h.useRemoveMember(), { householdId: "hh1", memberId: "m1" });
    expect(householdService.removeMember).toHaveBeenCalledWith("hh1", "m1");
  });
  it("useCreateMember delegates", async () => {
    await runMutation(() => h.useCreateMember(), { householdId: "hh1", data: { name: "Bob" } });
    expect(householdService.createMember).toHaveBeenCalled();
  });
  it("useUpdateMember delegates", async () => {
    await runMutation(() => h.useUpdateMember(), {
      householdId: "hh1",
      memberId: "m1",
      data: { name: "B" },
    });
    expect(householdService.updateMember).toHaveBeenCalled();
  });
  it("useDeleteMember delegates", async () => {
    await runMutation(() => h.useDeleteMember(), { householdId: "hh1", memberId: "m1" });
    expect(householdService.deleteMember).toHaveBeenCalled();
  });
  it("useDismissWaterfallTip delegates", async () => {
    await runMutation(() => h.useDismissWaterfallTip());
    expect(settingsService.dismissWaterfallTip).toHaveBeenCalled();
  });
});

describe("useSettings auth-coupled mutations", () => {
  it("useLeaveHousehold re-fetches the user after leaving", async () => {
    await runMutation(() => h.useLeaveHousehold(), "hh1");
    expect(householdService.leaveHousehold).toHaveBeenCalledWith("hh1");
    expect(authService.getCurrentUser).toHaveBeenCalledWith("tok");
  });
  it("useDeleteHousehold re-fetches the user after deletion", async () => {
    await runMutation(() => h.useDeleteHousehold(), "hh1");
    expect(householdService.deleteHousehold).toHaveBeenCalledWith("hh1");
    expect(authService.getCurrentUser).toHaveBeenCalled();
  });
});

describe("useUpdateMemberRole — optimistic", () => {
  it("optimistically swaps a member's role and rolls back on error", async () => {
    const qc = freshQc();
    const snap = {
      household: {
        memberProfiles: [{ id: "m1", userId: "u2", name: "Bob", role: "member" }],
      },
    };
    qc.setQueryData(h.SETTINGS_KEYS.household("hh1"), snap);
    auditLogService.updateMemberRole.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => h.useUpdateMemberRole("hh1"), { wrapper: makeWrapper(qc) });
    await act(async () => {
      try {
        await result.current.mutateAsync({ targetUserId: "u2", role: "admin" });
      } catch {
        /* expected */
      }
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    const restored = qc.getQueryData<typeof snap>(h.SETTINGS_KEYS.household("hh1"));
    expect(restored!.household.memberProfiles[0]!.role).toBe("member");
  });

  it("commits the optimistic role change on success", async () => {
    const qc = freshQc();
    qc.setQueryData(h.SETTINGS_KEYS.household("hh1"), {
      household: { memberProfiles: [{ id: "m1", userId: "u2", name: "Bob", role: "member" }] },
    });
    const { result } = renderHook(() => h.useUpdateMemberRole("hh1"), { wrapper: makeWrapper(qc) });
    await act(async () => {
      await result.current.mutateAsync({ targetUserId: "u2", role: "admin" });
    });
    expect(auditLogService.updateMemberRole).toHaveBeenCalledWith("u2", "admin", "hh1");
  });
});
