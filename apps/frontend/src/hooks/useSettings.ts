import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { settingsService } from "@/services/settings.service";
import { snapshotService } from "@/services/snapshot.service";
import { householdService } from "@/services/household.service";
import { useAuthStore } from "@/stores/authStore";
import { authService } from "@/services/auth.service";
import type { UpdateSettingsInput, AuditLogQuery, StalenessThresholds } from "@finplan/shared";
import { fetchAuditLog, updateMemberRole } from "@/services/auditLog.service";
import { fetchSecurityActivity } from "@/services/securityActivity.service";
import { purgeStaleQueries } from "@/lib/queryClient";
import { showError } from "@/lib/toast";

export const SETTINGS_KEYS = {
  settings: ["settings"] as const,
  snapshots: ["snapshots"] as const,
  snapshot: (id: string) => ["snapshots", id] as const,
  household: (id: string) => ["household", id] as const,
  members: (id: string) => ["household", id, "members"] as const,
};

export function useSettings() {
  return useQuery({
    queryKey: SETTINGS_KEYS.settings,
    queryFn: settingsService.getSettings,
  });
}

/** Canonical staleness item types — must match stalenessThresholdsSchema keys. */
export type StalenessItemType = keyof StalenessThresholds;

/** Default staleness thresholds (months) per canonical item type. */
export const STALENESS_DEFAULTS: Required<StalenessThresholds> = {
  income_source: 12,
  committed_item: 6,
  discretionary_item: 12,
  asset_item: 12,
  account_item: 3,
};

/**
 * Resolve the staleness threshold (in months) for an item type, honouring the
 * user's custom thresholds and falling back to the canonical defaults.
 *
 * Consumers must use the canonical keys (income_source / committed_item /
 * discretionary_item / asset_item / account_item) — the legacy committed_bill /
 * discretionary_category keys never existed in the settings schema, so reading
 * them silently dropped user customisation.
 */
export function getStalenessMonths(
  settings: { stalenessThresholds?: StalenessThresholds | null } | null | undefined,
  itemType: StalenessItemType
): number {
  return settings?.stalenessThresholds?.[itemType] ?? STALENESS_DEFAULTS[itemType];
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateSettingsInput) => settingsService.updateSettings(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SETTINGS_KEYS.settings });
      void queryClient.invalidateQueries({ queryKey: ["forecast"] });
    },
    onError: (err: Error) => {
      showError(err.message ?? "Failed to save settings");
    },
  });
}

export function useSnapshots() {
  return useQuery({
    queryKey: SETTINGS_KEYS.snapshots,
    queryFn: snapshotService.listSnapshots,
  });
}

export function useSnapshot(id: string | null) {
  return useQuery({
    queryKey: SETTINGS_KEYS.snapshot(id ?? ""),
    queryFn: () => snapshotService.getSnapshot(id!),
    enabled: !!id,
  });
}

export function useCreateSnapshot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => snapshotService.createSnapshot({ name }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SETTINGS_KEYS.snapshots });
    },
    onError: (err: Error) => {
      showError(err.message ?? "Failed to create snapshot");
    },
  });
}

export function useRenameSnapshot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      snapshotService.renameSnapshot(id, { name }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SETTINGS_KEYS.snapshots });
    },
    onError: (err: Error) => {
      showError(err.message ?? "Failed to rename snapshot");
    },
  });
}

export function useDeleteSnapshot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => snapshotService.deleteSnapshot(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SETTINGS_KEYS.snapshots });
    },
    onError: (err: Error) => {
      showError(err.message ?? "Failed to delete snapshot");
    },
  });
}

export function useHouseholdDetails(householdId: string) {
  return useQuery({
    queryKey: SETTINGS_KEYS.household(householdId),
    queryFn: () => householdService.getHouseholdDetails(householdId),
    enabled: !!householdId,
  });
}

export function useRenameHousehold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      householdService.renameHousehold(id, name),
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: SETTINGS_KEYS.household(id) });
      void queryClient.invalidateQueries({ queryKey: ["households"] });
    },
    onError: (err: Error) => {
      showError(err.message ?? "Failed to rename household");
    },
  });
}

export function useInviteMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ householdId, email }: { householdId: string; email: string }) =>
      householdService.inviteMember(householdId, email),
    onSuccess: (_data, { householdId }) => {
      void queryClient.invalidateQueries({ queryKey: SETTINGS_KEYS.household(householdId) });
    },
    onError: (err: Error) => {
      showError(err.message ?? "Failed to send invite");
    },
  });
}

export function useCancelInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ householdId, inviteId }: { householdId: string; inviteId: string }) =>
      householdService.cancelInvite(householdId, inviteId),
    onSuccess: (_data, { householdId }) => {
      void queryClient.invalidateQueries({ queryKey: SETTINGS_KEYS.household(householdId) });
    },
    onError: (err: Error) => {
      showError(err.message ?? "Failed to cancel invite");
    },
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ householdId, memberId }: { householdId: string; memberId: string }) =>
      householdService.removeMember(householdId, memberId),
    onSuccess: (_data, { householdId }) => {
      void queryClient.invalidateQueries({ queryKey: SETTINGS_KEYS.household(householdId) });
    },
    onError: (err: Error) => {
      showError(err.message ?? "Failed to remove member");
    },
  });
}

