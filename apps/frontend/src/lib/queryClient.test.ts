import { describe, it, expect, afterEach } from "bun:test";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery, useMutation } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { purgeStaleQueries, queryClient } from "./queryClient";

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function makeWrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

describe("purgeStaleQueries", () => {
  it("removes cached data for queries with no active observers", () => {
    const qc = makeClient();
    qc.setQueryData(["accounts"], [{ id: "ac1", name: "Old account" }]);
    qc.setQueryData(["waterfall", "summary"], { surplus: 100 });

    purgeStaleQueries(qc);

    expect(qc.getQueryData(["accounts"])).toBeUndefined();
    expect(qc.getQueryData(["waterfall", "summary"])).toBeUndefined();
    expect(qc.getQueryCache().getAll()).toHaveLength(0);
  });

  it("invalidates actively observed queries so they refetch", async () => {
    const qc = makeClient();
    let fetchCount = 0;
    const { result } = renderHook(
      () =>
        useQuery({
          queryKey: ["households"],
          queryFn: async () => ++fetchCount,
          staleTime: Infinity,
        }),
      { wrapper: makeWrapper(qc) }
    );
    await waitFor(() => expect(result.current.data).toBe(1));

    purgeStaleQueries(qc);

    // The active query is not removed (no unmount flash) but must refetch.
    await waitFor(() => expect(result.current.data).toBe(2));
  });
});

describe("queryClient mutation 401 handling", () => {
  afterEach(async () => {
    queryClient.clear();
    const { useAuthStore } = await import("../stores/authStore");
    useAuthStore.setState({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      authStatus: "unauthenticated",
      isLoading: false,
      error: null,
    });
  });

  it("drops the session and empties the cache when a mutation fails with 401", async () => {
    const { useAuthStore } = await import("../stores/authStore");
    const { setAuthenticated } = await import("../test/helpers/auth");
    setAuthenticated();
    queryClient.setQueryData(["accounts"], [{ id: "ac1", name: "Old account" }]);

    const { result } = renderHook(
      () =>
        useMutation({
          mutationFn: async () => {
            throw { message: "Unauthorized", statusCode: 401 };
          },
        }),
      { wrapper: makeWrapper(queryClient) }
    );

    result.current.mutate();

    await waitFor(() => {
      expect(useAuthStore.getState().authStatus).toBe("unauthenticated");
      expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    });
  });
});
