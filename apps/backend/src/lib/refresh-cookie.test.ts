import { describe, it, expect, beforeEach } from "bun:test";
import type { FastifyReply } from "fastify";
import { setRefreshTokenCookie, clearRefreshTokenCookie } from "./refresh-cookie";
import { config } from "../config/env";

type SetCall = { name: string; value: string; options: Record<string, unknown> };
type ClearCall = { name: string; options: Record<string, unknown> };

function makeReply() {
  const setCalls: SetCall[] = [];
  const clearCalls: ClearCall[] = [];
  const reply = {
    setCookie(name: string, value: string, options: Record<string, unknown>) {
      setCalls.push({ name, value, options });
      return reply;
    },
    clearCookie(name: string, options: Record<string, unknown>) {
      clearCalls.push({ name, options });
      return reply;
    },
  };
  return { reply: reply as unknown as FastifyReply, setCalls, clearCalls };
}

const REFRESH_PATH = "/api/auth/refresh";
const SEVEN_DAYS = 7 * 24 * 60 * 60;

describe("setRefreshTokenCookie", () => {
  let setCalls: SetCall[];
  let reply: FastifyReply;

  beforeEach(() => {
    ({ reply, setCalls } = makeReply());
  });

  it("sets the refreshToken cookie with the secure attribute contract", () => {
    setRefreshTokenCookie(reply, "tok");

    expect(setCalls).toHaveLength(1);
    const { name, value, options } = setCalls[0]!;
    expect(name).toBe("refreshToken");
    expect(value).toBe("tok");
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("strict");
    expect(options.path).toBe(REFRESH_PATH);
    expect(options.secure).toBe(config.NODE_ENV === "production");
  });

  it("omits maxAge for a session cookie by default", () => {
    setRefreshTokenCookie(reply, "tok");
    expect(setCalls[0]!.options.maxAge).toBeUndefined();
  });

  it("sets a 7-day maxAge when rememberMe is true", () => {
    setRefreshTokenCookie(reply, "tok", { rememberMe: true });
    expect(setCalls[0]!.options.maxAge).toBe(SEVEN_DAYS);
  });

  it("honours an explicit positive maxAgeSeconds when rememberMe is true", () => {
    setRefreshTokenCookie(reply, "tok", { rememberMe: true, maxAgeSeconds: 60 });
    expect(setCalls[0]!.options.maxAge).toBe(60);
  });

  it("ignores a non-positive maxAgeSeconds and falls back to the 7-day default", () => {
    setRefreshTokenCookie(reply, "tok", { rememberMe: true, maxAgeSeconds: 0 });
    expect(setCalls[0]!.options.maxAge).toBe(SEVEN_DAYS);
  });
});

describe("clearRefreshTokenCookie", () => {
  it("clears the refreshToken cookie scoped to the refresh path", () => {
    const { reply, clearCalls } = makeReply();

    clearRefreshTokenCookie(reply);

    expect(clearCalls).toHaveLength(1);
    expect(clearCalls[0]!.name).toBe("refreshToken");
    expect(clearCalls[0]!.options.path).toBe(REFRESH_PATH);
  });
});
