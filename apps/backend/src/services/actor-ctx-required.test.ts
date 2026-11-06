import { describe, it, expect } from "bun:test";
import type { FastifyRequest } from "fastify";
import { actorCtx } from "../lib/actor-ctx";
import { AuthenticationError } from "../utils/errors";

/**
 * Behavioural coverage for actorCtx(). It maps an authenticated FastifyRequest
 * onto the ActorCtx shape consumed by the audit service:
 *   req.householdId          -> householdId
 *   req.user.userId          -> actorId
 *   req.user.name            -> actorName
 *   req.ip                   -> ipAddress
 *   req.headers[user-agent]  -> userAgent
 * and throws AuthenticationError when auth context is missing.
 */

interface FakeRequestInit {
  user?: { userId: string; email: string; name: string; role: string } | undefined;
  householdId?: string | undefined;
  ip?: string;
  userAgent?: string | undefined;
}

function makeRequest(init: FakeRequestInit): FastifyRequest {
  const headers: Record<string, string> = {};
  if (init.userAgent !== undefined) headers["user-agent"] = init.userAgent;
  return {
    user: init.user,
    householdId: init.householdId,
    ip: init.ip ?? "127.0.0.1",
    headers,
  } as unknown as FastifyRequest;
}

describe("actorCtx", () => {
  it("maps an authenticated request onto the full ActorCtx shape", () => {
    const ctx = actorCtx(
      makeRequest({
        user: { userId: "user-1", email: "a@b.com", name: "Ada Lovelace", role: "OWNER" },
        householdId: "hh-1",
        ip: "203.0.113.7",
        userAgent: "Mozilla/5.0 (test)",
      })
    );

    expect(ctx).toEqual({
      householdId: "hh-1",
      actorId: "user-1",
      actorName: "Ada Lovelace",
      ipAddress: "203.0.113.7",
      userAgent: "Mozilla/5.0 (test)",
    });
  });

  it("passes through a missing user-agent header as undefined", () => {
    const ctx = actorCtx(
      makeRequest({
        user: { userId: "user-2", email: "c@d.com", name: "Grace", role: "MEMBER" },
        householdId: "hh-2",
        ip: "198.51.100.4",
        // no userAgent -> header absent
      })
    );

    expect(ctx.userAgent).toBeUndefined();
    expect(ctx.ipAddress).toBe("198.51.100.4");
    expect(ctx.actorId).toBe("user-2");
    expect(ctx.householdId).toBe("hh-2");
  });

  it("passes through a missing ip as undefined", () => {
    // Simulate a request where Fastify never populated req.ip.
    const req = {
      user: { userId: "user-3", email: "e@f.com", name: "Alan", role: "ADMIN" },
      householdId: "hh-3",
      ip: undefined,
      headers: { "user-agent": "curl/8.0" },
    } as unknown as FastifyRequest;

    const ctx = actorCtx(req);
    expect(ctx.ipAddress).toBeUndefined();
    expect(ctx.userAgent).toBe("curl/8.0");
    expect(ctx.actorName).toBe("Alan");
  });

  it("throws AuthenticationError when user is missing", () => {
    expect(() =>
      actorCtx(makeRequest({ user: undefined, householdId: "hh-1", userAgent: "ua" }))
    ).toThrow(AuthenticationError);
  });

  it("throws AuthenticationError when householdId is missing", () => {
    expect(() =>
      actorCtx(
        makeRequest({
          user: { userId: "user-1", email: "a@b.com", name: "Ada", role: "OWNER" },
          householdId: undefined,
          userAgent: "ua",
        })
      )
    ).toThrow(AuthenticationError);
  });
});
