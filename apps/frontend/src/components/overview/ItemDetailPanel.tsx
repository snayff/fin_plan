import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/utils/format";
import { Button } from "@/components/ui/button";
import { ButtonPair } from "@/components/common/ButtonPair";
import { HistoryChart } from "./HistoryChart";
import { useItemHistory, useConfirmItem, useUpdateItem } from "@/hooks/useWaterfall";
import { isStale, stalenessLabel } from "@/utils/staleness";
import { useSettings, getStalenessMonths, type StalenessItemType } from "@/hooks/useSettings";
import { CreateSnapshotModal } from "./CreateSnapshotModal";
import { NudgeCard } from "@/components/common/NudgeCard";
import { SkeletonLoader } from "@/components/common/SkeletonLoader";
import { PanelError } from "@/components/common/PanelError";
import { useSavingsNudge } from "@/hooks/useNudge";
import { GlossaryTermMarker } from "@/components/help/GlossaryTermMarker";

interface SelectedItem {
  id: string;
  type: string;
  name: string;
  amount: number;
  lastReviewedAt: Date;
  wealthAccountId?: string | null;
}

interface ItemDetailPanelProps {
  item: SelectedItem;
  onBack: () => void;
  snapshotDate?: Date | null;
  isReadOnly?: boolean;
}

type InlineMode = "none" | "edit";

