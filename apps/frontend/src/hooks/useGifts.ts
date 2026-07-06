import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { giftsApi } from "@/services/gifts.service";
import { showError } from "@/lib/toast";
import { queryKeys } from "@/hooks/queryKeys";

/**
 * Re-exported for existing consumers/tests. Sourced from the central
 * `queryKeys` module; values are unchanged.
 */
export const GIFTS_KEYS = {
  all: queryKeys.gifts.all,
  state: queryKeys.gifts.state,
  person: queryKeys.gifts.person,
  upcoming: queryKeys.gifts.upcoming,
  years: queryKeys.gifts.years,
  configPeople: queryKeys.gifts.configPeople,
  configEvents: queryKeys.gifts.configEvents,
  quickAddMatrix: queryKeys.gifts.quickAddMatrix,
  settings: queryKeys.gifts.settings,
};

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useGiftsState(year: number) {
  return useQuery({
    queryKey: GIFTS_KEYS.state(year),
    queryFn: () => giftsApi.getState(year),
  });
}

export function useGiftPlannerSettings(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: GIFTS_KEYS.settings(),
    queryFn: () => giftsApi.getSettings(),
    enabled: options?.enabled ?? true,
  });
}

export function useGiftPerson(id: string, year: number) {
  return useQuery({
    queryKey: GIFTS_KEYS.person(id, year),
    queryFn: () => giftsApi.getPerson(id, year),
    enabled: !!id,
  });
}

export function useGiftsUpcoming(year: number) {
  return useQuery({
    queryKey: GIFTS_KEYS.upcoming(year),
    queryFn: () => giftsApi.getUpcoming(year),
  });
}

export function useGiftsYears() {
  return useQuery({
    queryKey: GIFTS_KEYS.years(),
    queryFn: () => giftsApi.listYears(),
  });
}

export function useConfigPeople(filter: "all" | "household" | "non-household", year: number) {
  return useQuery({
    queryKey: GIFTS_KEYS.configPeople(filter, year),
    queryFn: () => giftsApi.listConfigPeople(filter, year),
  });
}

export function useConfigEvents() {
  return useQuery({
    queryKey: GIFTS_KEYS.configEvents(),
    queryFn: () => giftsApi.listConfigEvents(),
  });
}

export function useQuickAddMatrix(year: number) {
  return useQuery({
    queryKey: GIFTS_KEYS.quickAddMatrix(year),
    queryFn: () => giftsApi.getQuickAddMatrix(year),
  });
}

// ─── Person Mutations ─────────────────────────────────────────────────────────

export function useCreateGiftPerson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Parameters<typeof giftsApi.createPerson>[0]) => giftsApi.createPerson(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.gifts.configPeoplePrefix });
      void queryClient.invalidateQueries({ queryKey: queryKeys.gifts.statePrefix });
      void queryClient.invalidateQueries({ queryKey: queryKeys.gifts.quickAddMatrixPrefix });
      // Adding a person changes the upcoming-gifts view (prefix matches all years).
      void queryClient.invalidateQueries({ queryKey: queryKeys.gifts.upcomingPrefix });
    },
    onError: (error: unknown) => {
      showError(error instanceof Error ? error.message : "Failed to add person");
    },
  });
}

export function useUpdateGiftPerson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof giftsApi.updatePerson>[1] }) =>
      giftsApi.updatePerson(id, data),
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.gifts.configPeoplePrefix });
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.gifts.personPrefix, id] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.gifts.statePrefix });
      void queryClient.invalidateQueries({ queryKey: queryKeys.gifts.quickAddMatrixPrefix });
      // Renaming a person updates how they appear in the upcoming-gifts view.
      void queryClient.invalidateQueries({ queryKey: queryKeys.gifts.upcomingPrefix });
    },
    onError: (error: unknown) => {
      showError(error instanceof Error ? error.message : "Failed to update person");
    },
  });
}

