interface NudgeContent {
  message: string;
  options?: string[];
}

// ─── Savings allocation nudge ────────────────────────────────────────────────

export function useSavingsNudge(
  _itemId: string,
  itemType: string,
  isReadOnly: boolean
): NudgeContent | null {
  if (itemType !== "savings_allocation" || isReadOnly) return null;

  // Account-level rate nudges will be re-implemented against the new Assets system in Task 8
  return null;
}

// ─── Account nudge ────────────────────────────────────────────────────────────

// Placeholder — will be re-implemented against the new Assets system in Task 8
export function useWealthAccountNudge(_account: unknown): NudgeContent | null {
  return null;
}