export function ItemDetailPanel({
  item,
  onBack,
  snapshotDate,
  isReadOnly: isReadOnlyProp,
}: ItemDetailPanelProps) {
  const [inlineMode, setInlineMode] = useState<InlineMode>("none");
  const [editAmount, setEditAmount] = useState(String(item.amount));
  const [showSnapshotPrompt, setShowSnapshotPrompt] = useState(false);
  const [showSnapshotModal, setShowSnapshotModal] = useState(false);

  const {
    data: historyRaw,
    isLoading: historyLoading,
    isError: historyError,
    refetch: historyRefetch,
  } = useItemHistory(item.type, item.id);
  const confirmItem = useConfirmItem();
  const updateItem = useUpdateItem();
  const { data: settings } = useSettings();
  const showPence = settings?.showPence ?? false;
  const isReadOnly = !!isReadOnlyProp || snapshotDate != null;
  const savingsNudge = useSavingsNudge(item.id, item.type, isReadOnly);

  if (historyLoading && !historyRaw) return <SkeletonLoader variant="right-panel" />;
  if (historyError && !historyRaw)
    return (
      <PanelError variant="detail" onRetry={historyRefetch} message="Could not load item history" />
    );

  const history: { recordedAt: string; value: number }[] = (historyRaw ?? []).map(
    (h: { recordedAt: string; value: number; id: string }) => ({
      recordedAt: h.recordedAt,
      value: h.value,
    })
  );

  // Map the detail-panel item type onto a canonical staleness key so custom
  // thresholds set in settings are honoured.
  const stalenessTypeMap: Record<string, StalenessItemType> = {
    income_source: "income_source",
    committed_bill: "committed_item",
    yearly_bill: "committed_item",
    discretionary_category: "discretionary_item",
    savings_allocation: "discretionary_item",
  };
  const thresholdMonths = getStalenessMonths(
    settings,
    stalenessTypeMap[item.type] ?? "discretionary_item"
  );
  const itemIsStale = isStale(item.lastReviewedAt, thresholdMonths);

  const breadcrumbLabel = (() => {
    switch (item.type) {
      case "income_source":
        return "Income";
      case "committed_bill":
        return "Committed";
      case "yearly_bill":
        return "Committed / Yearly Bills";
      case "discretionary_category":
        return "Discretionary";
      case "savings_allocation":
        return "Discretionary / Savings";
      default:
        return "Overview";
    }
  })();

  function handleConfirm() {
    confirmItem.mutate(
      { type: item.type as Parameters<typeof confirmItem.mutate>[0]["type"], id: item.id },
      {
        onSuccess: () => {
          toast.success("Still correct — marked as reviewed");
        },
      }
    );
  }

  function handleSaveEdit() {
    const parsed = parseFloat(editAmount);
    if (isNaN(parsed)) return;
    // Prompt snapshot before changing income source amount
    if (item.type === "income_source" && parsed !== item.amount) {
      setShowSnapshotPrompt(true);
      return;
    }
    doSaveEdit();
  }

  function doSaveEdit() {
    const parsed = parseFloat(editAmount);
    if (isNaN(parsed)) return;

    // Amount updates now go through the period system; confirm the item as reviewed
    confirmItem.mutate(
      {
        type: item.type as Parameters<typeof confirmItem.mutate>[0]["type"],
        id: item.id,
      },
      {
        onSuccess: () => {
          setInlineMode("none");
          toast.success("Item confirmed — update amounts via the period editor");
        },
      }
    );
  }

  // End income is now managed through the period system

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-foreground/5 text-sm text-muted-foreground">
        <button onClick={onBack} type="button" className="hover:text-foreground transition-colors">
          ← {breadcrumbLabel}
        </button>
        <span>/</span>
        <span className="text-foreground font-medium">{item.name}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <div>
          <h2 className="text-lg font-semibold">{item.name}</h2>
          {item.type === "income_source" && (
            <p className="text-xs text-muted-foreground mt-0.5">
              <GlossaryTermMarker entryId="net-income">Net Income</GlossaryTermMarker>
            </p>
          )}
          <p className="text-hero font-numeric font-extrabold text-primary">
            {formatCurrency(item.amount, showPence)}
          </p>
          {item.type === "yearly_bill" && (
            <p className="text-sm text-muted-foreground mt-0.5">
              <GlossaryTermMarker entryId="amortised">Amortised (÷12)</GlossaryTermMarker>{" "}
              {formatCurrency(item.amount / 12, showPence)}/mo
            </p>
          )}
          <p className={cn("text-sm mt-0.5", itemIsStale && "text-attention")}>
            {stalenessLabel(item.lastReviewedAt)}
          </p>
        </div>

        <HistoryChart data={history} snapshotDate={snapshotDate} />

        {!isReadOnly && (
          <>
            {inlineMode === "none" && (
              <>
                <ButtonPair
                  leftLabel="Edit"
                  rightLabel="Still correct ✓"
                  onLeftClick={() => {
                    setEditAmount(String(item.amount));
                    setInlineMode("edit");
                  }}
                  onRightClick={handleConfirm}
                  isLoading={confirmItem.isPending}
                />
                {item.type === "savings_allocation" && savingsNudge && (
                  <NudgeCard message={savingsNudge.message} options={savingsNudge.options} />
                )}
              </>
            )}

            {inlineMode === "edit" && (
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="edit-amount">
                  New amount
                </label>
                <input
                  id="edit-amount"
                  aria-label="New amount"
                  type="number"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:border-ring"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveEdit} disabled={updateItem.isPending}>
                    {updateItem.isPending ? "Saving…" : "Save"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setInlineMode("none")}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Snapshot prompt for income amount change */}
        {showSnapshotPrompt && (
          <div className="rounded-lg border p-3 space-y-2 bg-accent/30">
            <p className="text-sm font-medium">Save a snapshot before updating?</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  setShowSnapshotPrompt(false);
                  setShowSnapshotModal(true);
                }}
              >
                Yes, save snapshot first
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowSnapshotPrompt(false);
                  doSaveEdit();
                }}
              >
                No, update directly
              </Button>
            </div>
          </div>
        )}

        {showSnapshotModal && (
          <CreateSnapshotModal
            onClose={() => {
              setShowSnapshotModal(false);
              doSaveEdit();
            }}
            onCreated={() => {
              setShowSnapshotModal(false);
              doSaveEdit();
            }}
          />
        )}
      </div>
    </div>
  );
}
