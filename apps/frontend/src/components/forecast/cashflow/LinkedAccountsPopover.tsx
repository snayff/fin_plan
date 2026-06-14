import { useState, useEffect, useMemo } from "react";
import { useLinkableAccounts, useBulkUpdateLinkedAccounts } from "@/hooks/useCashflow";
import { formatCurrency } from "@/utils/format";
import { useSettings } from "@/hooks/useSettings";
import { SkeletonLoader } from "@/components/common/SkeletonLoader";
import { format } from "date-fns";

interface LinkedAccountsPopoverProps {
  onClose: () => void;
}

const EMPTY_ACCOUNTS: never[] = [];

export function LinkedAccountsPopover({ onClose }: LinkedAccountsPopoverProps) {
  const { data: settings } = useSettings();
  const showPence = settings?.showPence ?? false;
  const { data, isLoading } = useLinkableAccounts();
  const accounts = data ?? EMPTY_ACCOUNTS;
  const bulkUpdate = useBulkUpdateLinkedAccounts();
  const [draft, setDraft] = useState<Record<string, boolean>>({});

  // Use a stable signature so this effect only fires when accounts actually
  // change — not on every render due to a new array reference from React Query.
  const signature = useMemo(
    () => accounts.map((a) => `${a.id}:${a.isCashflowLinked ? 1 : 0}`).join("|"),
    [accounts]
  );

  useEffect(() => {
    setDraft(Object.fromEntries(accounts.map((a) => [a.id, a.isCashflowLinked])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  // Close on Escape — popover acts as a lightweight dialog.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const allSelected = accounts.length > 0 && accounts.every((a) => draft[a.id]);

  function commit(next: Record<string, boolean>) {
    setDraft(next);
    const updates = accounts
      .filter((a) => next[a.id] !== a.isCashflowLinked)
      .map((a) => ({ accountId: a.id, isCashflowLinked: !!next[a.id] }));
    if (updates.length > 0) bulkUpdate.mutate({ updates });
  }

  function toggle(id: string) {
    commit({ ...draft, [id]: !draft[id] });
  }

  function toggleAll() {
    const next = Object.fromEntries(accounts.map((a) => [a.id, !allSelected]));
    commit(next);
  }

  if (isLoading)
    return (
      <div className="rounded-md border border-border bg-popover p-4 w-96 shadow-lg">
        <SkeletonLoader variant="left-panel" className="p-0" />
      </div>
    );

  return (
    <div
      role="dialog"
      aria-label="Select linked accounts"
      className="rounded-md border border-border bg-popover text-popover-foreground p-3 w-96 shadow-lg"
    >
      {accounts.length === 0 ? (
        <p className="text-xs text-text-tertiary px-2 py-3">
          No Current or Savings accounts found. Set an account type to Current or Savings in Assets
          to link it here.
        </p>
      ) : (
        <>
          <label className="flex items-center gap-3 px-2 py-1.5 cursor-pointer">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            <span className="label-chart">Select all</span>
          </label>
          <div className="border-t border-border my-2" />
          <ul className="space-y-1 max-h-64 overflow-y-auto">
            {accounts.map((a) => (
              <li key={a.id}>
                <label className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-accent/30 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!draft[a.id]}
                    onChange={() => toggle(a.id)}
                    aria-label={a.name}
                    className="shrink-0"
                  />
                  <span className="flex-1 min-w-0 flex items-center gap-2">
                    <span className="text-sm truncate" title={a.name}>
                      {a.name}
                    </span>
                    <span className="label-chart shrink-0">{a.type}</span>
                  </span>
                  <span className="font-numeric text-xs text-text-secondary shrink-0 w-16 text-right">
                    {formatCurrency(a.latestBalance ?? 0, showPence)}
                  </span>
                  <span className="text-[10px] text-text-tertiary shrink-0 w-12 text-right">
                    {a.latestBalanceDate ? format(new Date(a.latestBalanceDate), "d MMM") : ""}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="border-t border-border mt-2 pt-2 flex justify-end">
        <button type="button" onClick={onClose} className="text-xs text-text-secondary">
          Close
        </button>
      </div>
    </div>
  );
}
