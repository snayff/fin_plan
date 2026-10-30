import { useQuery } from "@tanstack/react-query";
import { forecastService } from "@/services/forecast.service";
import type { ForecastHorizon } from "@finplan/shared";
import { queryKeys } from "./queryKeys";

/**
 * Re-exported for existing consumers. Sourced from the central `queryKeys`
 * module; values are unchanged.
 */
export const FORECAST_KEYS = {
  projections: queryKeys.forecast.projections,
};

export function useForecast(horizonYears: ForecastHorizon) {
  return useQuery({
    queryKey: FORECAST_KEYS.projections(horizonYears),
    queryFn: () => forecastService.getProjections(horizonYears),
  });
}
