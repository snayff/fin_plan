import { describe, test, expect, mock } from "bun:test";
import { resolveRateLimitStore } from "./rate-limit-store";

// Unit-tests the STORE-SELECTION logic only. The redis client is injected via
// `createRedisClient`, so these never require (or import) a running Redis.

describe("resolveRateLimitStore", () => {
  test("returns the in-memory store (no redis) when no URL is configured", async () => {
    // Pass redisUrl through explicitly so the test never depends on the ambient
    // config value; undefined models "RATE_LIMIT_REDIS_URL unset".
    const createRedisClient = mock((url: string) => ({ url }));

    const store = await resolveRateLimitStore({
      redisUrl: undefined,
      createRedisClient,
    });

    expect(store).toEqual({});
    expect("redis" in store).toBe(false);
    // The redis-client factory must never run on the in-memory path.
    expect(createRedisClient).not.toHaveBeenCalled();
  });

  test("selects the redis store and passes the client through when a URL is set", async () => {
    const fakeClient = { fake: "redis-client" };
    const createRedisClient = mock((_url: string) => fakeClient);

    const store = await resolveRateLimitStore({
      redisUrl: "redis://localhost:6379",
      createRedisClient,
    });

    expect(store.redis).toBe(fakeClient);
    expect(createRedisClient).toHaveBeenCalledTimes(1);
    expect(createRedisClient).toHaveBeenCalledWith("redis://localhost:6379");
  });

  test("awaits an async redis-client factory before returning", async () => {
    const fakeClient = { fake: "async-redis-client" };
    const createRedisClient = mock(async (_url: string) => fakeClient);

    const store = await resolveRateLimitStore({
      redisUrl: "rediss://cache.internal:6380",
      createRedisClient,
    });

    // The resolved (not the pending promise) client is threaded through.
    expect(store.redis).toBe(fakeClient);
  });
});
