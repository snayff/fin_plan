import { AnimatePresence, motion } from "framer-motion";
import { useHouseholdMembers } from "../../hooks/useSettings.js";
import { useSettings } from "@/hooks/useSettings";
import { formatCurrency } from "@/utils/format";
import { isStale, monthsElapsed } from "@/utils/staleness";
import type { AssetItem, AccountItem } from "../../services/assets.service.js";
import type { AccountType } from "@finplan/shared";
import { AssetForm } from "./AssetForm.js";
import { AccountForm } from "./AccountForm.js";
import { RecordBalanceInlineForm } from "./RecordBalanceInlineForm.js";
import { IsaTaxYearBanner } from "./IsaTaxYearBanner.js";

type Item = AssetItem | AccountItem;

interface BaseProps {
  item: Item;
  itemKind: "asset" | "account";
  stalenessThresholdMonths: number;
  hasIsaOverForecast?: boolean;
  isExpanded: boolean;
  isEditing: boolean;
  isRecording: boolean;
  isSavingEdit: boolean;
  isSavingRecord: boolean;
  isSavingConfirm: boolean;
  onToggle: () => void;
  onStartEdit: () => void;
  onStartRecord: () => void;
  onCancelEdit: () => void;
  onCancelRecord: () => void;
  onDeleteRequest: () => void;
  onConfirm: () => void;
  onSaveEdit: (data: {
    name: string;
    memberId: string | null;
    growthRatePct: number | null;
    monthlyContributionLimit?: number | null;
    isISA?: boolean;
    isaYearContribution?: number | null;
    disposedAt: string | null;
    disposalAccountId: string | null;
    initialValue?: number;
  }) => void;
  onSaveRecord: (data: { value: number; date: string; note: string | null }) => void;
  onZeroIsaContribution?: () => void;
}

