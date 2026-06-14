import { describe, it, expect, mock, beforeEach } from "bun:test";

// ─── Mocks for dynamic imports inside ApiClient ───────────────────────────────

const authState = {
  accessToken: "stored-token" as string | null,
  user: { id: "u1" } as { id: string } | null,
  updateAccessToken: mock((_t: string) => {}),
  setUser: mock(() => {}),
  setUnauthenticated: mock(() => {}),
};
mock.module("../stores/authStore", () => ({
  useAuthStore: { getState: () => authState, setState: mock(() => {}) },
}));

const authService = {
  refreshToken: mock(async () => ({ accessToken: "refreshed-token" })),
  getCurrentUser: mock(async () => ({ user: { id: "u1" } })),
};
mock.module("../services/auth.service", () => ({ authService }));

const decodeExp = mock((_t: string) => null as number | null);
mock.module("./jwt", () => ({ decodeAccessTokenExpMs: decodeExp }));

const { ApiClient } = await import("./api");

// ─── Fetch routing ────────────────────────────────────────────────────────────

function res(data: unknown, status = 200, contentLength?: string) {
  return {
    ok: status >= 200 && status < 400,
    status,
    headers: { get: (k: string) => (k === "content-length" ? (contentLength ?? null) : null) },
    json: async () => data,
  };
}

// Response with an empty or non-JSON body: json() rejects like the browser does.
function resBadBody(status: number) {
  return {
    ok: status >= 200 && status < 400,
    status,
    headers: { get: () => null },
    json: async () => {
      throw new SyntaxError("Unexpected end of JSON input");
    },
  };
}

let mainQueue: any[] = [];
let csrfResponse: any;

beforeEach(() => {
  mainQueue = [];
  csrfResponse = res({ csrfToken: "csrf-1" });
  authState.accessToken = "stored-token";
  authState.user = { id: "u1" };
  decodeExp.mockReturnValue(null);
  authService.refreshToken.mockClear();
  authState.updateAccessToken.mockClear();
  (global as any).fetch = mock(async (url: string) => {
    if (String(url).includes("/api/auth/csrf-token")) return csrfResponse;
    return mainQueue.shift() ?? res({});
  });
});

describe("ApiClient.get", () => {
  it("returns parsed JSON and attaches the bearer token", async () => {
    mainQueue.push(res({ value: 42 }));
    const client = new ApiClient("");
    const out = await client.get<{ value: number }>("/api/data");
    expect(out).toEqual({ value: 42 });
    const call = ((global as any).fetch.mock.calls.at(-1) as any)[1];
    expect(call.headers.Authorization).toBe("Bearer stored-token");
  });

  it("does not attach auth on unauthenticated endpoints", async () => {
    mainQueue.push(res({ ok: true }));
    const client = new ApiClient("");
    await client.get("/api/auth/me");
    const call = ((global as any).fetch.mock.calls.at(-1) as any)[1];
    expect(call.headers.Authorization).toBeUndefined();
  });

  it("returns undefined for a 204 No Content response", async () => {
    mainQueue.push(res(undefined, 204));
    const client = new ApiClient("");
    const out = await client.get("/api/data");
    expect(out).toBeUndefined();
  });
});

describe("ApiClient state-changing requests", () => {
  it("fetches a CSRF token and sends it on POST", async () => {
    mainQueue.push(res({ created: true }));
    const client = new ApiClient("");
    await client.post("/api/things", { name: "x" });
    const call = ((global as any).fetch.mock.calls.at(-1) as any)[1];
    expect(call.headers["X-CSRF-Token"]).toBe("csrf-1");
    expect(call.headers["Content-Type"]).toBe("application/json");
    expect(call.method).toBe("POST");
    expect(call.body).toBe(JSON.stringify({ name: "x" }));
  });

  it("supports PATCH and DELETE with bodies", async () => {
    mainQueue.push(res({ ok: true }));
    mainQueue.push(res({ ok: true }));
    const client = new ApiClient("");
    await client.patch("/api/things/1", { a: 1 });
    await client.delete("/api/things/1", { b: 2 });
    expect((global as any).fetch).toHaveBeenCalled();
  });

  it("sends the CSRF token on PATCH requests", async () => {
    mainQueue.push(res({ ok: true }));
    const client = new ApiClient("");
    await client.patch("/api/things/1", { a: 1 });
    const call = ((global as any).fetch.mock.calls.at(-1) as any)[1];
    expect(call.headers["X-CSRF-Token"]).toBe("csrf-1");
  });

  it("retries once with a fresh CSRF token on FST_CSRF_INVALID_TOKEN", async () => {
    mainQueue.push(res({ error: { code: "FST_CSRF_INVALID_TOKEN" } }, 403));
    mainQueue.push(res({ ok: true }));
    const client = new ApiClient("");
    const out = await client.put<{ ok: boolean }>("/api/things/1", { a: 1 });
    expect(out).toEqual({ ok: true });
  });
});

