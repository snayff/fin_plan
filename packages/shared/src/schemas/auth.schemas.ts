import { z } from "zod";
import { EMAIL_MAX, PASSWORD_MAX } from "./common.schemas";

/**
 * Minimum length for any newly-set password. Mirrors the registration bound
 * in the backend auth routes/service so the reset and change flows apply the
 * same strength floor.
 */
export const NEW_PASSWORD_MIN = 12;

/** A password being set (register / change / reset): 12–128 chars. */
const newPasswordSchema = z.string().min(NEW_PASSWORD_MIN).max(PASSWORD_MAX);

/**
 * A password supplied for verification only (the current password on change).
 * Only bounded — never re-length-validated, since we merely compare it.
 */
const currentPasswordSchema = z.string().min(1).max(PASSWORD_MAX);

/** Reset token carried in the reset-password link. Bounded to reject oversized payloads. */
const resetTokenSchema = z.string().min(1).max(512);

/**
 * POST /api/auth/change-password (authenticated).
 * Verifies `currentPassword`, sets `newPassword`, and revokes all sessions.
 */
export const changePasswordSchema = z.object({
  currentPassword: currentPasswordSchema,
  newPassword: newPasswordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/**
 * POST /api/auth/forgot-password (unauthenticated).
 * Always returns a generic 200 regardless of whether the account exists.
 */
export const forgotPasswordSchema = z.object({
  email: z.string().trim().max(EMAIL_MAX).email(),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/**
 * POST /api/auth/reset-password (unauthenticated).
 * Validates the reset token, then sets `newPassword` and revokes all sessions.
 */
export const resetPasswordSchema = z.object({
  token: resetTokenSchema,
  newPassword: newPasswordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
