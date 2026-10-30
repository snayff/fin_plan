import { prisma } from "../config/database";
import {
  hashPassword,
  verifyPassword,
  MAX_PASSWORD_LENGTH,
  TIMING_EQUALIZATION_HASH,
} from "../utils/password";
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  generateTokenFamily,
  verifyRefreshToken,
} from "../utils/jwt";
import {
  generatePasswordResetToken,
  verifyPasswordResetToken,
  peekPasswordResetTokenUserId,
} from "../utils/password-reset-token";
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../utils/errors";
import { Prisma } from "@prisma/client";

import type { User } from "@prisma/client";

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

export interface LoginInput {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface AuthResponse {
  user: Omit<User, "passwordHash" | "twoFactorSecret" | "twoFactorEnabled">;
  accessToken: string;
  refreshToken: string;
}

const IDLE_SESSION_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;
const ABSOLUTE_SESSION_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000;

function calculateSessionExpiries(now: Date, sessionExpiresAt?: Date) {
  const absoluteExpiry = sessionExpiresAt ?? new Date(now.getTime() + ABSOLUTE_SESSION_TIMEOUT_MS);
  const idleExpiryCandidate = new Date(now.getTime() + IDLE_SESSION_TIMEOUT_MS);
  const idleExpiry =
    idleExpiryCandidate.getTime() > absoluteExpiry.getTime() ? absoluteExpiry : idleExpiryCandidate;

  return {
    expiresAt: idleExpiry,
    sessionExpiresAt: absoluteExpiry,
  };
}

export const authService = {
  /**
   * Register a new user
   */
  async register(input: RegisterInput): Promise<AuthResponse> {
    const { email, password, name } = input;

    // Validate input
    if (!email || !password || !name) {
      throw new ValidationError("Email, password, and name are required");
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new ValidationError("Invalid email format");
    }

    // Validate password strength (minimum 12 characters)
    if (password.length < 12) {
      throw new ValidationError("Password must be at least 12 characters long");
    }

    // Bound password length (bcrypt input limit)
    if (password.length > MAX_PASSWORD_LENGTH) {
      throw new ValidationError(`Password must be at most ${MAX_PASSWORD_LENGTH} characters long`);
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      throw new ConflictError("Registration could not be completed. Please try again or log in.");
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user with default preferences
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        name,
        preferences: {
          currency: "GBP",
          dateFormat: "DD/MM/YYYY",
          theme: "dark",
          defaultInflationRate: 2.5,
        },
      },
    });

    // Generate tokens — user starts with no household (created via WelcomePage)
    const accessToken = generateAccessToken({ userId: user.id, email: user.email });
    const refreshToken = generateRefreshToken({ userId: user.id });

