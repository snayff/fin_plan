import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { useSettings } from "@/hooks/useSettings";
import { formatCurrency } from "@/utils/format";
import { useCreatePeriod, useDeletePeriod } from "@/hooks/useWaterfall";
import type { TierConfig, TierKey } from "./tierConfig";
import type { SpendType } from "./formatAmount";
import { LinkedAccountPicker } from "./LinkedAccountPicker";
import { getItemNamePlaceholder } from "./itemNamePlaceholder";

const TIER_TO_PERIOD_ITEM_TYPE: Record<TierKey, string> = {
  income: "income_source",
  committed: "committed_item",
  discretionary: "discretionary_item",
};

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface SubcategoryOption {
  id: string;
  name: string;
}

interface MemberOption {
  id: string;
  firstName: string;
}

interface ItemData {
  name: string;
  amount: number;
  spendType: SpendType;
  subcategoryId: string;
  notes: string | null;
  /** Required for income/committed; null for discretionary unless one_off. */
  dueDate: string | null;
  /** References Member.id. null = "Household" (no specific member). */
  memberId: string | null;
  /** Only set when item is in the Savings discretionary subcategory. */
  linkedAccountId?: string | null;
}

interface ItemPeriod {
  id: string;
  startDate: string | Date;
  endDate?: string | Date | null;
  amount: number;
}

interface EditItem extends Omit<ItemData, "dueDate"> {
  id: string;
  lastReviewedAt: Date;
  dueDate: Date | null;
  periods?: ItemPeriod[];
  linkedAccountId?: string | null;
}

type AddModeProps = {
  mode: "add";
  item?: undefined;
  onConfirm?: undefined;
  onDelete?: undefined;
  isStale?: undefined;
};

type EditModeProps = {
  mode: "edit";
  item: EditItem;
  onConfirm: () => void;
  onDelete: () => void;
  isStale: boolean;
};

type Props = (AddModeProps | EditModeProps) & {
  config: TierConfig;
  subcategories: SubcategoryOption[];
  members?: MemberOption[];
  initialSubcategoryId: string;
  onSave: (data: ItemData) => void;
  onCancel: () => void;
  isSaving?: boolean;
};

