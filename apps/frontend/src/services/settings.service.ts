import { apiClient } from "@/lib/api";
import type { UpdateSettingsInput, HouseholdSettingsResponse } from "@finplan/shared";

export const settingsService = {
  getSettings: () => apiClient.get<HouseholdSettingsResponse>("/api/settings"),
  updateSettings: (data: UpdateSettingsInput) =>
    apiClient.patch<HouseholdSettingsResponse>("/api/settings", data),
  dismissWaterfallTip: () =>
    apiClient.patch<HouseholdSettingsResponse>("/api/settings", { waterfallTipDismissed: true }),
};
