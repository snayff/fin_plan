import { useState } from "react";
import type React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useUpdatePurchase, useDeletePurchase } from "@/hooks/usePlanner";
import { PRIORITY_LABELS, STATUS_LABELS, FUNDING_SOURCE_LABELS } from "./PurchaseListPanel";

const FUNDING_SOURCES = Object.keys(FUNDING_SOURCE_LABELS) as string[];

interface PurchaseDetailPanelProps {
  purchase: any;
  isReadOnly: boolean;
  onBack: () => void;
}

interface EditFormState {
  name: string;
  estimatedCost: string;
  priority: string;
  scheduledThisYear: boolean;
  status: string;
  comment: string;
  fundingSources: string[];
}

export function PurchaseDetailPanel({ purchase, isReadOnly, onBack }: PurchaseDetailPanelProps) {
  const [showEdit, setShowEdit] = useState(false);
  const [form, setForm] = useState<EditFormState>({
    name: purchase.name ?? "",
    estimatedCost: String(purchase.estimatedCost ?? ""),
    priority: purchase.priority ?? "medium",
    scheduledThisYear: purchase.scheduledThisYear ?? false,
    status: purchase.status ?? "not_started",
    comment: purchase.comment ?? "",
    fundingSources: purchase.fundingSources ?? [],
  });

  const updateMutation = useUpdatePurchase();
  const deleteMutation = useDeletePurchase();

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    updateMutation.mutate(
      {
        id: purchase.id,
        data: {
          name: form.name,
          estimatedCost: parseFloat(form.estimatedCost) || 0,
          priority: form.priority as any,
          scheduledThisYear: form.scheduledThisYear,
          status: form.status as any,
          comment: form.comment || undefined,
          fundingSources: form.fundingSources as any,
        },
      },
      {
        onSuccess: () => {
          toast.success("Purchase saved");
          setShowEdit(false);
        },
      }
    );
  }

  function handleDelete() {
    deleteMutation.mutate(purchase.id, {
      onSuccess: () => {
        toast.success("Purchase removed");
        onBack();
      },
    });
  }

  function toggleFundingSource(source: string) {
    setForm((prev) => ({
      ...prev,
      fundingSources: prev.fundingSources.includes(source)
        ? prev.fundingSources.filter((s) => s !== source)
        : [...prev.fundingSources, source],
    }));
  }

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-foreground/5 text-sm text-muted-foreground">
        <button onClick={onBack} className="hover:text-foreground transition-colors">
          ← Purchases
        </button>
        <span>/</span>
        <span className="text-foreground font-medium">{purchase.name}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Heading */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{purchase.name}</h2>
          {!isReadOnly && !showEdit && (
            <button
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowEdit(true)}
            >
              Edit
            </button>
          )}
        </div>

        {showEdit ? (
          <form onSubmit={handleSave} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Name</label>
                <input
                  className="w-full border rounded px-2 py-1 text-sm bg-background"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Estimated cost</label>
                <input
                  type="number"
                  className="w-full border rounded px-2 py-1 text-sm bg-background"
                  value={form.estimatedCost}
                  onChange={(e) => setForm((f) => ({ ...f, estimatedCost: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Priority</label>
                <select
                  className="w-full border rounded px-2 py-1 text-sm bg-background"
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                >
                  {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Status</label>
                <select
                  className="w-full border rounded px-2 py-1 text-sm bg-background"
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                >
                  {Object.entries(STATUS_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.scheduledThisYear}
                onChange={(e) => setForm((f) => ({ ...f, scheduledThisYear: e.target.checked }))}
                className="rounded"
              />
              Scheduled this year
            </label>

            <div>
              <label className="text-xs text-muted-foreground block mb-1">Funding sources</label>
              <div className="flex flex-wrap gap-3">
                {FUNDING_SOURCES.map((source) => (
                  <label key={source} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={form.fundingSources.includes(source)}
                      onChange={() => toggleFundingSource(source)}
                      className="rounded"
                    />
                    {FUNDING_SOURCE_LABELS[source]}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1">Comment</label>
              <textarea
                className="w-full border rounded px-2 py-1 text-sm bg-background resize-none"
                rows={2}
                value={form.comment}
                onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
              />
            </div>

            <div className="flex items-center gap-3 pt-1">
              <Button type="submit" size="sm" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving…" : "Save"}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setShowEdit(false)}>
                Cancel
              </Button>
              <button
                type="button"
                className="text-sm text-destructive hover:underline ml-auto"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Deleting…" : "Delete purchase"}
              </button>
            </div>
          </form>
        ) : (
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Estimated cost</dt>
              <dd className="font-medium font-mono">{purchase.estimatedCost?.toFixed(2) ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Priority</dt>
              <dd>{PRIORITY_LABELS[purchase.priority] ?? purchase.priority ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Status</dt>
              <dd>{STATUS_LABELS[purchase.status] ?? purchase.status ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Scheduled this year</dt>
              <dd>{purchase.scheduledThisYear ? "Yes" : "No"}</dd>
            </div>
            {(purchase.fundingSources ?? []).length > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Funding sources</dt>
                <dd>
                  {(purchase.fundingSources as string[])
                    .map((s) => FUNDING_SOURCE_LABELS[s] ?? s)
                    .join(", ")}
                </dd>
              </div>
            )}
            {purchase.comment && (
              <div>
                <dt className="text-muted-foreground mb-1">Comment</dt>
                <dd className="text-foreground">{purchase.comment}</dd>
              </div>
            )}
          </dl>
        )}
      </div>
    </div>
  );
}