describe("ApiClient error handling", () => {
  it("throws an ApiError carrying the server message and status", async () => {
    mainQueue.push(res({ error: { message: "Nope", code: "BAD" } }, 400));
    const client = new ApiClient("");
    await expect(client.get("/api/data")).rejects.toMatchObject({
      message: "Nope",
      code: "BAD",
      statusCode: 400,
    });
  });

  it("maps a thrown network failure to a statusCode 0 ApiError", async () => {
    (global as any).fetch = mock(async () => {
      throw new Error("connection refused");
    });
    const client = new ApiClient("");
    await expect(client.get("/api/data")).rejects.toMatchObject({
      message: "Network error",
      statusCode: 0,
    });
  });

  it("refreshes the token and retries once on 401", async () => {
    mainQueue.push(res({ error: { message: "expired" } }, 401));
    mainQueue.push(res({ value: "ok" }));
    const client = new ApiClient("");
    const out = await client.get<{ value: string }>("/api/data");
    expect(out).toEqual({ value: "ok" });
    expect(authService.refreshToken).toHaveBeenCalled();
    expect(authState.updateAccessToken).toHaveBeenCalledWith("refreshed-token");
  });

  it("still refreshes on an empty-body 401 (#141)", async () => {
    mainQueue.push(resBadBody(401));
    mainQueue.push(res({ value: "ok" }));
    const client = new ApiClient("");
    const out = await client.get<{ value: string }>("/api/data");
    expect(out).toEqual({ value: "ok" });
    expect(authService.refreshToken).toHaveBeenCalled();
  });

  it("surfaces the real status for a non-JSON 502 body, not statusCode 0 (#141)", async () => {
    mainQueue.push(resBadBody(502));
    const client = new ApiClient("");
    await expect(client.get("/api/data")).rejects.toMatchObject({
      message: "Request failed",
      statusCode: 502,
    });
    expect(authService.refreshToken).not.toHaveBeenCalled();
  });

  it("does not treat a 429 as a 401 (no refresh) (#141)", async () => {
    mainQueue.push(resBadBody(429));
    const client = new ApiClient("");
    await expect(client.get("/api/data")).rejects.toMatchObject({
      statusCode: 429,
    });
    expect(authService.refreshToken).not.toHaveBeenCalled();
  });
});

describe("ApiClient pre-flight refresh on request", () => {
  it("pre-emptively refreshes a token close to expiry", async () => {
    decodeExp.mockReturnValue(Date.now() + 1000); // inside 5s window
    mainQueue.push(res({ value: "ok" }));
    const client = new ApiClient("");
    await client.get("/api/data");
    expect(authService.refreshToken).toHaveBeenCalled();
    const call = ((global as any).fetch.mock.calls.at(-1) as any)[1];
    expect(call.headers.Authorization).toBe("Bearer refreshed-token");
  });

  it("uses a token with plenty of life left unchanged", async () => {
    decodeExp.mockReturnValue(Date.now() + 60_000);
    mainQueue.push(res({ value: "ok" }));
    const client = new ApiClient("");
    await client.get("/api/data");
    expect(authService.refreshToken).not.toHaveBeenCalled();
  });
});

describe("ApiClient.fetchCsrfToken retry", () => {
  it("retries on a 5xx then succeeds", async () => {
    let csrfCalls = 0;
    (global as any).fetch = mock(async (url: string) => {
      if (String(url).includes("/api/auth/csrf-token")) {
        csrfCalls++;
        return csrfCalls === 1 ? res({}, 503) : res({ csrfToken: "csrf-2" });
      }
      return res({ ok: true });
    });
    const client = new ApiClient("");
    await client.post("/api/things", { a: 1 });
    expect(csrfCalls).toBe(2);
    const call = ((global as any).fetch.mock.calls.at(-1) as any)[1];
    expect(call.headers["X-CSRF-Token"]).toBe("csrf-2");
  }, 10_000);
});