export default function ItemForm({
  mode,
  item,
  config,
  subcategories,
  members = [],
  initialSubcategoryId,
  onSave,
  onCancel,
  onConfirm,
  onDelete,
  isSaving,
  isStale,
}: Props) {
  const tier = config.tier;
  const { data: settings } = useSettings();
  const showPence = settings?.showPence ?? false;
  const [name, setName] = useState(item?.name ?? "");
  const [amount, setAmount] = useState(item?.amount?.toString() ?? "");
  const [spendType, setSpendType] = useState<SpendType>(item?.spendType ?? "monthly");
  const [subcategoryId, setSubcategoryId] = useState(item?.subcategoryId ?? initialSubcategoryId);
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [dueDate, setDueDate] = useState<string>(() => {
    if (item?.dueDate) return toDateInputValue(item.dueDate);
    return toDateInputValue(new Date());
  });
  const [linkedAccountId, setLinkedAccountId] = useState<string | null>(
    item?.linkedAccountId ?? null
  );
  const [memberId, setMemberId] = useState<string | null>(item?.memberId ?? null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [amountFocused, setAmountFocused] = useState(false);

  const [isAddingPeriod, setIsAddingPeriod] = useState(false);
  const [newPeriodStart, setNewPeriodStart] = useState(() => toDateInputValue(new Date()));
  const [newPeriodAmount, setNewPeriodAmount] = useState("");

  const periodItemType = TIER_TO_PERIOD_ITEM_TYPE[tier];
  const itemId = item?.id ?? "";
  const qc = useQueryClient();
  const createPeriod = useCreatePeriod(periodItemType, itemId);
  const deletePeriod = useDeletePeriod(periodItemType, itemId);

  function invalidateTierItems() {
    void qc.invalidateQueries({ queryKey: ["waterfall", "tier-items", tier] });
  }

  const currentSubcategoryName = subcategories.find((s) => s.id === subcategoryId)?.name ?? "";

  // Show the account picker only for Savings subcategory in discretionary tier.
  const isSavingsSubcategory = tier === "discretionary" && currentSubcategoryName === "Savings";

  // Auto-clear linked account if user moves item out of Savings subcategory.
  function handleSubcategoryChange(id: string) {
    const newName = subcategories.find((s) => s.id === id)?.name;
    if (newName !== "Savings") setLinkedAccountId(null);
    setSubcategoryId(id);
  }

  // Discretionary items only need a date for one-off purchases.
  const dueDateRequired = tier === "income" || tier === "committed";
  const showDueDate = dueDateRequired || spendType === "one_off";
  const dueDateLabel =
    spendType === "monthly" ||
    spendType === "weekly" ||
    spendType === "quarterly" ||
    spendType === "yearly"
      ? "First payment"
      : "Date";

  const displayAmount =
    !amountFocused && amount
      ? (() => {
          const n = parseFloat(amount);
          return isNaN(n) ? amount : formatCurrency(n, showPence);
        })()
      : amount;

  function parseAmount(raw: string): number {
    return parseFloat(raw.replace(/[£,\s]/g, ""));
  }

  function handleSave() {
    const parsed = parseAmount(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) {
      setAmountError("Amount must be greater than 0");
      return;
    }
    setAmountError(null);
    onSave({
      name: name.trim(),
      amount: parsed,
      spendType,
      subcategoryId,
      notes: notes.trim() || null,
      dueDate: showDueDate ? dueDate : null,
      memberId,
      linkedAccountId: isSavingsSubcategory ? linkedAccountId : null,
    });
  }

  const labelClass = "text-text-muted uppercase tracking-[0.07em] text-[10px]";
  const inputClass =
    "rounded-md border border-foreground/10 bg-foreground/[0.04] px-3 py-1.5 text-sm text-text-secondary placeholder:italic placeholder:text-text-muted focus:outline-none focus:border-page-accent/60";

  return (
    <div
      className={[
        "border-t border-foreground/5 bg-foreground/[0.02] py-3 pr-4 flex flex-col gap-3",
        `border-l-2 ${config.borderClass}`,
        "pl-[30px]",
      ].join(" ")}
    >
      <div className="grid grid-cols-2 gap-3">
        {/* Name */}
        <div className="col-span-2 flex flex-col gap-1">
          <label className={labelClass}>
            Name <span className="text-text-muted">*</span>
          </label>
          <input
            type="text"
            placeholder={getItemNamePlaceholder(currentSubcategoryName, tier)}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Name"
            autoFocus={mode === "add"}
            className={`${inputClass} col-span-2`}
          />
        </div>

        {/* Amount */}
        <div className="flex flex-col gap-1">
          <label className={labelClass}>
            Amount <span className="text-text-muted">*</span>
          </label>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={displayAmount}
            onChange={(e) => {
              setAmount(e.target.value);
              setAmountError(null);
            }}
            onFocus={() => setAmountFocused(true)}
            onBlur={() => setAmountFocused(false)}
            aria-label="Amount"
            className={[
              inputClass,
              "font-numeric",
              amountError ? "border-amber-400/60 focus:border-amber-400" : "",
            ].join(" ")}
          />
          {amountError && <p className="-mt-0.5 text-xs text-amber-400">{amountError}</p>}
        </div>

        {/* Frequency */}
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Frequency</label>
          <Select value={spendType} onValueChange={(v) => setSpendType(v as SpendType)}>
            <SelectTrigger
              aria-label="Spend type"
              className="h-auto rounded-md border-foreground/10 bg-foreground/[0.04] py-1.5 text-sm focus:ring-page-accent/40"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
              <SelectItem value="one_off">One-off</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Due date */}
        {showDueDate && (
          <div className="col-span-2 flex flex-col gap-1">
            <label className={labelClass}>
              {dueDateLabel}
              {dueDateRequired && <span className="text-text-muted"> *</span>}
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              aria-label={dueDateLabel}
              className={inputClass}
            />
          </div>
        )}

        {/* Category */}
        <div className="col-span-2 flex flex-col gap-1">
          <label className={labelClass}>Category</label>
          <Select value={subcategoryId} onValueChange={handleSubcategoryChange}>
            <SelectTrigger
              aria-label="Subcategory"
              className="h-auto rounded-md border-foreground/10 bg-foreground/[0.04] py-1.5 text-sm focus:ring-page-accent/40"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {subcategories.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Linked account — Savings subcategory only */}
        {isSavingsSubcategory && (
          <LinkedAccountPicker value={linkedAccountId} onChange={setLinkedAccountId} />
        )}

        {/* Member */}
        <div className="col-span-2 flex flex-col gap-1">
          <label className={labelClass}>Assigned to</label>
          <Select
            value={memberId ?? "__household__"}
            onValueChange={(v) => setMemberId(v === "__household__" ? null : v)}
          >
            <SelectTrigger
              aria-label="Assigned to"
              className="h-auto rounded-md border-foreground/10 bg-foreground/[0.04] py-1.5 text-sm focus:ring-page-accent/40"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__household__">Household</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.firstName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Notes */}
        <div className="col-span-2 flex flex-col gap-1">
          <label className={labelClass}>Notes</label>
          <textarea
            placeholder="Any details worth remembering"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            aria-label="Notes"
            rows={2}
            maxLength={500}
            className={`${inputClass} w-full resize-none`}
          />
        </div>

        {/* Period editor — edit mode only */}
        {mode === "edit" && item?.periods && item.periods.length > 0 && (
          <div className="col-span-2 flex flex-col gap-1">
            <label className={labelClass}>Value History</label>
            <div className="flex flex-col gap-1">
              {item.periods.map((period) => {
                const now = new Date();
                const startDate = new Date(period.startDate);
                const endDate = period.endDate ? new Date(period.endDate) : null;
                const isCurrent = startDate <= now && (endDate === null || endDate > now);
                const isFuture = startDate > now;
                return (
                  <div
                    key={period.id}
                    className={[
                      "flex items-center gap-3 px-3 py-2 rounded-md border",
                      isCurrent
                        ? "bg-surface-elevated border-surface-elevated-border"
                        : "bg-surface border-surface-border",
                    ].join(" ")}
                  >
                    <span className="font-numeric text-xs text-text-tertiary min-w-[80px]">
                      {startDate.toLocaleDateString("en-GB", { month: "short", year: "numeric" })}
                    </span>
                    <span className="font-numeric text-sm text-text-secondary min-w-[70px]">
                      £{period.amount.toFixed(2)}
                    </span>
                    {isCurrent && (
                      <span
                        className={`text-[9px] font-semibold uppercase tracking-[0.06em] ${config?.textClass ?? "text-text-secondary"} opacity-70`}
                      >
                        Current
                      </span>
                    )}
                    {isFuture && (
                      <span className="text-[9px] font-semibold uppercase tracking-[0.06em] text-text-muted">
                        Scheduled
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={deletePeriod.isPending}
                      onClick={async () => {
                        await deletePeriod.mutateAsync(period.id);
                        invalidateTierItems();
                      }}
                      aria-label={`Remove period from ${startDate.toLocaleDateString("en-GB", { month: "short", year: "numeric" })}`}
                      className="ml-auto text-xs text-text-muted hover:text-red-400 transition-colors disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
            {isAddingPeriod ? (
              <div className="mt-1 flex items-center gap-2 rounded-md border border-surface-border bg-surface px-3 py-2">
                <input
                  type="date"
                  value={newPeriodStart}
                  onChange={(e) => setNewPeriodStart(e.target.value)}
                  aria-label="New period start date"
                  className={`${inputClass} w-[140px] text-xs`}
                />
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={newPeriodAmount}
                  onChange={(e) => setNewPeriodAmount(e.target.value)}
                  aria-label="New period amount"
                  className={`${inputClass} w-[100px] font-numeric text-xs`}
                />
                <button
                  type="button"
                  disabled={
                    createPeriod.isPending ||
                    !newPeriodStart ||
                    isNaN(parseAmount(newPeriodAmount)) ||
                    parseAmount(newPeriodAmount) <= 0
                  }
                  onClick={async () => {
                    await createPeriod.mutateAsync({
                      startDate: new Date(newPeriodStart),
                      amount: parseAmount(newPeriodAmount),
                    });
                    invalidateTierItems();
                    setIsAddingPeriod(false);
                    setNewPeriodAmount("");
                    setNewPeriodStart(toDateInputValue(new Date()));
                  }}
                  className="rounded-md bg-page-accent/20 px-2 py-1 text-xs font-medium text-page-accent hover:bg-page-accent/30 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingPeriod(false);
                    setNewPeriodAmount("");
                    setNewPeriodStart(toDateInputValue(new Date()));
                  }}
                  className="text-xs text-text-muted hover:text-text-secondary transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsAddingPeriod(true)}
                className="mt-1 rounded-md border border-foreground/20 px-3 py-1 text-xs font-medium text-foreground/60 hover:border-page-accent/40 hover:bg-page-accent/8 hover:text-foreground/80 transition-all duration-150"
              >
                + Add period
              </button>
            )}
          </div>
        )}
      </div>

      {/* Actions: Cancel · [spacer] · Delete · Still correct · Save */}
      <div className="flex items-center gap-2" data-testid="form-actions">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-foreground/10 px-3 py-1 text-xs text-text-tertiary hover:bg-foreground/5 transition-colors"
        >
          Cancel
        </button>

        <span className="flex-1" />

        {mode === "edit" && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="text-xs text-text-muted hover:text-red-400 transition-colors"
          >
            Delete
          </button>
        )}
        {mode === "edit" && onConfirm && isStale && (
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-medium text-teal-400 hover:bg-teal-500/20 transition-colors"
          >
            Still correct ✓
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || !name.trim()}
          className={[
            "rounded-md px-3 py-1 text-xs font-medium transition-colors",
            "bg-page-accent/20 text-page-accent hover:bg-page-accent/30",
            "disabled:cursor-not-allowed disabled:opacity-40",
          ].join(" ")}
        >
          Save
        </button>
      </div>
    </div>
  );
}