export function useDeleteGiftPerson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => giftsApi.deletePerson(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.gifts.configPeoplePrefix });
      void queryClient.invalidateQueries({ queryKey: queryKeys.gifts.statePrefix });
      void queryClient.invalidateQueries({ queryKey: queryKeys.gifts.quickAddMatrixPrefix });
      void queryClient.invalidateQueries({ queryKey: queryKeys.gifts.upcomingPrefix });
    },
    onError: (error: unknown) => {
      showError(error instanceof Error ? error.message : "Failed to delete person");
    },
  });
}

// ─── Event Mutations ──────────────────────────────────────────────────────────

export function useCreateGiftEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Parameters<typeof giftsApi.createEvent>[0]) => giftsApi.createEvent(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: GIFTS_KEYS.configEvents() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.gifts.statePrefix });
      void queryClient.invalidateQueries({ queryKey: queryKeys.gifts.quickAddMatrixPrefix });
    },
    onError: (error: unknown) => {
      showError(error instanceof Error ? error.message : "Failed to add event");
    },
  });
}

export function useUpdateGiftEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof giftsApi.updateEvent>[1] }) =>
      giftsApi.updateEvent(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: GIFTS_KEYS.configEvents() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.gifts.statePrefix });
      void queryClient.invalidateQueries({ queryKey: queryKeys.gifts.quickAddMatrixPrefix });
      void queryClient.invalidateQueries({ queryKey: queryKeys.gifts.upcomingPrefix });
    },
    onError: (error: unknown) => {
      showError(error instanceof Error ? error.message : "Failed to update event");
    },
  });
}

export function useDeleteGiftEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => giftsApi.deleteEvent(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: GIFTS_KEYS.configEvents() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.gifts.statePrefix });
      void queryClient.invalidateQueries({ queryKey: queryKeys.gifts.quickAddMatrixPrefix });
      void queryClient.invalidateQueries({ queryKey: queryKeys.gifts.upcomingPrefix });
    },
    onError: (error: unknown) => {
      showError(error instanceof Error ? error.message : "Failed to delete event");
    },
  });
}

// ─── Allocation Mutations ─────────────────────────────────────────────────────

type QuickAddAllocation = { personId: string; eventId: string; planned: number };
type QuickAddMatrix = {
  people: { id: string; name: string; memberId: string | null }[];
  events: { id: string; name: string }[];
  allocations: QuickAddAllocation[];
  budget: { annual: number; currentPlanned: number };
};

export function useUpsertAllocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      personId,
      eventId,
      year,
      data,
    }: {
      personId: string;
      eventId: string;
      year: number;
      data: Parameters<typeof giftsApi.upsertAllocation>[3];
    }) => giftsApi.upsertAllocation(personId, eventId, year, data),
    onMutate: async ({ personId, eventId, year, data }) => {
      const matrixKey = GIFTS_KEYS.quickAddMatrix(year);
      await queryClient.cancelQueries({ queryKey: matrixKey });
      const snapshot = queryClient.getQueryData<QuickAddMatrix>(matrixKey);
      if (snapshot?.allocations) {
        const planned = (data as { planned?: number }).planned ?? 0;
        const others = snapshot.allocations.filter(
          (a) => !(a.personId === personId && a.eventId === eventId)
        );
        const updatedAllocations: QuickAddAllocation[] = [
          ...others,
          { personId, eventId, planned },
        ];
        const newPlannedTotal = updatedAllocations.reduce((sum, a) => sum + a.planned, 0);
        queryClient.setQueryData<QuickAddMatrix>(matrixKey, {
          ...snapshot,
          allocations: updatedAllocations,
          budget: { ...snapshot.budget, currentPlanned: newPlannedTotal },
        });
      }
      return { snapshot, year };
    },
    onError: (error: unknown, _vars, ctx) => {
      if (ctx?.snapshot && ctx.year !== undefined) {
        queryClient.setQueryData(GIFTS_KEYS.quickAddMatrix(ctx.year), ctx.snapshot);
      }
      showError(error instanceof Error ? error.message : "Failed to update allocation");
    },
    onSettled: (_data, _err, { personId, year }) => {
      void queryClient.invalidateQueries({ queryKey: GIFTS_KEYS.state(year) });
      void queryClient.invalidateQueries({ queryKey: GIFTS_KEYS.quickAddMatrix(year) });
      void queryClient.invalidateQueries({ queryKey: GIFTS_KEYS.person(personId, year) });
      void queryClient.invalidateQueries({ queryKey: GIFTS_KEYS.upcoming(year) });
    },
  });
}

