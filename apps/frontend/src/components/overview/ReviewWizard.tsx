import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/utils/format";
import { isStale } from "@/utils/staleness";
import { useSettings } from "@/hooks/useSettings";
import { useCreateSnapshot } from "@/hooks/useSettings";
import { waterfallService } from "@/services/waterfall.service";
import type { WaterfallItemType } from "@finplan/shared";
import {
  useReviewSession,
  useCreateReviewSession,
  useUpdateReviewSession,
  useDeleteReviewSession,
  useReviewIncome,
  useReviewCommitted,
  useReviewYearly,
  useReviewDiscretionary,
  useReviewSavings,
} from "@/hooks/useReviewSession";
import { useWaterfallSummary } from "@/hooks/useWaterfall";
import { useQueryClient } from "@tanstack/react-query";

const STEPS = ["Income", "Monthly Bills", "Yearly Bills", "Discretionary", "Summary"];

/** Minimal shape shared by all waterfall item types used in the review wizard. */
interface ReviewItem {
  id: string;
  name: string;
  lastReviewedAt?: string | null;
  amount?: number;
  monthlyBudget?: number;
  monthlyAmount?: number;
  balance?: number;
}

interface ReviewWizardProps {
  onClose: () => void;
}

// ─── Item card ────────────────────────────────────────────────────────────────

interface ItemCardProps {
  id: string;
  name: string;
  amount: number;
  amountField: string;
  type: string;
  lastReviewedAt: string;
  thresholdMonths: number;
  isResolved: boolean;
  onConfirm: () => void;
  onUpdate: (newAmount: number) => void;
}

