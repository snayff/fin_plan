import { prisma } from "../config/database.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";

/**
 * Shared ownership / scoping guards.
 *
 * Extracted from waterfall/gifts/planner/assets services to remove verbatim
 * duplication. Behavior is preserved exactly: each guard masks "not found" and
 * "not owned" into the same error to avoid leaking resource existence to
 * unauthorised callers (per the security convention).
 */

/**
 * Assert that an already-fetched entity exists and belongs to the household.
 *
 * Both the missing case and the wrong-household case throw an identical
 * `NotFoundError` so callers cannot distinguish "does not exist" from
 * "exists but not yours".
 */
export function assertOwned(
  item: { householdId: string } | null,
  householdId: string,
  label: string
): void {
  if (!item) throw new NotFoundError(`${label} not found`);
  if (item.householdId !== householdId) throw new NotFoundError(`${label} not found`);
}

/**
 * Assert that a member belongs to the household.
 *
 * The two existing call sites differ in query strategy and error type, so those
 * are preserved via options rather than unified:
 *   - `waterfall` uses `findFirst` + `NotFoundError("Household member not found")`
 *   - `assets`    uses `findUnique` + `ValidationError("Member not found in household")`
 */
export async function assertMemberInHousehold(
  householdId: string,
  memberId: string,
  opts: {
    query: "findFirst" | "findUnique";
    error: "NotFoundError" | "ValidationError";
    message: string;
  }
): Promise<void> {
  const member =
    opts.query === "findFirst"
      ? await prisma.member.findFirst({ where: { householdId, id: memberId } })
      : await prisma.member.findUnique({
          where: { id: memberId },
          select: { id: true, householdId: true },
        });

  if (!member || member.householdId !== householdId) {
    if (opts.error === "ValidationError") throw new ValidationError(opts.message);
    throw new NotFoundError(opts.message);
  }
}