export function useBulkUpsertAllocations() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Parameters<typeof giftsApi.bulkUpsert>[0]) => giftsApi.bulkUpsert(data),
    onError: (error: unknown) => {
      showError(error instanceof Error ? error.message : "Failed to update allocations");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.gifts.statePrefix });
      void queryClient.invalidateQueries({ queryKey: queryKeys.gifts.quickAddMatrixPrefix });
      void queryClient.invalidateQueries({ queryKey: queryKeys.gifts.personPrefix });
      void queryClient.invalidateQueries({ queryKey: queryKeys.gifts.upcomingPrefix });
    },
  });
}

// ─── Budget & Mode Mutations ──────────────────────────────────────────────────

export function useSetGiftBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      year,
      data,
    }: {
      year: number;
      data: Parameters<typeof giftsApi.setBudget>[1];
    }) => giftsApi.setBudget(year, data),
    onSuccess: (_data, { year }) => {
      void queryClient.invalidateQueries({ queryKey: GIFTS_KEYS.state(year) });
      void queryClient.invalidateQueries({ queryKey: GIFTS_KEYS.quickAddMatrix(year) });
      // Gift budget feeds the discretionary waterfall; refresh dependent caches.
      void queryClient.invalidateQueries({ queryKey: queryKeys.waterfall.summary });
      void queryClient.invalidateQueries({ queryKey: queryKeys.waterfall.financialSummary });
      void queryClient.invalidateQueries({ queryKey: queryKeys.forecast.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.shortfall });
    },
    onError: (error: unknown) => {
      showError(error instanceof Error ? error.message : "Failed to update budget");
    },
  });
}

export function useSetGiftMode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Parameters<typeof giftsApi.setMode>[0]) => giftsApi.setMode(data),
    onMutate: async (data) => {
      const settingsKey = GIFTS_KEYS.settings();
      await queryClient.cancelQueries({ queryKey: settingsKey });
      const snapshot = queryClient.getQueryData<{ mode?: string }>(settingsKey);
      if (snapshot) {
        queryClient.setQueryData(settingsKey, {
          ...snapshot,
          mode: (data as { mode?: string }).mode,
        });
      }
      return { snapshot };
    },
    onError: (error: unknown, _vars, ctx) => {
      if (ctx?.snapshot) {
        queryClient.setQueryData(GIFTS_KEYS.settings(), ctx.snapshot);
      }
      showError(error instanceof Error ? error.message : "Failed to change mode");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: GIFTS_KEYS.settings() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.gifts.statePrefix });
      void queryClient.invalidateQueries({ queryKey: GIFTS_KEYS.years() });
      // Mode (synced vs manual) changes how gifts feed discretionary spend.
      void queryClient.invalidateQueries({ queryKey: queryKeys.waterfall.summary });
      void queryClient.invalidateQueries({ queryKey: queryKeys.waterfall.financialSummary });
      void queryClient.invalidateQueries({ queryKey: queryKeys.forecast.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.shortfall });
    },
  });
}

// ─── Rollover ─────────────────────────────────────────────────────────────────

export function useDismissRollover() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (year: number) => giftsApi.dismissRollover(year),
    onSuccess: (_data, year) => {
      void queryClient.invalidateQueries({ queryKey: GIFTS_KEYS.state(year) });
      void queryClient.invalidateQueries({ queryKey: GIFTS_KEYS.settings() });
    },
    onError: (error: unknown) => {
      showError(error instanceof Error ? error.message : "Failed to dismiss rollover");
    },
  });
}