const rowVariants = {
  initial: { height: 0, opacity: 0 },
  animate: {
    height: "auto",
    opacity: 1,
    transition: { duration: 0.2, ease: [0.25, 1, 0.5, 1] as number[] },
  },
  exit: {
    height: 0,
    opacity: 0,
    transition: { duration: 0.2, ease: [0.25, 1, 0.5, 1] as number[] },
  },
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return "Never recorded";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatReviewDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

export function AssetAccountRow({
  item,
  itemKind,
  stalenessThresholdMonths,
  hasIsaOverForecast = false,
  isExpanded,
  isEditing,
  isRecording,
  isSavingEdit,
  isSavingRecord,
  isSavingConfirm,
  onToggle,
  onStartEdit,
  onStartRecord,
  onCancelEdit,
  onCancelRecord,
  onDeleteRequest,
  onConfirm,
  onSaveEdit,
  onSaveRecord,
  onZeroIsaContribution,
}: BaseProps) {
  const { data: members } = useHouseholdMembers();
  const { data: settings } = useSettings();
  const showPence = settings?.showPence ?? false;

  const memberName = item.memberId
    ? (members?.find((m) => m.id === item.memberId)?.firstName ?? item.memberId)
    : "Household";

  const typeLabel = "type" in item ? item.type : "";

  const stale =
    item.lastReviewedAt != null ? isStale(item.lastReviewedAt, stalenessThresholdMonths) : false;
  const monthsAgo = stale && item.lastReviewedAt ? monthsElapsed(item.lastReviewedAt) : 0;

  const isActive = isExpanded || isEditing;

  return (
    <div className="border-b border-foreground/5">
      {/* Collapsed header — always shown */}
      <button
        onClick={() => {
          if (isEditing) return;
          onToggle();
        }}
        aria-expanded={isActive}
        className={[
          "w-full flex items-center gap-2 py-3 text-left bg-transparent cursor-pointer transition-colors",
          isActive
            ? "bg-page-accent/[0.04] border-l-2 border-page-accent pl-[6px]"
            : "border-l-2 border-transparent pl-[6px]",
        ].join(" ")}
      >
        {/* Stale dot — fixed-width left column */}
        <span className="w-2 shrink-0 flex items-center justify-center">
          {(() => {
            const a = item as AccountItem;
            const hasLimitNudge =
              itemKind === "account" && (a.isOverCap || a.hasSpareCapacityNudge);
            const showDot = stale || hasLimitNudge || hasIsaOverForecast;
            return showDot ? (
              <span
                className="h-1.5 w-1.5 rounded-full bg-attention shrink-0"
                aria-hidden
                data-testid={`account-row-dot-${item.id}`}
              />
            ) : null;
          })()}
        </span>

        {/* Left: name + metadata */}
        <span className="flex-1 flex flex-col gap-px">
          <span className="text-sm text-text-secondary">
            {item.name}
            {item.disposedAt && (
              <span className="ml-2 label-chart">
                {new Date(item.disposedAt) <= new Date() ? "Disposed" : "Sells"}{" "}
                {formatReviewDate(item.disposedAt)}
              </span>
            )}
          </span>
          <span className="text-[11px] text-text-tertiary">
            {typeLabel} · {memberName}
            {itemKind === "account" && (item as AccountItem).monthlyContribution > 0 && (
              <span className="ml-1.5 text-[10px] font-medium text-page-accent/70">
                +{formatCurrency((item as AccountItem).monthlyContribution, showPence)}/mo
              </span>
            )}
          </span>
        </span>

        {/* Right: balance + date */}
        <span className="flex flex-col items-end gap-px">
          <span className="text-sm font-numeric text-text-secondary">
            {formatCurrency(item.currentBalance, showPence)}
          </span>
          <span className="text-[11px] text-text-tertiary">
            {formatDate(item.currentBalanceDate)}
          </span>
        </span>
      </button>

      <AnimatePresence initial={false}>
        {/* Edit form — replaces accordion */}
        {isEditing && (
          <motion.div
            key="edit-form"
            variants={rowVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            style={{ overflow: "hidden" }}
          >
            {itemKind === "account" && onZeroIsaContribution != null && (
              <div className="px-3 pt-3">
                <IsaTaxYearBanner
                  account={item as AccountItem}
                  onZero={onZeroIsaContribution}
                  showPence={showPence}
                />
              </div>
            )}
            {itemKind === "asset" ? (
              <AssetForm
                mode="edit"
                assetType={(item as AssetItem).type}
                initialName={item.name}
                initialMemberId={item.memberId ?? null}
                initialGrowthRatePct={(item as AssetItem).growthRatePct ?? null}
                initialDisposedAt={item.disposedAt ?? null}
                initialDisposalAccountId={item.disposalAccountId ?? null}
                isSaving={isSavingEdit}
                isSavingConfirm={isSavingConfirm}
                isStale={stale}
                onSave={onSaveEdit}
                onCancel={onCancelEdit}
                onDeleteRequest={onDeleteRequest}
                onConfirm={onConfirm}
              />
            ) : (
              <AccountForm
                mode="edit"
                type={(item as AccountItem).type as AccountType}
                accountId={item.id}
                initialName={item.name}
                initialMemberId={item.memberId ?? null}
                initialGrowthRatePct={(item as AccountItem).growthRatePct ?? null}
                initialMonthlyContributionLimit={
                  (item as AccountItem).monthlyContributionLimit ?? null
                }
                initialIsISA={(item as AccountItem).isISA}
                initialIsaYearContribution={(item as AccountItem).isaYearContribution ?? null}
                initialDisposedAt={item.disposedAt ?? null}
                initialDisposalAccountId={item.disposalAccountId ?? null}
                isSaving={isSavingEdit}
                isSavingConfirm={isSavingConfirm}
                isStale={stale}
                onSave={onSaveEdit}
                onCancel={onCancelEdit}
                onDeleteRequest={onDeleteRequest}
                onConfirm={onConfirm}
              />
            )}
          </motion.div>
        )}

        {/* Accordion detail — shown when expanded but not editing */}
        {isExpanded && !isEditing && (
          <motion.div
            key="accordion"
            variants={rowVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            style={{ overflow: "hidden" }}
          >
            <div
              className={[
                "border-t border-foreground/5 bg-foreground/[0.02] py-2.5 pr-4",
                "border-l-2 border-page-accent pl-[30px]",
              ].join(" ")}
            >
              <div className="flex flex-col gap-2.5">
                {/* Balance history */}
                <div>
                  <span className="block label-chart mb-1">Balance History</span>
                  {item.balances.length === 0 ? (
                    <p className="text-xs italic text-text-muted">No balances recorded yet</p>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {item.balances.map((b) => (
                        <div key={b.id} className="flex justify-between text-xs">
                          <span className="text-text-tertiary">{formatDate(b.date)}</span>
                          <span className="font-numeric text-text-secondary">
                            {formatCurrency(b.value, showPence)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Last reviewed — only when stale */}
                {stale && item.lastReviewedAt && (
                  <div>
                    <span className="block label-chart">Last Reviewed</span>
                    <span className="flex items-center gap-1.5 text-xs text-attention">
                      <span
                        className="h-[5px] w-[5px] rounded-full bg-attention shrink-0"
                        aria-hidden
                      />
                      {formatReviewDate(item.lastReviewedAt)} · {monthsAgo} months ago
                    </span>
                  </div>
                )}

                {/* Linked contributions — accounts only */}
                {itemKind === "account" && (item as AccountItem).linkedItems.length > 0 && (
                  <div>
                    <span className="block label-chart mb-1">Monthly Contributions</span>
                    <div className="flex flex-col gap-1">
                      {(item as AccountItem).linkedItems.map((li) => (
                        <div key={li.id} className="flex justify-between text-xs">
                          <span className="text-text-tertiary">
                            {li.name}
                            {li.lumpSumExceedsCap && (
                              <span
                                className="ml-1.5 text-[10px] text-attention"
                                aria-label="Single payment exceeds the monthly cap"
                              >
                                · over cap (raw)
                              </span>
                            )}
                          </span>
                          <span className="font-numeric text-text-secondary">
                            {formatCurrency(li.amount, showPence)}
                            {li.spendType !== "monthly" && (
                              <span className="ml-1 text-[10px] text-text-muted">
                                /{li.spendType}
                              </span>
                            )}
                          </span>
                        </div>
                      ))}
                      {(() => {
                        const a = item as AccountItem;
                        if (a.monthlyContributionLimit == null) {
                          return (
                            <div className="flex justify-between text-xs border-t border-foreground/5 pt-1 mt-0.5">
                              <span className="text-text-muted">Total/mo</span>
                              <span className="font-numeric font-medium text-page-accent/80">
                                {formatCurrency(a.monthlyContribution, showPence)}
                              </span>
                            </div>
                          );
                        }
                        const used = a.monthlyContribution;
                        const limit = a.monthlyContributionLimit;
                        const pct = Math.min(100, Math.max(0, (used / limit) * 100));
                        return (
                          <>
                            <div className="flex justify-between text-xs border-t border-foreground/5 pt-1 mt-0.5">
                              <span className="text-text-muted">Total/mo</span>
                              <span
                                className={[
                                  "font-numeric font-medium",
                                  a.isOverCap ? "text-attention" : "text-page-accent/80",
                                ].join(" ")}
                              >
                                {formatCurrency(used, showPence)} /{" "}
                                {formatCurrency(limit, showPence)}
                              </span>
                            </div>
                            <div className="h-1 mt-1 rounded-sm bg-foreground/[0.05] overflow-hidden">
                              <div
                                className={[
                                  "h-full rounded-sm",
                                  a.isOverCap ? "bg-attention" : "bg-tier-discretionary",
                                ].join(" ")}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            {a.isOverCap && (
                              <p className="text-[11px] text-attention mt-1">
                                Over cap by {formatCurrency(used - limit, showPence)}/mo
                              </p>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* Record balance form or actions */}
                {isRecording ? (
                  <RecordBalanceInlineForm
                    isSaving={isSavingRecord}
                    onSave={onSaveRecord}
                    onCancel={onCancelRecord}
                  />
                ) : (
                  <div className="flex justify-end gap-2 pb-1">
                    <button
                      onClick={onStartRecord}
                      className="rounded-md border border-foreground/10 px-3 py-1 text-xs text-text-tertiary hover:bg-foreground/5 transition-colors"
                    >
                      Record Balance
                    </button>
                    <button
                      onClick={onStartEdit}
                      className="rounded-md border border-foreground/10 px-3 py-1 text-xs text-text-tertiary hover:bg-foreground/5 transition-colors"
                    >
                      Edit
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
