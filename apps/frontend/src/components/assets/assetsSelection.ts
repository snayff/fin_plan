import type { AssetType, AccountType } from "@finplan/shared";

export const ASSET_TYPES: AssetType[] = ["Property", "Vehicle", "Other"];
export const ACCOUNT_TYPES: AccountType[] = [
  "Current",
  "Savings",
  "Pension",
  "StocksAndShares",
  "Other",
];

/**
 * What the Assets page has selected. "Other" exists in both the asset and the
 * account unions, so the kind must travel with the type — comparing bare type
 * strings would select both "Other" rows and always route to the asset list.
 */
export type AssetsSelection =
  { kind: "asset"; type: AssetType } | { kind: "account"; type: AccountType };

// URL key for the account-side "Other". Every other type keeps its bare name so
// existing ?type= links continue to work.
const ACCOUNT_OTHER_KEY = "OtherAccount";

export function selectionToKey(s: AssetsSelection): string {
  return s.kind === "account" && s.type === "Other" ? ACCOUNT_OTHER_KEY : s.type;
}

export function keyToSelection(key: string | null | undefined): AssetsSelection | null {
  if (!key) return null;
  if (key === ACCOUNT_OTHER_KEY) return { kind: "account", type: "Other" };
  if ((ASSET_TYPES as string[]).includes(key)) return { kind: "asset", type: key as AssetType };
  if ((ACCOUNT_TYPES as string[]).includes(key))
    return { kind: "account", type: key as AccountType };
  return null;
}

export function isSameSelection(a: AssetsSelection, b: AssetsSelection): boolean {
  return a.kind === b.kind && a.type === b.type;
}