    // Store refresh token with family tracking
    const now = new Date();
    const { expiresAt, sessionExpiresAt } = calculateSessionExpiries(now);
    const familyId = generateTokenFamily();
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        familyId,
        expiresAt,
        sessionExpiresAt,
        rememberMe: false,
      },
    });

    // Remove password hash from response
    const {
      passwordHash: _,
      twoFactorSecret: _2,
      twoFactorEnabled: _3,
      ...userWithoutPassword
    } = user;

    return {
      user: userWithoutPassword,
      accessToken,
      refreshToken,
    };
  },

  /**
   * Login user
   */
  async login(
    input: LoginInput & { ipAddress?: string; userAgent?: string }
  ): Promise<AuthResponse> {
    const { email, password, rememberMe = false, ipAddress, userAgent } = input;

    // Validate input
    if (!email || !password) {
      throw new ValidationError("Email and password are required");
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      // Run an equivalent-cost comparison so response timing matches the
      // stored-hash path regardless of whether the account exists.
      await verifyPassword(password, TIMING_EQUALIZATION_HASH);
      throw new AuthenticationError("Invalid credentials");
    }

    // Verify password
    const isPasswordValid = await verifyPassword(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new AuthenticationError("Invalid credentials");
    }

    // Generate tokens
    const accessToken = generateAccessToken({ userId: user.id, email: user.email });
    const refreshToken = generateRefreshToken({ userId: user.id });

    // Store refresh token with family tracking
    const now = new Date();
    const { expiresAt, sessionExpiresAt } = calculateSessionExpiries(now);
    const familyId = generateTokenFamily();
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        familyId,
        expiresAt,
        sessionExpiresAt,
        rememberMe: Boolean(rememberMe),
        ipAddress,
        userAgent,
      },
    });

    // Remove password hash from response
    const {
      passwordHash: _,
      twoFactorSecret: _2,
      twoFactorEnabled: _3,
      ...userWithoutPassword
    } = user;

    return {
      user: userWithoutPassword,
      accessToken,
      refreshToken,
    };
  },

  /**
   * Find user by ID
   */
  async findUserById(
    userId: string
  ): Promise<Omit<User, "passwordHash" | "twoFactorSecret" | "twoFactorEnabled"> | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return null;
    }

    const {
      passwordHash: _,
      twoFactorSecret: _2,
      twoFactorEnabled: _3,
      ...userWithoutPassword
    } = user;
    return userWithoutPassword;
  },

  /**
   * Find user by email
   */
  async findUserByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
  },

  /**
   * Update user display name
   */
  async updateUserName(
    userId: string,
    name: string
  ): Promise<Omit<User, "passwordHash" | "twoFactorSecret" | "twoFactorEnabled">> {
    try {
      const user = await prisma.user.update({
        where: { id: userId },
        data: { name },
      });
      const {
        passwordHash: _,
        twoFactorSecret: _2,
        twoFactorEnabled: _3,
        ...userWithoutPassword
      } = user;
      return userWithoutPassword;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new NotFoundError("User not found");
      }
      throw error;
    }
  },

  /**
   * Refresh access token using refresh token (with rotation)
   * Returns a new access token AND a new refresh token.
   * The old refresh token is revoked. If a revoked token is reused,
   * the entire token family is revoked (replay attack detection).
   * Rotation (revoke old + create new) commits atomically, so a session
   * can never be left mid-rotation by a crash or concurrent refresh.
   */
  async refreshAccessToken(
    refreshToken: string,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    rememberMe: boolean;
    expiresAt: Date;
    sessionExpiresAt: Date;
    userId: string;
  }> {
    if (!refreshToken) {
      throw new AuthenticationError("Refresh token is required");
    }

    try {
      // Verify JWT signature and expiry
      const payload = verifyRefreshToken(refreshToken);
      const tokenHash = hashToken(refreshToken);

      // Look up the token in the database
      const storedToken = await prisma.refreshToken.findUnique({
        where: { tokenHash },
      });

      if (!storedToken) {
        throw new AuthenticationError("Invalid refresh token");
      }

      // Reuse detection: if this token was already revoked, an attacker
      // is replaying it. Revoke the entire family to protect the user.
      if (storedToken.isRevoked) {
        await prisma.refreshToken.updateMany({
          where: { familyId: storedToken.familyId },
          data: { isRevoked: true },
        });
        throw new AuthenticationError(
          "Refresh token reuse detected — all sessions in this family have been revoked"
        );
      }

      const now = new Date();

      // Check idle expiry (belt-and-suspenders with JWT expiry)
      if (storedToken.expiresAt < now) {
        throw new AuthenticationError("Refresh token expired");
      }

      // Check absolute session cap.
      if (storedToken.sessionExpiresAt < now) {
        throw new AuthenticationError("Session expired - please login again");
      }

      // Find user
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
      });

      if (!user) {
        throw new AuthenticationError("User not found");
      }

      // Generate new token pair
      const newAccessToken = generateAccessToken({ userId: user.id, email: user.email });
      const newRefreshToken = generateRefreshToken({ userId: user.id });
      const { expiresAt, sessionExpiresAt } = calculateSessionExpiries(
        now,
        storedToken.sessionExpiresAt
      );

      // Atomic rotation: claim (revoke) the old token and store its
      // replacement in one transaction. The guarded updateMany only succeeds
      // for the request that claims the token first; a concurrent refresh of
      // the same token claims nothing and is treated as reuse below.
      const rotated = await prisma.$transaction(async (tx) => {
        const claimed = await tx.refreshToken.updateMany({
          where: { id: storedToken.id, isRevoked: false },
          data: { isRevoked: true, lastUsedAt: now },
        });

        if (claimed.count === 0) {
          return false;
        }

        // Store new refresh token in the same family
        await tx.refreshToken.create({
          data: {
            userId: user.id,
            tokenHash: hashToken(newRefreshToken),
            familyId: storedToken.familyId, // Same family for reuse detection
            expiresAt,
            sessionExpiresAt,
            rememberMe: storedToken.rememberMe,
            ipAddress: context?.ipAddress,
            userAgent: context?.userAgent,
            lastUsedAt: now,
          },
        });

        return true;
      });

      if (!rotated) {
        // Another request rotated this token between our read and the claim —
        // same protection as the replay path above.
        await prisma.refreshToken.updateMany({
          where: { familyId: storedToken.familyId },
          data: { isRevoked: true },
        });
        throw new AuthenticationError(
          "Refresh token reuse detected — all sessions in this family have been revoked"
        );
      }

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        rememberMe: storedToken.rememberMe,
        expiresAt,
        sessionExpiresAt,
        userId: user.id,
      };
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }
      throw new AuthenticationError("Invalid or expired refresh token");
    }
  },

  /**
   * Revoke all refresh tokens for a user (logout everywhere)
   */
  async revokeAllUserTokens(userId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true },
    });
  },

  /**
   * Change the password for an authenticated user.
   *
   * Verifies the current password, stores the new hash, and revokes every
   * refresh token for the user so all other sessions are logged out. The
   * caller (route) is responsible for blacklisting the *current* access token
   * if it wants the acting session terminated too.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      // Authenticated route, so this is effectively unreachable — treat a
      // vanished user as an auth failure rather than leaking a 404.
      throw new AuthenticationError("Invalid credentials");
    }

    const isCurrentValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isCurrentValid) {
      throw new AuthenticationError("Current password is incorrect");
    }

    if (newPassword.length < 12) {
      throw new ValidationError("Password must be at least 12 characters long");
    }
    if (newPassword.length > MAX_PASSWORD_LENGTH) {
      throw new ValidationError(`Password must be at most ${MAX_PASSWORD_LENGTH} characters long`);
    }

    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    // Log out all other sessions (reuse the logout-everywhere revocation).
    await this.revokeAllUserTokens(userId);
  },

  /**
   * Create a single-use, expiring password-reset token for the given email.
   *
   * Returns null when no account matches — the caller MUST return an identical
   * generic response in both cases to prevent account enumeration. The token is
   * stateless and self-invalidating (see utils/password-reset-token.ts): it is
   * bound to a fingerprint of the current password hash, so it stops validating
   * the moment the password changes.
   */
  async createPasswordResetToken(email: string): Promise<{ token: string; email: string } | null> {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (!user) {
      return null;
    }

    const token = generatePasswordResetToken(user.id, user.passwordHash);
    return { token, email: user.email };
  },

  /**
   * Complete a password reset using a token from the reset email.
   *
   * Validates the token against the user's live password hash (unexpired,
   * untampered, and not already used — a prior reset would have rotated the
   * hash and invalidated the token). On success, stores the new hash and
   * revokes all sessions. Returns the userId for audit attribution.
   *
   * All failure modes raise a single generic ValidationError so the endpoint
   * never reveals whether the token, the account, or the expiry was at fault.
   */
  async resetPassword(token: string, newPassword: string): Promise<string> {
    const genericError = new ValidationError("This reset link is invalid or has expired");

    const peekedUserId = peekPasswordResetTokenUserId(token);
    if (!peekedUserId) {
      throw genericError;
    }

    const user = await prisma.user.findUnique({ where: { id: peekedUserId } });
    if (!user) {
      throw genericError;
    }

    const verified = verifyPasswordResetToken(token, user.passwordHash);
    if (!verified || verified.userId !== user.id) {
      throw genericError;
    }

    if (newPassword.length < 12) {
      throw new ValidationError("Password must be at least 12 characters long");
    }
    if (newPassword.length > MAX_PASSWORD_LENGTH) {
      throw new ValidationError(`Password must be at most ${MAX_PASSWORD_LENGTH} characters long`);
    }

    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    // Reset invalidates every existing session.
    await this.revokeAllUserTokens(user.id);

    return user.id;
  },

  /**
   * Revoke a specific token family (single session logout)
   */
  async revokeTokenFamily(familyId: string, userId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { familyId, userId },
      data: { isRevoked: true },
    });
  },

  /**
   * Get active sessions for a user (grouped by token family)
   */
  async getUserSessions(userId: string) {
    // Get the latest non-revoked token per family to represent each session
    const tokens = await prisma.refreshToken.findMany({
      where: { userId, isRevoked: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        familyId: true,
        ipAddress: true,
        userAgent: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });

    // Deduplicate by familyId (keep the most recent per family)
    const seen = new Set<string>();
    return tokens.filter((t: (typeof tokens)[number]) => {
      if (seen.has(t.familyId)) return false;
      seen.add(t.familyId);
      return true;
    });
  },

  /**
   * Revoke a single session by its family ID (with ownership check)
   */
  async revokeSession(sessionFamilyId: string, userId: string): Promise<boolean> {
    const result = await prisma.refreshToken.updateMany({
      where: { familyId: sessionFamilyId, userId },
      data: { isRevoked: true },
    });
    return result.count > 0;
  },

  /**
   * Clean up expired refresh tokens (housekeeping)
   */
  async cleanupExpiredTokens(): Promise<number> {
    const result = await prisma.refreshToken.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: new Date() } }, { sessionExpiresAt: { lt: new Date() } }],
      },
    });
    return result.count;
  },
};
