import { z } from "zod";

/**
 * Shared input-validation primitives.
 *
 * Every user-supplied number and string must be bounded: unbounded floats
 * (Infinity, 1e308) poison derived figures and persist into snapshots, and
 * unbounded strings allow megabyte payloads in name/notes fields.
 *
 * Use these helpers in every create/update schema rather than bare
 * `z.number()` / `z.string()`.
 */

// ─── Numeric limits ──────────────────────────────────────────────────────────

/** Generous upper bound for any money amount (£1 trillion). */
export const MONEY_MAX = 1_000_000_000_000;

/** Upper bound for integer ordering fields. */
export const SORT_ORDER_MAX = 1_000_000;

/** Calendar-year bounds used across planner/cashflow inputs. */
export const YEAR_MIN = 2000;
export const YEAR_MAX = 2100;

/** Money amount that must be strictly greater than zero. */
export const positiveMoneySchema = z.number().finite().positive().max(MONEY_MAX);

/** Money amount that must be zero or greater. */
export const nonNegativeMoneySchema = z.number().finite().min(0).max(MONEY_MAX);

/** Money amount that may be negative (signed values, deltas). */
export const signedMoneySchema = z.number().finite().min(-MONEY_MAX).max(MONEY_MAX);

/** Percentage following the codebase convention of 0–100. */
export const percentageSchema = z.number().finite().min(0).max(100);

/** Percentage that may be negative (e.g. depreciation rates), -100–100. */
export const signedPercentageSchema = z.number().finite().min(-100).max(100);

/** Integer sort-order field. */
export const sortOrderSchema = z.number().int().min(0).max(SORT_ORDER_MAX);

/** Calendar year field. */
export const yearSchema = z.number().int().min(YEAR_MIN).max(YEAR_MAX);

// ─── Date limits ─────────────────────────────────────────────────────────────

/** Lower/upper calendar-year bounds for any coerced date input. */
export const DATE_YEAR_MIN = 1900;
export const DATE_YEAR_MAX = 2200;

/**
 * Coerced date constrained to a sane calendar range. Bare `z.coerce.date()`
 * accepts year 99999 (and Infinity-derived dates), which poisons forecasts and
 * date arithmetic. Use this anywhere a date arrives from user input.
 */
export const boundedDate = z.coerce.date().refine((d) => {
  const y = d.getUTCFullYear();
  return y >= DATE_YEAR_MIN && y <= DATE_YEAR_MAX;
}, "date out of range");

// ─── String limits ───────────────────────────────────────────────────────────

/** Short user-facing names (items, people, households, accounts…). */
export const NAME_MAX = 100;

/** Free-text notes / descriptions / comments. */
export const NOTES_MAX = 500;

/** RFC 5321 maximum length of an email address. */
export const EMAIL_MAX = 254;

/** Maximum accepted password length (hashing cost guard). */
export const PASSWORD_MAX = 128;

/** Maximum length for entity identifiers (cuid/uuid plus prefixes). */
export const ID_MAX = 64;

/** Required short name, trimmed. */
export const nameSchema = z.string().trim().min(1).max(NAME_MAX);

/**
 * Subcategory display name. Capped at 24 chars — the narrowest waterfall
 * column tolerates roughly this many characters before truncating, so both
 * the create and batch-save paths standardise on this limit (#119).
 */
export const SUBCATEGORY_NAME_MAX = 24;
export const subcategoryNameSchema = z.string().trim().min(1).max(SUBCATEGORY_NAME_MAX);

/** Free-text notes field. */
export const notesSchema = z.string().trim().max(NOTES_MAX);

/** Entity identifier (cuid/uuid, optionally prefixed). */
export const idSchema = z.string().min(1).max(ID_MAX);

/** Email address with sane length cap. */
export const emailSchema = z.string().trim().max(EMAIL_MAX).email();
