import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { TwoPanelLayout } from "../components/layout/TwoPanelLayout.js";
import { AssetsLeftPanel } from "../components/assets/AssetsLeftPanel.js";
import { AssetItemArea } from "../components/assets/AssetItemArea.js";
import { AccountItemArea } from "../components/assets/AccountItemArea.js";
import { useAssetsSummary } from "../hooks/useAssets.js";
import { useUrlSelection } from "@/hooks/useUrlSelection";
import { useFocusParam } from "@/features/search/useFocusParam";
import { useAddParam } from "@/features/search/useAddParam";
import {
  keyToSelection,
  selectionToKey,
  type AssetsSelection,
} from "../components/assets/assetsSelection.js";

const DEFAULT_SELECTION: AssetsSelection = { kind: "asset", type: "Property" };

export default function AssetsPage() {
  const { data: summary } = useAssetsSummary();
  const [searchParams] = useSearchParams();
  const addKind = searchParams.get("add");

  // URL is the single source of truth for selected type.
  // Validator accepts only known asset/account enum members; invalid values clear.
  const validateType = useCallback((v: string) => keyToSelection(v) !== null, []);
  const [urlSelected, setSelectedKey] = useUrlSelection({ param: "type", validate: validateType });
  const selected = keyToSelection(urlSelected) ?? DEFAULT_SELECTION;
  const setSelected = (s: AssetsSelection) => setSelectedKey(selectionToKey(s));

  // If ?add=account, switch to the account view on first mount.
  useEffect(() => {
    if (addKind === "account" && selected.kind === "asset") {
      setSelected({ kind: "account", type: "Current" });
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

  return (
    <TwoPanelLayout
      selectedKey={urlSelected}
      left={
        <AssetsLeftPanel summary={summary} selected={selected} onSelect={setSelected} />
      }
      right={
        selected.kind === "asset" ? (
          <AssetItemArea
            type={selected.type}
            initialIsAdding={addKind === "asset" || addKind === "1"}
          />
        ) : (
          <AccountItemArea type={selected.type} initialIsAdding={addKind === "account"} />
        )
      }
    />
  );
}
