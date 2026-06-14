import { useState, useRef } from "react";
import { formatCurrency } from "@/utils/format";
import type { TierItemRow } from "@/hooks/useWaterfall";

interface Member {
  id: string;
  firstName: string;
  name: string;
}

interface TierItemRowWithDraft extends TierItemRow {
  isDraft?: boolean;
}

interface Props {
  tier: "income" | "committed" | "discretionary";
  item: TierItemRowWithDraft;
  members: Member[];
  showPence: boolean;
  onSaveName: (name: string) => Promise<unknown>;
  onSaveAmount: (amount: number) => Promise<unknown>;
  onDelete: () => Promise<unknown>;
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatDueDate(item: TierItemRowWithDraft): string {
  if (item.spendType === "monthly") return "—";
  if (item.spendType === "one_off" && item.dueDate) {
    const d = new Date(item.dueDate);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
  if (item.spendType === "yearly" && item.dueDate) {
    const d = new Date(item.dueDate);
    return MONTH_NAMES[d.getMonth()] ?? "—";
  }
  return "—";
}

export function TierRow({
  tier,
  item,
  members,
  showPence,
  onSaveName,
  onSaveAmount,
  onDelete,
}: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const handleNameBlur = async () => {
    const newName = nameRef.current?.value.trim() ?? "";
    if (newName && newName !== item.name) {
      await onSaveName(newName);
    }
  };

  const handleAmountBlur = async () => {
    const raw = amountRef.current?.value ?? "";
    const parsed = parseFloat(raw);
    if (!isNaN(parsed) && parsed !== item.amount) {
      await onSaveAmount(parsed);
    }
  };

  const handleDeleteClick = () => {
    setConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
    }
  };

  const memberLabel = (() => {
    if (item.memberId == null) return "Household";
    const member = members.find((m) => m.id === item.memberId);
    return member?.firstName ?? "Household";
  })();

  const isDraftIncomplete = item.isDraft && (!item.name || !item.amount);

  const inputClass =
    "w-full rounded border-0 bg-transparent px-1 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-page-accent/50 focus:bg-foreground/[0.04]";

  return (
    <>
      <tr
        className={[
          "group transition-colors hover:bg-foreground/[0.02]",
          isDraftIncomplete ? "relative" : "",
        ].join(" ")}
      >
        {/* Draft indicator dot */}
        <td className="w-3 pl-1 pr-0">
          {isDraftIncomplete && (
            <span
              className="inline-block h-1.5 w-1.5 rounded-full bg-attention"
              aria-label="Incomplete draft"
            />
          )}
        </td>

        {/* Name */}
        <td className="px-2 py-1.5">
          <input
            ref={nameRef}
            type="text"
            defaultValue={item.name}
            onBlur={() => void handleNameBlur()}
            className={inputClass}
            aria-label="Item name"
          />
        </td>

        {/* Amount */}
        <td className="px-2 py-1.5 text-right">
          <input
            ref={amountRef}
            type="number"
            defaultValue={item.amount}
            min={0}
            step={1}
            onBlur={() => void handleAmountBlur()}
            className={[inputClass, "text-right font-numeric"].join(" ")}
            aria-label="Amount"
          />
        </td>

        {/* Tier-specific columns */}
        {tier === "income" ? (
          <td className="px-2 py-1.5 text-sm text-text-tertiary capitalize">
            {item.spendType === "one_off" ? "One-off" : item.spendType}
          </td>
        ) : (
          /* Due column for committed / discretionary */
          <td data-testid="cell-due" className="px-2 py-1.5 text-sm text-text-tertiary">
            {formatDueDate(item)}
          </td>
        )}

        {/* Assigned to (member) — all tiers */}
        <td className="px-2 py-1.5 text-sm text-text-tertiary">{memberLabel}</td>

        {/* /month equivalent */}
        <td className="px-2 py-1.5 text-right font-numeric tabular-nums text-sm text-text-tertiary">
          {tier === "income"
            ? formatCurrency(item.amount, showPence)
            : formatCurrency(Math.round(item.amount / 12), showPence)}
        </td>

        {/* Delete button */}
        <td className="w-8 px-1 py-1.5 text-right">
          <button
            type="button"
            data-testid="row-delete-btn"
            onClick={handleDeleteClick}
            disabled={deleting}
            className={[
              "rounded p-1 text-text-muted transition-colors",
              "opacity-0 group-hover:opacity-100 focus:opacity-100",
              "hover:bg-destructive/10 hover:text-destructive",
              "disabled:cursor-not-allowed disabled:opacity-40",
            ].join(" ")}
            aria-label="Delete item"
          >
            {/* Trash icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
            </svg>
          </button>
        </td>
      </tr>

      {/* Inline confirm UI — avoids needing a portal */}
      {confirmOpen && (
        <tr>
          <td colSpan={7} className="px-2 py-2">
            <div className="flex items-center gap-3 rounded border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm">
              <span className="flex-1 text-text-secondary">
                Delete <strong className="font-medium">{item.name}</strong>? This cannot be undone.
              </span>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded px-2 py-1 text-xs text-text-tertiary hover:text-text-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDelete()}
                disabled={deleting}
                className="rounded bg-destructive px-2 py-1 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
