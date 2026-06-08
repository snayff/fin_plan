import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { TwoPanelLayout } from "../components/layout/TwoPanelLayout.js";
import { AssetsLeftPanel } from "../components/assets/AssetsLeftPanel.js";
import { AssetItemArea } from "../components/assets/AssetItemArea.js";
import { AccountItemArea } from "../components/assets/AccountItemArea.js";
import { useAssetsSummary } from "../hooks/useAssets.js";
import type { AssetType, AccountType } from "@finplan/shared";
import { useFocusParam } from "@/features/search/useFocusParam";
import { useAddParam } from "@/features/search/useAddParam";

type SelectedType = AssetType | AccountType;
const ASSET_TYPES: AssetType[] = ["Property", "Vehicle", "Other"];

export default function AssetsPage() {
  const [selected, setSelected] = useState<SelectedType>("Property");
  const { data: summary } = useAssetsSummary();
  const [searchParams] = useSearchParams();
  const addKind = searchParams.get("add");

  // If ?add=account, switch to the account view
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
      left={<AssetsLeftPanel summary={summary} selected={selected} onSelect={setSelected} />}
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