export function useLeaveHousehold() {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const setUser = useAuthStore((s) => s.setUser);

  return useMutation({
    mutationFn: (householdId: string) => householdService.leaveHousehold(householdId),
    onSuccess: async () => {
      // Guard the refetch so a transient /me failure still purges stale caches.
      try {
        const { user } = await authService.getCurrentUser(accessToken!);
        setUser(user, accessToken!);
      } catch {
        // Auth state will resync on the next request; proceed to purge regardless.
      }
      // Drop all cached data from the household we just left.
      purgeStaleQueries(queryClient);
    },
    onError: (err: Error) => {
      showError(err.message ?? "Failed to leave household");
    },
  });
}

export function useDeleteHousehold() {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const setUser = useAuthStore((s) => s.setUser);

  return useMutation({
    mutationFn: (householdId: string) => householdService.deleteHousehold(householdId),
    onSuccess: async () => {
      // The user's activeHouseholdId is auto-cleared by the FK ON DELETE SET NULL,
      // so re-fetching the user lets the auth state reflect the post-deletion reality.
      // Guard the refetch so a transient /me failure still purges stale caches.
      try {
        const { user } = await authService.getCurrentUser(accessToken!);
        setUser(user, accessToken!);
      } catch {
        // Auth state will resync on the next request; proceed to purge regardless.
      }
      // Drop all cached data from the deleted household.
      purgeStaleQueries(queryClient);
    },
    onError: (err: Error) => {
      showError(err.message ?? "Failed to delete household");
    },
  });
}

export function useAuditLog(filters: Omit<AuditLogQuery, "cursor" | "limit">) {
  return useInfiniteQuery({
    queryKey: ["audit-log", filters],
    queryFn: ({ pageParam }) =>
      fetchAuditLog({
        ...filters,
        cursor: pageParam as string | undefined,
        limit: 50,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
  });
}

export function useSecurityActivity() {
  return useInfiniteQuery({
    queryKey: ["security-activity"],
    queryFn: ({ pageParam }) =>
      fetchSecurityActivity({ cursor: pageParam as string | undefined, limit: 50 }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
  });
}

export function useHouseholdMembers() {
  const user = useAuthStore((s) => s.user);
  const householdId = user?.activeHouseholdId ?? "";
  const { data } = useHouseholdDetails(householdId);
  const members = data?.household?.memberProfiles ?? [];
  return {
    data: members.map((m) => ({
      id: m.id,
      userId: m.userId,
      firstName: m.name.split(" ")[0] ?? m.name,
      name: m.name,
      role: m.role,
    })),
  };
}

export function useCreateMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      householdId,
      data,
    }: {
      householdId: string;
      data: { name: string; dateOfBirth?: string | null; retirementYear?: number | null };
    }) => householdService.createMember(householdId, data),
    onSuccess: (_data, { householdId }) => {
      void queryClient.invalidateQueries({ queryKey: SETTINGS_KEYS.household(householdId) });
    },
    onError: (err: Error) => {
      showError(err.message ?? "Failed to add member");
    },
  });
}

export function useUpdateMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      householdId,
      memberId,
      data,
    }: {
      householdId: string;
      memberId: string;
      data: { name?: string; dateOfBirth?: string | null; retirementYear?: number | null };
    }) => householdService.updateMember(householdId, memberId, data),
    onSuccess: (_data, { householdId }) => {
      void queryClient.invalidateQueries({ queryKey: SETTINGS_KEYS.household(householdId) });
    },
    onError: (err: Error) => {
      showError(err.message ?? "Failed to update member");
    },
  });
}

export function useDeleteMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      householdId,
      memberId,
      reassignToMemberId,
    }: {
      householdId: string;
      memberId: string;
      reassignToMemberId?: string;
    }) => householdService.deleteMember(householdId, memberId, reassignToMemberId),
    onSuccess: (_data, { householdId }) => {
      void queryClient.invalidateQueries({ queryKey: SETTINGS_KEYS.household(householdId) });
    },
    onError: (err: Error) => {
      showError(err.message ?? "Failed to delete member");
    },
  });
}

export function useDismissWaterfallTip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => settingsService.dismissWaterfallTip(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SETTINGS_KEYS.settings });
    },
    onError: (err: Error) => {
      showError(err.message ?? "Failed to dismiss tip");
    },
  });
}

type HouseholdDetails = {
  household: {
    memberProfiles: Array<{ id: string; userId: string; name: string; role: "member" | "admin" }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export function useUpdateMemberRole(householdId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ targetUserId, role }: { targetUserId: string; role: "member" | "admin" }) =>
      updateMemberRole(targetUserId, role, householdId),
    onMutate: async ({ targetUserId, role }) => {
      const key = SETTINGS_KEYS.household(householdId);
      await queryClient.cancelQueries({ queryKey: key });
      const snapshot = queryClient.getQueryData<HouseholdDetails>(key);
      if (snapshot) {
        queryClient.setQueryData<HouseholdDetails>(key, {
          ...snapshot,
          household: {
            ...snapshot.household,
            memberProfiles: snapshot.household.memberProfiles.map((m) =>
              m.userId === targetUserId ? { ...m, role } : m
            ),
          },
        });
      }
      return { snapshot };
    },
    onError: (error: unknown, _vars, ctx) => {
      if (ctx?.snapshot) {
        queryClient.setQueryData(SETTINGS_KEYS.household(householdId), ctx.snapshot);
      }
      showError(error instanceof Error ? error.message : "Failed to update role");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: SETTINGS_KEYS.household(householdId) });
    },
  });
}
