import { config } from "./env.js";

/**
 * The subset of the @fastify/rate-limit plugin options this module controls.
 * When a `redis` client is supplied the plugin backs its counters with Redis
 * (shared across replicas); when omitted the plugin uses its default in-memory
 * store (per-process).
 */
export interface RateLimitStoreOptions {
  redis?: unknown;
}

/**
 * Decide the rate-limit store based on configuration.
 *
 * - `RATE_LIMIT_REDIS_URL` set  → construct an ioredis client and return it as
 *   the plugin's `redis` option so counters are shared across instances. The
 *   audit finding: the default in-memory store makes limits per-process, so
 *   under N replicas the auth caps effectively multiply by N. A shared Redis
 *   store enforces one global bucket.
 * - unset → return an empty object, leaving the plugin on its in-memory store
 *   (unchanged single-process behaviour).
 *
 * ioredis is imported lazily so the in-memory path carries no runtime
 * dependency on it. `createRedisClient` is injectable for unit tests, letting
 * them exercise the selection logic without a running Redis.
 */
export async function resolveRateLimitStore(
  opts: {
    redisUrl?: string;
    createRedisClient?: (url: string) => unknown;
  } = {}
): Promise<RateLimitStoreOptions> {
  const redisUrl = opts.redisUrl ?? config.RATE_LIMIT_REDIS_URL;
  if (!redisUrl) {
    // In-memory store (default). No redis option, no ioredis import.
    return {};
  }

  const createClient =
    opts.createRedisClient ??
    (async (url: string) => {
      // Lazy/dynamic import: only loaded when a Redis URL is configured, so the
      // in-memory path never pulls ioredis into the runtime graph.
      const { default: Redis } = await import("ioredis");
      // connectTimeout + a bounded retry keep a misconfigured URL from hanging
      // startup; @fastify/rate-limit recommends disabling per-command retries.
      return new Redis(url, {
        connectTimeout: 500,
        maxRetriesPerRequest: 1,
      });
    });

  const redis = await createClient(redisUrl);
  return { redis };
}
