import { describe, it, expect } from "bun:test";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useStaleDataBanner } from "./useStaleDataBanner";

// useStaleDataBanner subscribes to the react-query QueryCache and flips a banner
// flag on when any query transitions to `error`, and off again when any query
// transitions to `success`. We drive real query state transitions through a
// real QueryClient so the cache-subscription behaviour is exercised end-to-end.

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

/** Drive a query to a terminal state by running its fetch through the client. */
async function runQuery(
  client: QueryClient,
  key: unknown[],
  fn: () => Promise<unknown>
): Promise<void> {
  try {
    await client.fetchQuery({ queryKey: key, queryFn: fn, retry: false });
  } catch {
    // fetchQuery rejects on error — the cache is still updated to `error`.
  }
}

describe("useStaleDataBanner", () => {
  it("does not show the banner initially", () => {
    const client = makeClient();
    const { result } = renderHook(() => useStaleDataBanner(), { wrapper: wrapperFor(client) });

    expect(result.current.showBanner).toBe(false);
    expect(result.current.erroredAt).toBeNull();
  });

  it("shows the banner (with an erroredAt Date) when a query errors", async () => {
    const client = makeClient();
    const { result } = renderHook(() => useStaleDataBanner(), { wrapper: wrapperFor(client) });

    await act(async () => {
      await runQuery(client, ["boom"], () => Promise.reject(new Error("network down")));
    });

    await waitFor(() => expect(result.current.showBanner).toBe(true));
    expect(result.current.erroredAt).toBeInstanceOf(Date);
  });

  it("clears the banner when a subsequent query succeeds", async () => {
    const client = makeClient();
    const { result } = renderHook(() => useStaleDataBanner(), { wrapper: wrapperFor(client) });

    // First: an error turns the banner on.
    await act(async () => {
      await runQuery(client, ["q1"], () => Promise.reject(new Error("fail")));
    });
    await waitFor(() => expect(result.current.showBanner).toBe(true));

    // Then: a success turns it off again.
    await act(async () => {
      await runQuery(client, ["q2"], () => Promise.resolve({ ok: true }));
    });
    await waitFor(() => expect(result.current.showBanner).toBe(false));
    expect(result.current.erroredAt).toBeNull();
  });

  it("stays clear when only successful queries run", async () => {
    const client = makeClient();
    const { result } = renderHook(() => useStaleDataBanner(), { wrapper: wrapperFor(client) });

    await act(async () => {
      await runQuery(client, ["ok"], () => Promise.resolve(42));
    });

    // Give any async cache events a chance to fire.
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.showBanner).toBe(false);
    expect(result.current.erroredAt).toBeNull();
  });

  it("unsubscribes from the cache on unmount (no throw after teardown)", async () => {
    const client = makeClient();
    const { result, unmount } = renderHook(() => useStaleDataBanner(), {
      wrapper: wrapperFor(client),
    });

    unmount();

    // Firing a post-unmount error must not throw or affect the last-read value.
    await act(async () => {
      await runQuery(client, ["after-unmount"], () => Promise.reject(new Error("late")));
    });

    expect(result.current.showBanner).toBe(false);
  });
});
