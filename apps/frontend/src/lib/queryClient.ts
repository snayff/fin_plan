import { QueryClient } from "@tanstack/react-query";

/** Narrow an unknown thrown value to its numeric statusCode, if present. */
function statusCodeOf(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "statusCode" in error) {
    const code = (error as { statusCode: unknown }).statusCode;
    return typeof code === "number" ? code : undefined;
  }
  return undefined;
}

/**
 * Purge cached query data after the active household context changes
 * (switch, leave, delete, import). Queries without active observers are
 * removed outright so data from the previous household cannot be served
 * from cache; queries currently on screen are invalidated and refetch
 * under the new context.
 */
export function purgeStaleQueries(client: QueryClient): void {
  client.removeQueries({ type: "inactive" });
  void client.invalidateQueries();
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      // Don't retry on 401 (token refresh is handled by the API client) or 429 (rate limited — retrying amplifies the problem)
      retry: (failureCount, error: unknown) => {
        const statusCode = statusCodeOf(error);
        return statusCode !== 401 && statusCode !== 429 && failureCount < 1;
      },
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
    mutations: {
      onError: (error: unknown) => {
        if (statusCodeOf(error) === 401) {
          import("../stores/authStore").then(({ useAuthStore }) => {
            useAuthStore.getState().setUnauthenticated();
            window.location.href = "/login";
          });
        }
      },
    },
  },
});
