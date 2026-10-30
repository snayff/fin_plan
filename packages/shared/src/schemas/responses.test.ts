import { describe, it, expect } from "bun:test";
import {
  userResponseSchema,
  authLoginResponseSchema,
  householdWithCountResponseSchema,
  successResponseSchema,
  errorResponseSchema,
  messageResponseSchema,
} from "./responses";

const ISO = "2026-01-01T00:00:00.000Z";

const validUser = {
  id: "u1",
  email: "ann@example.com",
  name: "Ann",
  activeHouseholdId: null,
  createdAt: ISO,
  updatedAt: ISO,
};

describe("userResponseSchema", () => {
  it("parses a valid user (preferences optional)", () => {
    expect(userResponseSchema.parse(validUser)).toEqual(validUser);
  });

  it("requires ISO 8601 datetimes with offset", () => {
    expect(() => userResponseSchema.parse({ ...validUser, createdAt: "2026-01-01" })).toThrow();
  });

  // The security promise: .strict() rejects unexpected fields so a leaked
  // sensitive column (passwordHash, twoFactorSecret) never validates as a
  // response shape.
  it("rejects a leaked passwordHash field (strict allowlist)", () => {
    expect(() => userResponseSchema.parse({ ...validUser, passwordHash: "$2b$10$leak" })).toThrow();
  });

  it("rejects a leaked twoFactorSecret field (strict allowlist)", () => {
    expect(() => userResponseSchema.parse({ ...validUser, twoFactorSecret: "JBSWY3DP" })).toThrow();
  });
});

describe("authLoginResponseSchema", () => {
  const valid = { user: validUser, accessToken: "a", refreshToken: "r" };

  it("parses a valid login response", () => {
    expect(authLoginResponseSchema.parse(valid)).toEqual(valid);
  });

  it("rejects an unexpected top-level field", () => {
    expect(() => authLoginResponseSchema.parse({ ...valid, sessionId: "s" })).toThrow();
  });

  it("rejects a sensitive field leaked on the nested user (nested strict)", () => {
    expect(() =>
      authLoginResponseSchema.parse({
        ...valid,
        user: { ...validUser, twoFactorBackupCodes: ["x"] },
      })
    ).toThrow();
  });
});

describe("nested + generic response schemas are strict", () => {
  it("householdWithCountResponseSchema rejects extras on the _count object", () => {
    const base = {
      id: "h1",
      name: "Home",
      createdAt: ISO,
      updatedAt: ISO,
      _count: { members: 2 },
    };
    expect(householdWithCountResponseSchema.parse(base)).toEqual(base);
    expect(() =>
      householdWithCountResponseSchema.parse({ ...base, _count: { members: 2, invites: 1 } })
    ).toThrow();
  });

  it("successResponseSchema only accepts { success: true }", () => {
    expect(successResponseSchema.parse({ success: true })).toEqual({ success: true });
    expect(() => successResponseSchema.parse({ success: false })).toThrow();
    expect(() => successResponseSchema.parse({ success: true, extra: 1 })).toThrow();
  });

  it("messageResponseSchema rejects extra fields", () => {
    expect(messageResponseSchema.parse({ message: "ok" })).toEqual({ message: "ok" });
    expect(() => messageResponseSchema.parse({ message: "ok", code: 1 })).toThrow();
  });

  it("errorResponseSchema enforces the strict error envelope", () => {
    const err = { error: { code: "NOT_FOUND", message: "missing", statusCode: 404 } };
    expect(errorResponseSchema.parse(err)).toEqual(err);
    expect(() =>
      errorResponseSchema.parse({ error: { code: "X", message: "m", stack: "trace" } })
    ).toThrow();
  });
});
