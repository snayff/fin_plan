import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { AccountType } from "@finplan/shared";
import {
  useAccountsByType,
  useCreateAccount,
  useUpdateAccount,
  useDeleteAccount,
  useRecordAccountBalance,
  useConfirmAccount,
} from "../../hooks/useAssets.js";
import { AssetAccountRow } from "./AssetAccountRow.js";
import { AccountForm } from "./AccountForm.js";
import { SavingsContributionNudge } from "./SavingsContributionNudge.js";
import { IsaAllowanceIndicator } from "./IsaAllowanceIndicator.js";
import GhostAddButton from "@/components/tier/GhostAddButton";
import { GhostedListEmpty } from "@/components/ui/GhostedListEmpty";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { formatCurrency } from "@/utils/format";
import { useSettings, getStalenessMonths } from "@/hooks/useSettings";
import { useIsaAllowance } from "@/hooks/useIsaAllowance";

function formatDisposedDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const TYPE_LABELS: Record<AccountType, string> = {
  Current: "Current",
  Savings: "Savings",
  Pension: "Pension",
  StocksAndShares: "Stocks & Shares",
  Other: "Other",
};

interface Props {
  type: AccountType;
  initialIsAdding?: boolean;
}

export function AccountItemArea({ type, initialIsAdding }: Props) {
  const { data: items, isLoading, isError, refetch } = useAccountsByType(type);
  const { data: allItems } = useAccountsByType(type, { includeDisposed: true });
  const { data: settings } = useSettings();
  const showPence = settings?.showPence ?? false;
  const accountStaleness = getStalenessMonths(settings, "account_item");
  const { data: isaSummary } = useIsaAllowance();
  const isaOverForecastMemberIds = new Set(
    (isaSummary?.byMember ?? [])
      .filter(
        (m) =>
          m.used < (isaSummary?.annualLimit ?? 0) &&
          m.forecastedYearTotal > (isaSummary?.annualLimit ?? 0)
      )
      .map((m) => m.memberId)
  );

  const [isAddingItem, setIsAddingItem] = useState(initialIsAdding ?? false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [disposedOpen, setDisposedOpen] = useState(false);

  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();
  const deleteAccount = useDeleteAccount();
  const recordBalance = useRecordAccountBalance();
  const confirmAccount = useConfirmAccount();

  const now = new Date();
  const disposedItems = (allItems ?? []).filter(
    (i) => i.disposedAt != null && new Date(i.disposedAt) <= now
  );
  const typeTotal = (items ?? []).reduce((sum, i) => sum + i.currentBalance, 0);
  const label = TYPE_LABELS[type];
  const deletingItem =
    items?.find((i) => i.id === deletingId) ?? disposedItems.find((i) => i.id === deletingId);

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-3">
          {[1, 2].map((n) => (
            <div key={n} className="h-14 bg-foreground/[0.04] rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 text-text-muted text-sm">
        Failed to load {label} accounts.{" "}
        <button
          onClick={() => void refetch()}
          className="text-page-accent underline cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-foreground/5">
        <div className="flex items-center gap-3">
          <h2 className="font-heading text-base font-bold text-foreground">{label}</h2>
          <span className="text-xs text-foreground/40">
            {items?.length ?? 0} {(items?.length ?? 0) === 1 ? "item" : "items"}
          </span>
          <span className="font-numeric text-sm text-page-accent">
            {formatCurrency(typeTotal, showPence)}
          </span>
        </div>
        <GhostAddButton
          onClick={() => {
            setIsAddingItem(true);
            setExpandedId(null);
            setEditingId(null);
          }}
          disabled={isAddingItem}
        />
      </div>

      {/* Content */}
      <div className="px-6 flex-1 min-h-0 overflow-y-auto">
        {/* Add form at top */}
        <AnimatePresence initial={false}>
          {isAddingItem && (
            <motion.div
              key="add-form"
              initial={{ height: 0, opacity: 0 }}
              animate={{
                height: "auto",
                opacity: 1,
                transition: { duration: 0.2, ease: [0.25, 1, 0.5, 1] },
              }}
              exit={{
                height: 0,
                opacity: 0,
                transition: { duration: 0.2, ease: [0.25, 1, 0.5, 1] },
              }}
              style={{ overflow: "hidden" }}
            >
              <AccountForm
                mode="add"
                type={type}
                isSaving={createAccount.isPending}
                onSave={async ({
                  name,
                  memberId,
                  growthRatePct,
                  monthlyContributionLimit,
                  isISA,
                  isaYearContribution,
                  disposedAt,
                  disposalAccountId,
                  initialValue,
                }) => {
                  try {
                    await createAccount.mutateAsync({
                      name,
                      type,
                      memberId: memberId ?? undefined,
                      growthRatePct: growthRatePct ?? undefined,
                      monthlyContributionLimit: monthlyContributionLimit ?? undefined,
                      isISA: isISA || undefined,
                      isaYearContribution: isaYearContribution ?? undefined,
                      initialValue,
                      disposedAt: disposedAt ?? undefined,
                      disposalAccountId: disposalAccountId ?? undefined,
                    });
                    setIsAddingItem(false);
                  } catch {
                    // error handled by mutation onError (toast)
                  }
                }}
                onCancel={() => setIsAddingItem(false)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty state */}
        {items?.length === 0 && !isAddingItem && (
          <GhostedListEmpty
            ctaHeading={`Add your first ${label} account`}
            ctaText="Track the current value of your accounts."
            ctaButtonLabel="+ Add"
            onCtaClick={() => setIsAddingItem(true)}
          />
        )}

        {/* Item list */}
        {items?.map((item) => (
          <div key={item.id} data-search-focus={item.id}>
            <AssetAccountRow
              item={item}
              itemKind="account"
              stalenessThresholdMonths={accountStaleness}
              hasIsaOverForecast={
                item.isISA === true && isaOverForecastMemberIds.has(item.memberId ?? "")
              }
              isExpanded={expandedId === item.id}
              isEditing={editingId === item.id}
              isRecording={recordingId === item.id}
              isSavingEdit={updateAccount.isPending}
              isSavingRecord={recordBalance.isPending}
              isSavingConfirm={confirmAccount.isPending}
              onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
              onStartEdit={() => {
                setEditingId(item.id);
                setExpandedId(item.id);
                setRecordingId(null);
              }}
              onStartRecord={() => {
                setRecordingId(item.id);
                setExpandedId(item.id);
              }}
              onCancelEdit={() => setEditingId(null)}
              onCancelRecord={() => setRecordingId(null)}
              onDeleteRequest={() => setDeletingId(item.id)}
              onConfirm={async () => {
                try {
                  await confirmAccount.mutateAsync(item.id);
                  setEditingId(null);
                } catch {
                  // error handled by mutation onError (toast)
                }
              }}
              onSaveEdit={async ({
                name,
                memberId,
                growthRatePct,
                monthlyContributionLimit,
                isISA,
                isaYearContribution,
                disposedAt,
                disposalAccountId,
              }) => {
                try {
                  await updateAccount.mutateAsync({
                    accountId: item.id,
                    data: {
                      name,
                      memberId,
                      growthRatePct: growthRatePct ?? null,
                      ...(monthlyContributionLimit !== undefined
                        ? { monthlyContributionLimit }
                        : {}),
                      isISA: isISA || undefined,
                      isaYearContribution: isaYearContribution ?? undefined,
                      disposedAt: disposedAt ?? undefined,
                      disposalAccountId: disposalAccountId ?? undefined,
                    },
                  });
                  setEditingId(null);
                } catch {
                  // error handled by mutation onError (toast)
                }
              }}
              onZeroIsaContribution={() => {
                updateAccount.mutate({
                  accountId: item.id,
                  data: { isaYearContribution: 0 },
                });
              }}
              onSaveRecord={async ({ value, date, note }) => {
                try {
                  await recordBalance.mutateAsync({
                    accountId: item.id,
                    data: { value, date, note },
                  });
                  setRecordingId(null);
                } catch {
                  // error handled by mutation onError (toast)
                }
              }}
            />
            {type === "Savings" && expandedId === item.id && editingId !== item.id && (
              <div className="px-4 pt-2">
                <SavingsContributionNudge account={item} showPence={showPence} />
              </div>
            )}
          </div>
        ))}

        {/* ISA allowance indicator — Savings only */}
        {type === "Savings" && <IsaAllowanceIndicator />}

        {/* Disposed section */}
        {disposedItems.length > 0 && (
          <div className="mt-2 border-t border-foreground/5 pt-2">
            <button
              type="button"
              onClick={() => setDisposedOpen((o) => !o)}
              className="flex items-center gap-1.5 px-0 py-1 text-[11px] text-text-muted hover:text-text-tertiary transition-colors"
              aria-expanded={disposedOpen}
            >
              <span>{disposedOpen ? "▾" : "▸"}</span>
              <span>Disposed ({disposedItems.length})</span>
            </button>
            <AnimatePresence initial={false}>
              {disposedOpen && (
                <motion.div
                  key="disposed-list"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{
                    height: "auto",
                    opacity: 1,
                    transition: { duration: 0.2, ease: [0.25, 1, 0.5, 1] as number[] },
                  }}
                  exit={{
                    height: 0,
                    opacity: 0,
                    transition: { duration: 0.2, ease: [0.25, 1, 0.5, 1] as number[] },
                  }}
                  style={{ overflow: "hidden" }}
                >
                  {disposedItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between py-2 border-b border-foreground/5 opacity-60"
                    >
                      <span className="flex flex-col gap-px">
                        <span className="text-xs text-text-secondary">{item.name}</span>
                        <span className="text-[11px] text-text-muted">
                          Disposed {formatDisposedDate(item.disposedAt)}
                        </span>
                      </span>
                      <button
                        onClick={() => setDeletingId(item.id)}
                        className="text-[11px] text-text-muted hover:text-red-400 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!deletingId}
        onClose={() => setDeletingId(null)}
        onConfirm={async () => {
          try {
            await deleteAccount.mutateAsync(deletingId!);
            setDeletingId(null);
            setEditingId(null);
            setExpandedId(null);
          } catch {
            // error handled by mutation onError (toast)
          }
        }}
        title={deletingItem ? `Remove ${deletingItem.name}?` : "Remove account?"}
        message={
          deletingItem
            ? `${deletingItem.name} will be permanently removed.`
            : "This account will be permanently removed."
        }
        confirmText="Remove"
        variant="danger"
        isLoading={deleteAccount.isPending}
      />
    </div>
  );
}