function ItemCard({
  name,
  amount,
  type: _type,
  lastReviewedAt,
  thresholdMonths,
  isResolved,
  onConfirm,
  onUpdate,
}: ItemCardProps) {
  const { data: settings } = useSettings();
  const showPence = settings?.showPence ?? false;
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(amount));
  const stale = isStale(lastReviewedAt, thresholdMonths);

  function handleUpdate() {
    const parsed = parseFloat(editValue);
    if (isNaN(parsed)) return;
    onUpdate(parsed);
    setEditing(false);
  }

  return (
    <motion.div
      animate={{ opacity: isResolved ? 0.6 : 1 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={`rounded-lg border p-3 space-y-2 ${
        stale && !isResolved ? "border-attention/30 bg-attention/10" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{name}</p>
          <p className="text-xs text-muted-foreground">
            {_type === "yearly"
              ? `${formatCurrency(amount, showPence)}/yr · ${formatCurrency(amount / 12, showPence)}/mo`
              : formatCurrency(amount, showPence)}
          </p>
          {stale && <p className="text-xs text-attention">Stale</p>}
        </div>
        {isResolved ? (
          <span className="text-xs text-green-600 font-medium">✓ Done</span>
        ) : (
          <div className="flex gap-2">
            {!editing && (
              <>
                <button
                  type="button"
                  className="text-xs rounded border px-2 py-1 hover:bg-accent transition-colors"
                  onClick={() => setEditing(true)}
                >
                  Update
                </button>
                <button
                  type="button"
                  className="text-xs rounded border px-2 py-1 hover:bg-accent transition-colors"
                  onClick={onConfirm}
                >
                  Still correct ✓
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {editing && !isResolved && (
        <div className="flex items-center gap-2">
          <input
            type="number"
            className="flex-1 rounded border px-2 py-1 text-sm bg-background focus:outline-none focus:border-primary"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            autoFocus
          />
          <Button size="sm" onClick={handleUpdate}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      )}
    </motion.div>
  );
}

// ─── Step data ────────────────────────────────────────────────────────────────

function useStepItems(step: number): ReviewItem[] {
  const { data: income = [] } = useReviewIncome();
  const { data: committed = [] } = useReviewCommitted();
  const { data: yearly = [] } = useReviewYearly();
  const { data: discretionary = [] } = useReviewDiscretionary();
  const { data: savings = [] } = useReviewSavings();

  switch (step) {
    case 0:
      return income as ReviewItem[];
    case 1:
      return committed as ReviewItem[];
    case 2:
      return yearly as ReviewItem[];
    case 3:
      return [...(discretionary as ReviewItem[]), ...(savings as ReviewItem[])];
    default:
      return [];
  }
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export function ReviewWizard({ onClose }: ReviewWizardProps) {
  const { data: session, isLoading: sessionLoading } = useReviewSession();
  const createSession = useCreateReviewSession();
  const updateSession = useUpdateReviewSession();
  const deleteSession = useDeleteReviewSession();
  const createSnapshot = useCreateSnapshot();
  const { data: settings } = useSettings();
  const showPence = settings?.showPence ?? false;
  const { data: summary } = useWaterfallSummary();
  const queryClient = useQueryClient();

  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(1); // 1 = forward, -1 = backward
  const [allStaleIds, setAllStaleIds] = useState<Set<string>>(new Set());
  const [reviewedAt] = useState<Date>(new Date());
  const [confirmedItems, setConfirmedItems] = useState<Record<string, string[]>>({});
  const [updatedItems, setUpdatedItems] = useState<
    Record<string, { name: string; from: number; to: number }>
  >({});
  const [snapshotName, setSnapshotName] = useState(format(new Date(), "MMMM yyyy") + " Review");
  const [finishing, setFinishing] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const slideVariants = {
    enter: (dir: number) => ({ x: dir * 32, opacity: 0 }),
    center: { x: 0, opacity: 1, transition: { duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] } },
    exit: (dir: number) => ({
      x: dir * -32,
      opacity: 0,
      transition: { duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] },
    }),
  };

  // Initialize session on mount
  useEffect(() => {
    if (sessionLoading || initialized) return;
    setInitialized(true);

    if (session) {
      // Resume
      setCurrentStep(session.currentStep);
      setConfirmedItems(session.confirmedItems ?? {});
      setUpdatedItems(
        (session.updatedItems ?? {}) as Record<string, { name: string; from: number; to: number }>
      );
    } else {
      // Create fresh
      createSession.mutate(undefined, {
        onSuccess: () => {},
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, sessionLoading, initialized]);

  const items = useStepItems(currentStep);
  const thresholds = settings?.stalenessThresholds ?? {
    income_source: 12,
    committed_bill: 6,
    yearly_bill: 12,
    discretionary_category: 12,
    savings_allocation: 12,
  };

  const TYPE_MAP: Record<number, WaterfallItemType> = {
    0: "income_source",
    1: "committed_bill",
    2: "yearly_bill",
    3: "discretionary_category",
  };

  const SERVICE_TYPE: Record<number, string> = {
    0: "income",
    1: "committed",
    2: "yearly",
    3: "discretionary",
  };

  function getThreshold(step: number, item: ReviewItem): number {
    if (step === 3) {
      return item.monthlyBudget !== undefined
        ? ((thresholds as Record<string, number | undefined>)["discretionary_category"] ?? 12)
        : ((thresholds as Record<string, number | undefined>)["savings_allocation"] ?? 12);
    }
    const key = TYPE_MAP[step];
    if (!key) return 12;
    return (thresholds as Record<string, number | undefined>)[key] ?? 12;
  }

  function getItemAmount(item: ReviewItem): number {
    return item.amount ?? item.monthlyBudget ?? item.monthlyAmount ?? item.balance ?? 0;
  }

  function getServiceType(step: number, item: ReviewItem): string {
    if (step === 3) {
      return item.monthlyBudget !== undefined ? "discretionary" : "savings";
    }
    return SERVICE_TYPE[step] ?? "income";
  }

  function isResolved(id: string): boolean {
    const allConfirmed = Object.values(confirmedItems).flat();
    return allConfirmed.includes(id) || id in updatedItems;
  }

  const staleItems = items.filter((it) =>
    isStale(it.lastReviewedAt ?? new Date(0).toISOString(), getThreshold(currentStep, it))
  );
  const freshItems = items.filter(
    (it) => !isStale(it.lastReviewedAt ?? new Date(0).toISOString(), getThreshold(currentStep, it))
  );

  async function handleConfirm(item: ReviewItem) {
    const svcType = getServiceType(currentStep, item);
    try {
      if (svcType === "income") await waterfallService.confirmIncome(item.id);
      else if (svcType === "committed") await waterfallService.confirmCommitted(item.id);
      else if (svcType === "yearly") await waterfallService.confirmYearly(item.id);
      else if (svcType === "discretionary") await waterfallService.confirmDiscretionary(item.id);
      else if (svcType === "savings") await waterfallService.confirmSavings(item.id);

      const typeKey = TYPE_MAP[currentStep] ?? svcType;
      const newConfirmed = {
        ...confirmedItems,
        [typeKey]: [...(confirmedItems[typeKey] ?? []), item.id],
      };
      setConfirmedItems(newConfirmed);
      updateSession.mutate({ confirmedItems: newConfirmed });

      const remainingStale = staleItems.filter((it) => !isResolved(it.id) && it.id !== item.id);
      if (remainingStale.length === 0 && staleItems.length > 0) {
        toast.success("All caught up — no more stale items");
      }
    } catch {
      toast.error("Couldn't confirm item — try again");
    }
  }

  async function handleUpdate(item: ReviewItem, newAmount: number) {
    const svcType = getServiceType(currentStep, item);
    const fromAmount = getItemAmount(item);
    try {
      // Amount updates for income go through periods now; confirm only for review
      if (svcType === "income") await waterfallService.confirmIncome(item.id);
      else if (svcType === "committed")
        await waterfallService.updateCommitted(item.id, { amount: newAmount });
      else if (svcType === "yearly")
        await waterfallService.updateYearly(item.id, { amount: newAmount });
      // Amount updates for discretionary go through periods now; confirm only for review
      else if (svcType === "discretionary") await waterfallService.confirmDiscretionary(item.id);
      else if (svcType === "savings")
        await waterfallService.updateSavings(item.id, { monthlyAmount: newAmount });

      const newUpdated = {
        ...updatedItems,
        [item.id]: { name: item.name as string, from: fromAmount, to: newAmount },
      };
      setUpdatedItems(newUpdated);
      updateSession.mutate({ updatedItems: newUpdated });
      void queryClient.invalidateQueries({ queryKey: ["waterfall", "summary"] });
    } catch {
      toast.error("Couldn't save change — try again");
    }
  }

  async function handleConfirmAll() {
    const unresolved = freshItems.filter((it) => !isResolved(it.id));
    if (unresolved.length === 0) return;
    try {
      const ids = unresolved.map((it) => it.id);
      const batchType = TYPE_MAP[currentStep] ?? "income_source";
      await waterfallService.confirmBatch({
        items: ids.map((id) => ({ type: batchType, id })),
      });

      const firstFresh = freshItems[0];
      const svcType = firstFresh ? getServiceType(currentStep, firstFresh) : "income";
      const typeKey = TYPE_MAP[currentStep] ?? svcType;
      const newConfirmed = {
        ...confirmedItems,
        [typeKey]: [...(confirmedItems[typeKey] ?? []), ...ids],
      };
      setConfirmedItems(newConfirmed);
      updateSession.mutate({ confirmedItems: newConfirmed });
    } catch {
      toast.error("Couldn't confirm items — try again");
    }
  }

  function goNext() {
    setDirection(1);
    setAllStaleIds((prev) => new Set([...prev, ...staleItems.map((it) => it.id as string)]));
    const nextStep = currentStep + 1;
    setCurrentStep(nextStep);
    updateSession.mutate({ currentStep: nextStep });
  }

  function goPrev() {
    setDirection(-1);
    const prevStep = Math.max(0, currentStep - 1);
    setCurrentStep(prevStep);
    updateSession.mutate({ currentStep: prevStep });
  }

  async function handleFinish() {
    setFinishing(true);
    try {
      await createSnapshot.mutateAsync(snapshotName);
      deleteSession.mutate();
      void queryClient.invalidateQueries({ queryKey: ["waterfall", "summary"] });
      void queryClient.invalidateQueries({ queryKey: ["snapshots"] });
      toast.success("Review complete — you've saved a snapshot");
      onClose();
    } catch (err: unknown) {
      if (err !== null && typeof err === "object" && "status" in err && err.status === 409) {
        toast.error("Couldn't save snapshot — that name's already taken");
      } else {
        toast.error("Couldn't save snapshot — try again");
      }
    } finally {
      setFinishing(false);
    }
  }

  const unresolvedFresh = freshItems.filter((it) => !isResolved(it.id));

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="border-b px-6 py-4 flex items-center gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            {STEPS.map((label, i) => (
              <span
                key={i}
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  i === currentStep
                    ? "bg-primary text-primary-foreground"
                    : i < currentStep
                      ? "bg-muted text-muted-foreground"
                      : "text-muted-foreground"
                }`}
              >
                {label}
              </span>
            ))}
          </div>
          {/* Progress bar */}
          <div className="h-1 rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${(currentStep / (STEPS.length - 1)) * 100}%` }}
            />
          </div>
        </div>
        <button
          type="button"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
          onClick={onClose}
        >
          ✕ Exit
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentStep}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="max-w-2xl mx-auto p-6 space-y-4"
          >
            {currentStep < 4 ? (
              <>
                <h2 className="text-lg font-semibold">{STEPS[currentStep]}</h2>
                <p className="text-sm text-muted-foreground">
                  {staleItems.length} stale · {freshItems.length} up to date
                </p>

                {/* Stale items first */}
                {staleItems.map((item) => (
                  <ItemCard
                    key={item.id as string}
                    id={item.id as string}
                    name={item.name as string}
                    amount={getItemAmount(item)}
                    amountField="amount"
                    type={getServiceType(currentStep, item)}
                    lastReviewedAt={item.lastReviewedAt ?? new Date(0).toISOString()}
                    thresholdMonths={getThreshold(currentStep, item)}
                    isResolved={isResolved(item.id as string)}
                    onConfirm={() => handleConfirm(item)}
                    onUpdate={(v) => handleUpdate(item, v)}
                  />
                ))}

                {/* Fresh items */}
                {freshItems.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="label-section">Up to date ({freshItems.length})</p>
                      {unresolvedFresh.length > 0 && (
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline"
                          onClick={handleConfirmAll}
                        >
                          Confirm all remaining ({unresolvedFresh.length})
                        </button>
                      )}
                    </div>
                    {freshItems.map((item) => (
                      <ItemCard
                        key={item.id as string}
                        id={item.id as string}
                        name={item.name as string}
                        amount={getItemAmount(item)}
                        amountField="amount"
                        type={getServiceType(currentStep, item)}
                        lastReviewedAt={item.lastReviewedAt ?? new Date(0).toISOString()}
                        thresholdMonths={getThreshold(currentStep, item)}
                        isResolved={isResolved(item.id as string)}
                        onConfirm={() => handleConfirm(item)}
                        onUpdate={(v) => handleUpdate(item, v)}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              /* Summary step */
              <div className="space-y-6">
                <h2 className="text-lg font-semibold">Summary</h2>

                <div className="rounded-lg border p-4 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Items reviewed</span>
                    <span className="font-medium">
                      {Object.keys(updatedItems).length +
                        Object.values(confirmedItems).reduce((s, a) => s + a.length, 0)}
                    </span>
                  </div>
                  {(() => {
                    const resolvedIds = new Set([
                      ...Object.values(confirmedItems).flat(),
                      ...Object.keys(updatedItems),
                    ]);
                    const stillStale = [...allStaleIds].filter((id) => !resolvedIds.has(id)).length;
                    return stillStale > 0 ? (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Still stale</span>
                        <span className="font-medium text-attention">{stillStale}</span>
                      </div>
                    ) : null;
                  })()}
                  {summary && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Current surplus</span>
                      <span className="font-medium">
                        {formatCurrency(summary.surplus.amount, showPence)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Reviewed at</span>
                    <span className="font-medium">{format(reviewedAt, "d MMM yyyy, HH:mm")}</span>
                  </div>
                </div>

                {Object.keys(updatedItems).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Changes made</p>
                    {Object.entries(updatedItems).map(([id, change]) => (
                      <div key={id} className="flex justify-between text-sm text-muted-foreground">
                        <span>{change.name}</span>
                        <span>
                          {formatCurrency(change.from, showPence)} →{" "}
                          {formatCurrency(change.to, showPence)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium">Snapshot name</label>
                  <input
                    className="w-full rounded border px-3 py-1.5 text-sm bg-background focus:outline-none focus:border-primary"
                    value={snapshotName}
                    onChange={(e) => setSnapshotName(e.target.value)}
                  />
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer nav */}
      <div className="border-t px-6 py-4 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={goPrev} disabled={currentStep === 0}>
          ← Back
        </Button>
        {currentStep < STEPS.length - 1 ? (
          <Button size="sm" onClick={goNext}>
            Next →
          </Button>
        ) : (
          <Button size="sm" onClick={handleFinish} disabled={finishing}>
            {finishing ? "Saving…" : "Save & finish"}
          </Button>
        )}
      </div>
    </div>
  );
}
