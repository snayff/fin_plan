import { describe, it, expect } from "bun:test";
import {
  generatePasswordResetToken,
  verifyPasswordResetToken,
  peekPasswordResetTokenUserId,
  PASSWORD_RESET_TOKEN_TTL_MS,
} from "./password-reset-token";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const HASH_A = "$2b$12$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const HASH_B = "$2b$12$BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

describe("password-reset-token", () => {
  it("round-trips a token for the same user + password hash", () => {
    const token = generatePasswordResetToken(USER_ID, HASH_A);
    const result = verifyPasswordResetToken(token, HASH_A);
    expect(result).toEqual({ userId: USER_ID });
  });

  it("rejects a token whose signature was tampered with", () => {
    const token = generatePasswordResetToken(USER_ID, HASH_A);
    const tampered = `${token.slice(0, -2)}xy`;
    expect(verifyPasswordResetToken(tampered, HASH_A)).toBeNull();
  });

  it("rejects a garbage / malformed token", () => {
    expect(verifyPasswordResetToken("not-a-real-token", HASH_A)).toBeNull();
    expect(verifyPasswordResetToken("", HASH_A)).toBeNull();
    expect(verifyPasswordResetToken("a.b.c.d", HASH_A)).toBeNull();
  });

  it("is single-use: a token stops validating once the password hash changes", () => {
    const token = generatePasswordResetToken(USER_ID, HASH_A);
    // Simulate the reset succeeding and the hash rotating to HASH_B.
    expect(verifyPasswordResetToken(token, HASH_B)).toBeNull();
  });

  it("rejects an expired token", () => {
    const past = Date.now() - PASSWORD_RESET_TOKEN_TTL_MS - 1000;
    const token = generatePasswordResetToken(USER_ID, HASH_A, past);
    expect(verifyPasswordResetToken(token, HASH_A)).toBeNull();
  });

  it("accepts a token that has not yet expired", () => {
    const nearlyExpired = Date.now() - PASSWORD_RESET_TOKEN_TTL_MS + 60_000;
    const token = generatePasswordResetToken(USER_ID, HASH_A, nearlyExpired);
    expect(verifyPasswordResetToken(token, HASH_A)).toEqual({ userId: USER_ID });
  });

  it("produces a URL-safe token (no +, /, or = characters)", () => {
    const token = generatePasswordResetToken(USER_ID, HASH_A);
    expect(token).not.toMatch(/[+/=]/);
  });

  it("peeks the userId without verifying the signature", () => {
    const token = generatePasswordResetToken(USER_ID, HASH_A);
    // Peek works even against a *different* hash (no signature check).
    expect(peekPasswordResetTokenUserId(token)).toBe(USER_ID);
  });

  it("returns null when peeking a malformed token", () => {
    expect(peekPasswordResetTokenUserId("garbage")).toBeNull();
    expect(peekPasswordResetTokenUserId("")).toBeNull();
  });
});
