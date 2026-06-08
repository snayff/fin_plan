import { useState } from "react";
import { toast } from "sonner";
import { formatCurrency } from "@/utils/format";
import { useSettings } from "@/hooks/useSettings";
import { Button } from "@/components/ui/button";
import { GhostedListEmpty } from "@/components/ui/GhostedListEmpty";
import { useCreatePurchase } from "@/hooks/usePlanner";

interface PurchaseListPanelProps {
  year: number;
  purchases: any[];
  isReadOnly: boolean;
  onSelectPurchase: (purchase: any) => void;
}

const PRIORITY_LABELS: Record<string, string> = {
  lowest: "Lowest",
  low: "Low",
  medium: "Medium",
  high: "High",
};

const STATUS_LABELS: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
};

const FUNDING_SOURCE_LABELS: Record<string, string> = {
  savings: "Savings",
  bonus: "Bonus",
  purchasing_budget: "Purchasing budget",
};

export { PRIORITY_LABELS, STATUS_LABELS, FUNDING_SOURCE_LABELS };

function PriorityBadge({ priority }: { priority: string }) {
  if (priority === "high") {
    return <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />;
  }
  if (priority === "medium") {
    return <span className="h-2 w-2 rounded-full bg-muted-foreground/40 shrink-0" />;
  }
  return null;
}

function PurchaseRow({ purchase, onSelect }: { purchase: any; onSelect: (purchase: any) => void }) {
  const { data: settings } = useSettings();
  const showPence = settings?.showPence ?? false;
  return (
    <button
      className="w-full text-left px-3 py-2.5 hover:bg-accent transition-colors border-b last:border-b-0"
      onClick={() => onSelect(purchase)}
    >
      <div className="flex items-center gap-2">
        <span className="flex-1 font-medium text-sm truncate">{purchase.name}</span>
        <PriorityBadge priority={purchase.priority} />
        <span className="text-sm font-medium shrink-0">
          {formatCurrency(purchase.estimatedCost ?? 0, showPence)}
        </span>
      </div>
      <p className="text-xs text-muted-foreground mt-0.5">
        {STATUS_LABELS[purchase.status] ?? purchase.status}
      </p>
    </button>
  );
}

interface AddPurchaseFormProps {
  year: number;
  onCancel: () => void;
}

function AddPurchaseForm({ year, onCancel }: AddPurchaseFormProps) {
  const [name, setName] = useState("");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [scheduledThisYear, setScheduledThisYear] = useState(false);

  const createMutation = useCreatePurchase();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createMutation.mutate(
      {
        name,
        estimatedCost: parseFloat(estimatedCost) || 0,
        scheduledThisYear,
        year,
      } as any,
      {
        onSuccess: () => {
          toast.success("Purchase added");
          onCancel();
        },
      }
    );
  }

  return (
    <form onSubmit={handleSubmit} className="p-3 border rounded-lg space-y-3 mt-3">
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Name</label>
        <input
          className="w-full border rounded px-2 py-1 text-sm bg-background"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Estimated cost</label>
        <input
          type="number"
          className="w-full border rounded px-2 py-1 text-sm bg-background"
          value={estimatedCost}
          onChange={(e) => setEstimatedCost(e.target.value)}
          required
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={scheduledThisYear}
          onChange={(e) => setScheduledThisYear(e.target.checked)}
          className="rounded"
        />
        Scheduled this year
      </label>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={createMutation.isPending}>
          {createMutation.isPending ? "Adding…" : "Add purchase"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

interface PurchaseGroupProps {
  label: string;
  purchases: any[];
  onSelect: (purchase: any) => void;
}

function PurchaseGroup({ label, purchases, onSelect }: PurchaseGroupProps) {
  if (purchases.length === 0) return null;

  return (
    <div>
      <p className="label-section px-3 py-2">{label}</p>
      <div className="rounded-lg border overflow-hidden">
        {purchases.map((p) => (
          <PurchaseRow key={p.id} purchase={p} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

export function PurchaseListPanel({
  year,
  purchases,
  isReadOnly,
  onSelectPurchase,
}: PurchaseListPanelProps) {
  const [showAddForm, setShowAddForm] = useState(false);

  const scheduled = purchases.filter((p) => p.scheduledThisYear === true && p.status !== "done");
  const unscheduled = purchases.filter((p) => p.scheduledThisYear === false);
  const done = purchases.filter((p) => p.status === "done");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Purchases — {year}</h2>
        {!isReadOnly && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowAddForm((v) => !v)}
            disabled={isReadOnly}
          >
            + Add
          </Button>
        )}
      </div>

      {showAddForm && <AddPurchaseForm year={year} onCancel={() => setShowAddForm(false)} />}

      {purchases.length === 0 && !showAddForm && (
        <GhostedListEmpty
          ctaHeading="What are you planning to buy?"
          ctaText="Add your first planned purchase"
          onCtaClick={() => setShowAddForm(true)}
        />
      )}

      <PurchaseGroup label="Scheduled" purchases={scheduled} onSelect={onSelectPurchase} />
      <PurchaseGroup label="Unscheduled" purchases={unscheduled} onSelect={onSelectPurchase} />
      <PurchaseGroup label="Done" purchases={done} onSelect={onSelectPurchase} />
    </div>
  );
}
