import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { TwoPanelLayout } from "../components/layout/TwoPanelLayout.js";
import { AssetsLeftPanel } from "../components/assets/AssetsLeftPanel.js";
import { AssetItemArea } from "../components/assets/AssetItemArea.js";
import { AccountItemArea } from "../components/assets/AccountItemArea.js";
import { useAssetsSummary } from "../hooks/useAssets.js";
import { useUrlSelection } from "@/hooks/useUrlSelection";
import type { AssetType, AccountType } from "@finplan/shared";
import { useFocusParam } from "@/features/search/useFocusParam";
import { useAddParam } from "@/features/search/useAddParam";

type SelectedType = AssetType | AccountType;
const ASSET_TYPES: AssetType[] = ["Property", "Vehicle", "Other"];
const ACCOUNT_TYPES: AccountType[] = ["Current", "Savings", "Pension", "StocksAndShares", "Other"];
// "Other" appears in both unions — dedupe for the validator.
const ALL_TYPES = Array.from(new Set<string>([...ASSET_TYPES, ...ACCOUNT_TYPES]));

export default function AssetsPage() {
  const { data: summary } = useAssetsSummary();
  const [searchParams] = useSearchParams();
  const addKind = searchParams.get("add");

  // URL is the single source of truth for selected type.
  // Validator accepts only known asset/account enum members; invalid values clear.
  const validateType = useCallback((v: string) => ALL_TYPES.includes(v), []);
  const [urlSelected, setSelected] = useUrlSelection({ param: "type", validate: validateType });
  const selected: SelectedType = (urlSelected as SelectedType) ?? "Property";

  // If ?add=account, switch to the account view on first mount.
  useEffect(() => {
    if (addKind === "account" && ASSET_TYPES.includes(selected as AssetType)) {
      setSelected("Current");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useAddParam((_kind) => {
    // add param consumed — initialIsAdding prop handles modal
  });
  useFocusParam((id) => {
    const el = document.querySelector(`[data-search-focus="${id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("search-focus-pulse");
      setTimeout(() => el.classList.remove("search-focus-pulse"), 1200);
    }
  });

  const isAssetType = ASSET_TYPES.includes(selected as AssetType);

  return (
    <TwoPanelLayout
      selectedKey={urlSelected}
      left={
        <AssetsLeftPanel summary={summary} selected={selected} onSelect={(t) => setSelected(t)} />
      }
      right={
        isAssetType ? (
          <AssetItemArea
            type={selected as AssetType}
            initialIsAdding={addKind === "asset" || addKind === "1"}
          />
        ) : (
          <AccountItemArea type={selected as AccountType} initialIsAdding={addKind === "account"} />
        )
      }
    />
  );
}
