// OWASP-recommended bcrypt work factor.
const SALT_ROUNDS = 12;

/**
 * Maximum accepted password length. Bounds bcrypt input (bcrypt only uses the
 * first 72 bytes anyway) and prevents oversized hashing work. Enforced by the
 * request schemas and re-checked in the services.
 */
export const MAX_PASSWORD_LENGTH = 128;

/**
 * Precomputed bcrypt hash (cost 12) of a throwaway constant. Used to run a
 * comparison of equivalent cost on login paths that have no stored hash, so
 * response timing does not reveal whether an account exists. Verification
 * against it is never treated as success.
 */
export const TIMING_EQUALIZATION_HASH =
  "$2b$12$CTbdqimOyiTuMESblLPAaOvGCJmYVSdF4cBiSLtRzg3Ioth7UKAv6";

/**
 * Hash a plain text password
 */
export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: "bcrypt", cost: SALT_ROUNDS });
}

/**
 * Verify a plain text password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return Bun.password.verify(password, hash);
}
