import { describe, it, expect } from "bun:test";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  decodeToken,
} from "./jwt";
import jwt from "jsonwebtoken";

describe("generateAccessToken", () => {
  it("generates a valid JWT string", () => {
    const token = generateAccessToken({ userId: "user-1", email: "test@test.com" });
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3);
  });

  it("token contains userId and email in payload", () => {
    const token = generateAccessToken({ userId: "user-1", email: "test@test.com" });
    const decoded = jwt.decode(token) as any;
    expect(decoded.userId).toBe("user-1");
    expect(decoded.email).toBe("test@test.com");
  });

  it("token has an expiration", () => {
    const token = generateAccessToken({ userId: "user-1", email: "test@test.com" });
    const decoded = jwt.decode(token) as any;
    expect(decoded.exp).toBeDefined();
    expect(decoded.iat).toBeDefined();
  });
});

describe("verifyAccessToken", () => {
  it("returns payload for valid token", () => {
    const token = generateAccessToken({ userId: "user-1", email: "test@test.com" });
    const payload = verifyAccessToken(token);
    expect(payload.userId).toBe("user-1");
    expect(payload.email).toBe("test@test.com");
  });

  it('throws "Token expired" for expired token', () => {
    // Generate token with 0 seconds expiry using the raw jwt library
    const token = jwt.sign({ userId: "user-1", email: "test@test.com" }, process.env.JWT_SECRET!, {
      expiresIn: "0s",
    });
    expect(() => verifyAccessToken(token)).toThrow("Token expired");
  });

  it('throws "Invalid token" for tampered token', () => {
    const token = generateAccessToken({ userId: "user-1", email: "test@test.com" });
    const tamperedToken = token.slice(0, -5) + "XXXXX";
    expect(() => verifyAccessToken(tamperedToken)).toThrow("Invalid token");
  });

  it('throws "Invalid token" for token signed with wrong secret', () => {
    const token = jwt.sign(
      { userId: "user-1", email: "test@test.com" },
      "completely-different-secret-key-that-is-32-chars-long",
      { expiresIn: "15m" }
    );
    expect(() => verifyAccessToken(token)).toThrow("Invalid token");
  });

  it('throws "Invalid token" for a token signed with a non-pinned algorithm', () => {
    // Signed with the correct secret but HS512 — verification pins HS256.
    const token = jwt.sign({ userId: "user-1", email: "test@test.com" }, process.env.JWT_SECRET!, {
      expiresIn: "15m",
      algorithm: "HS512",
    });
    expect(() => verifyAccessToken(token)).toThrow("Invalid token");
  });

  it('throws "Invalid token" when required claims are missing', () => {
    const token = jwt.sign({ email: "test@test.com" }, process.env.JWT_SECRET!, {
      expiresIn: "15m",
    });
    expect(() => verifyAccessToken(token)).toThrow("Invalid token");
  });
});

describe("generateRefreshToken", () => {
  it("generates a valid JWT string", () => {
    const token = generateRefreshToken({ userId: "user-1" });
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3);
  });

  it("token contains userId in payload", () => {
    const token = generateRefreshToken({ userId: "user-1" });
    const decoded = jwt.decode(token) as any;
    expect(decoded.userId).toBe("user-1");
  });
});

describe("verifyRefreshToken", () => {
  it("returns payload for valid token", () => {
    const token = generateRefreshToken({ userId: "user-1" });
    const payload = verifyRefreshToken(token);
    expect(payload.userId).toBe("user-1");
  });

  it('throws "Refresh token expired" for expired token', () => {
    const token = jwt.sign({ userId: "user-1" }, process.env.JWT_REFRESH_SECRET!, {
      expiresIn: "0s",
    });
    expect(() => verifyRefreshToken(token)).toThrow("Refresh token expired");
  });

  it('throws "Invalid refresh token" for tampered token', () => {
    const token = generateRefreshToken({ userId: "user-1" });
    const tamperedToken = token.slice(0, -5) + "XXXXX";
    expect(() => verifyRefreshToken(tamperedToken)).toThrow("Invalid refresh token");
  });

  it('throws "Invalid refresh token" for a token signed with a non-pinned algorithm', () => {
    const token = jwt.sign({ userId: "user-1" }, process.env.JWT_REFRESH_SECRET!, {
      expiresIn: "7d",
      algorithm: "HS512",
    });
    expect(() => verifyRefreshToken(token)).toThrow("Invalid refresh token");
  });
});

describe("decodeToken", () => {
  it("decodes token without verifying", () => {
    const token = generateAccessToken({ userId: "user-1", email: "test@test.com" });
    const decoded = decodeToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.userId).toBe("user-1");
    expect(decoded!.email).toBe("test@test.com");
  });

  it("returns null for garbage input", () => {
    expect(decodeToken("not-a-jwt-at-all")).toBeNull();
  });
});
