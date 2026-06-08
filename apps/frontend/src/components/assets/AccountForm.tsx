import { useState } from "react";
import type { AccountType } from "@finplan/shared";
import { useHouseholdMembers, useSettings } from "../../hooks/useSettings.js";
import { useAllAccounts } from "../../hooks/useAssets.js";
import { formatCurrency } from "@/utils/format";

function isoDateOnly(value: string | null | undefined): string {
  if (!value) return "";
  return value.length >= 10 ? value.slice(0, 10) : value;
}

const GROWTH_RATE_SETTING_KEY: Partial<
  Record<AccountType, "currentRatePct" | "savingsRatePct" | "investmentRatePct" | "pensionRatePct">
> = {
  Current: "currentRatePct",
  Savings: "savingsRatePct",
  StocksAndShares: "investmentRatePct",
  Pension: "pensionRatePct",
};

const NAME_PLACEHOLDER: Record<AccountType, string> = {
  Current: "e.g. Barclays Current",
  Savings: "e.g. Marcus Easy Access",
  StocksAndShares: "e.g. Vanguard S&S ISA",
  Pension: "e.g. Vanguard SIPP",
  Other: "e.g. Premium Bonds, Crypto Wallet",
};

interface Props {
  mode: "add" | "edit";
  type: AccountType;
  /** When editing, the id of THIS account so we can exclude it from disposal-target picker. */
  accountId?: string;
  initialName?: string;
  initialMemberId?: string | null;
  initialGrowthRatePct?: number | null;
  initialMonthlyContributionLimit?: number | null;
  initialDisposedAt?: string | null;
  initialDisposalAccountId?: string | null;
  initialIsISA?: boolean;
  initialIsaYearContribution?: number | null;
  isSaving?: boolean;
  isSavingConfirm?: boolean;
  isStale?: boolean;
  onSave: (data: {
    name: string;
    memberId: string | null;
    growthRatePct: number | null;
    monthlyContributionLimit: number | null;
    isISA?: boolean;
    isaYearContribution?: number | null;
    disposedAt: string | null;
    disposalAccountId: string | null;
    initialValue?: number;
  }) => void;
  onCancel: () => void;
  onDeleteRequest?: () => void;
  onConfirm?: () => void;
}

const labelClass = "text-text-muted uppercase tracking-[0.07em] text-[10px]";
const inputClass =
  "rounded-md border border-foreground/10 bg-foreground/[0.04] px-3 py-1.5 text-sm text-text-secondary placeholder:italic placeholder:text-text-muted focus:outline-none focus:border-page-accent/60";

export function AccountForm({
  mode,
  type,
  accountId,
  initialName = "",
  initialMemberId = null,
  initialGrowthRatePct = null,
  initialMonthlyContributionLimit = null,
  initialDisposedAt = null,
  initialDisposalAccountId = null,
  initialIsISA,
  initialIsaYearContribution,
  isSaving,
  isSavingConfirm,
  isStale,
  onSave,
  onCancel,
  onDeleteRequest,
  onConfirm,
}: Props) {
  const [name, setName] = useState(initialName);
  const [memberId, setMemberId] = useState<string | null>(initialMemberId);
  const [growthRatePct, setGrowthRatePct] = useState(
    initialGrowthRatePct != null ? initialGrowthRatePct.toString() : ""
  );
  const [limitRaw, setLimitRaw] = useState(
    initialMonthlyContributionLimit != null ? initialMonthlyContributionLimit.toString() : ""
  );
  const [isISA, setIsISA] = useState(initialIsISA ?? false);
  const [isaContribRaw, setIsaContribRaw] = useState(
    initialIsaYearContribution != null ? initialIsaYearContribution.toString() : ""
  );
  const [isaError, setIsaError] = useState<string | null>(null);
  const [initialValue, setInitialValue] = useState<string>("");
  const [valueFocused, setValueFocused] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [rateError, setRateError] = useState<string | null>(null);
  const [limitError, setLimitError] = useState<string | null>(null);

  // Disposal state
  const [disposalOpen, setDisposalOpen] = useState<boolean>(initialDisposedAt != null);
  const [disposedAt, setDisposedAt] = useState<string>(isoDateOnly(initialDisposedAt));
  const [disposalAccountId, setDisposalAccountId] = useState<string | null>(
    initialDisposalAccountId
  );
  const [disposalError, setDisposalError] = useState<string | null>(null);

  const { data: members } = useHouseholdMembers();
  const { data: settings } = useSettings();
  const { data: allAccounts } = useAllAccounts();
  const showPence = settings?.showPence ?? false;
  const targetAccounts = allAccounts.filter((a) => a.id !== accountId);

  const displayValue =
    !valueFocused && initialValue
      ? (() => {
          const n = parseFloat(initialValue.replace(/[£,\s]/g, ""));
          return isNaN(n) ? initialValue : formatCurrency(n, showPence);
        })()
      : initialValue;

  function parseValue(raw: string): number {
    return parseFloat(raw.replace(/[£,\s]/g, ""));
  }

  const settingKey = GROWTH_RATE_SETTING_KEY[type];
  const defaultRate =
    settingKey && settings ? (settings as Record<string, unknown>)[settingKey] : null;
  const rateLabel =
    defaultRate != null ? `Default: ${String(defaultRate)}%` : "No household default set";

  function handleSave() {
    let valid = true;

    if (!name.trim()) {
      setNameError("Name is required");
      valid = false;
    } else {
      setNameError(null);
    }

    const parsedRate = growthRatePct !== "" ? parseFloat(growthRatePct) : null;
    if (parsedRate !== null && (isNaN(parsedRate) || parsedRate < 0 || parsedRate > 100)) {
      setRateError("Must be between 0 and 100");
      valid = false;
    } else {
      setRateError(null);
    }

    let parsedLimit: number | null = null;
    if (type === "Savings" && limitRaw.trim() !== "") {
      const n = parseFloat(limitRaw);
      if (isNaN(n) || n < 0) {
        setLimitError("Must be a non-negative number");
        valid = false;
      } else {
        parsedLimit = n;
      }
    }

    // Disposal validation: both fields together, or both cleared.
    const dateSet = disposalOpen && disposedAt.trim() !== "";
    const acctSet = disposalOpen && disposalAccountId != null && disposalAccountId !== "";
    if (disposalOpen && dateSet !== acctSet) {
      setDisposalError("Set both a date and a target account, or clear both.");
      valid = false;
    } else {
      setDisposalError(null);
    }

    if (isISA) {
      if (!memberId) {
        setIsaError("ISA accounts must be assigned to a member");
        valid = false;
      } else if (type !== "Savings") {
        setIsaError("Only Savings accounts can be ISAs");
        valid = false;
      } else {
        setIsaError(null);
      }
    } else {
      setIsaError(null);
    }
    let parsedIsaContrib: number | null = null;
    if (isISA && isaContribRaw.trim() !== "") {
      const n = parseFloat(isaContribRaw);
      if (!isNaN(n) && n >= 0) parsedIsaContrib = n;
    }

    if (!valid) return;
    const parsedValue = initialValue.trim() === "" ? undefined : parseValue(initialValue);
    onSave({
      name: name.trim(),
      memberId,
      growthRatePct: parsedRate,
      monthlyContributionLimit: parsedLimit,
      isISA,
      isaYearContribution: parsedIsaContrib,
      disposedAt: dateSet ? disposedAt : null,
      disposalAccountId: acctSet ? disposalAccountId : null,
      ...(mode === "add" && parsedValue !== undefined && !isNaN(parsedValue)
        ? { initialValue: parsedValue }
        : {}),
    });
  }

  return (
    <div className="border-t border-foreground/5 bg-foreground/[0.02] py-3 pr-4 flex flex-col gap-3 border-l-2 border-page-accent pl-[30px]">
      <div className="grid grid-cols-2 gap-3">
        {/* Name */}
        <div className="col-span-2 flex flex-col gap-1">
          <label className={labelClass}>
            Name <span className="text-text-muted">*</span>
          </label>
          <input
            type="text"
            placeholder={NAME_PLACEHOLDER[type]}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(null);
            }}
            aria-label="Name"
            className={[inputClass, nameError ? "border-amber-400/60" : ""].join(" ")}
          />
          {nameError && <p className="-mt-0.5 text-xs text-amber-400">{nameError}</p>}
        </div>

        {/* Current value (add mode only) */}
        {mode === "add" && (
          <div className="col-span-2 flex flex-col gap-1">
            <label className={labelClass}>Current value</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="£0.00"
              value={displayValue}
              onChange={(e) => setInitialValue(e.target.value)}
              onFocus={() => setValueFocused(true)}
              onBlur={() => setValueFocused(false)}
              aria-label="Current value"
              className={[inputClass, "font-numeric"].join(" ")}
            />
            <p className="text-[11px] text-text-muted">Optional — leave blank to record later.</p>
          </div>
        )}

        {/* Assigned to */}
        <div className="col-span-2 flex flex-col gap-1">
          <label className={labelClass}>Assigned to</label>
          <select
            value={memberId ?? ""}
            onChange={(e) => setMemberId(e.target.value || null)}
            aria-label="Assigned to"
            className={inputClass}
          >
            <option value="">Household</option>
            {members?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.firstName}
              </option>
            ))}
          </select>
        </div>

        {/* Growth rate override */}
        {settingKey && (
          <div className="col-span-2 flex flex-col gap-1">
            <label className={labelClass}>Growth rate override (%)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={growthRatePct}
              onChange={(e) => {
                setGrowthRatePct(e.target.value);
                setRateError(null);
              }}
              placeholder={rateLabel}
              aria-label="Growth rate override"
              className={[inputClass, rateError ? "border-amber-400/60" : ""].join(" ")}
            />
            {rateError ? (
              <p className="-mt-0.5 text-xs text-amber-400">{rateError}</p>
            ) : (
              <p className="text-[11px] text-text-muted">
                Leave blank to use household default ({rateLabel})
              </p>
            )}
          </div>
        )}

        {type === "Savings" && (
          <>
            <div className="col-span-2 flex flex-col gap-1">
              <label className={labelClass}>Monthly contribution limit (optional)</label>
              <input
                type="number"
                step="1"
                min="0"
                value={limitRaw}
                onChange={(e) => {
                  setLimitRaw(e.target.value);
                  setLimitError(null);
                }}
                placeholder="£0"
                aria-label="Monthly contribution limit"
                className={[
                  inputClass,
                  "font-numeric",
                  limitError ? "border-amber-400/60" : "",
                ].join(" ")}
              />
              {limitError ? (
                <p className="-mt-0.5 text-xs text-amber-400">{limitError}</p>
              ) : (
                <p className="text-[11px] text-text-muted">
                  The most this account lets you pay in each month. finplan uses this to flag spare
                  capacity and surface higher-rate alternatives.
                </p>
              )}
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="isISA"
                checked={isISA}
                onChange={(e) => {
                  setIsISA(e.target.checked);
                  setIsaError(null);
                }}
              />
              <label htmlFor="isISA" className="text-xs text-text-secondary">
                Is ISA?
              </label>
              {isaError && <span className="ml-2 text-xs text-amber-400">{isaError}</span>}
            </div>
            {isISA && (
              <div className="col-span-2 flex flex-col gap-1">
                <label htmlFor="isaYearContribution" className={labelClass}>
                  ISA contribution this tax year
                </label>
                <input
                  id="isaYearContribution"
                  type="number"
                  step="1"
                  min="0"
                  value={isaContribRaw}
                  onChange={(e) => setIsaContribRaw(e.target.value)}
                  placeholder="£0"
                  aria-label="ISA contribution this tax year"
                  className={[inputClass, "font-numeric"].join(" ")}
                />
                <p className="text-[11px] text-text-muted">
                  How much you've already paid into this ISA in the current UK tax year (6 April → 5
                  April).
                </p>
              </div>
            )}
          </>
        )}

        {/* Planned disposal — collapsible */}
        <div className="col-span-2 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              const next = !disposalOpen;
              setDisposalOpen(next);
              if (!next) {
                setDisposedAt("");
                setDisposalAccountId(null);
                setDisposalError(null);
              }
            }}
            className="self-start text-xs text-text-tertiary hover:text-text-secondary transition-colors"
            aria-expanded={disposalOpen}
          >
            {disposalOpen ? "− Planned disposal" : "+ Planned disposal"}
          </button>

          {disposalOpen && (
            <div className="grid grid-cols-2 gap-3 pl-1">
              <div className="flex flex-col gap-1">
                <label className={labelClass}>Disposal date</label>
                <input
                  type="date"
                  value={disposedAt}
                  onChange={(e) => {
                    setDisposedAt(e.target.value);
                    setDisposalError(null);
                  }}
                  aria-label="Disposal date"
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>Proceeds go to</label>
                <select
                  value={disposalAccountId ?? ""}
                  onChange={(e) => {
                    setDisposalAccountId(e.target.value || null);
                    setDisposalError(null);
                  }}
                  aria-label="Proceeds go to"
                  className={inputClass}
                >
                  <option value="">Select account…</option>
                  {targetAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.type})
                    </option>
                  ))}
                </select>
              </div>
              {disposalError && (
                <p className="col-span-2 -mt-1 text-xs text-amber-400">{disposalError}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-foreground/10 px-3 py-1 text-xs text-text-tertiary hover:bg-foreground/5 transition-colors"
        >
          Cancel
        </button>

        <span className="flex-1" />

        {mode === "edit" && onDeleteRequest && (
          <button
            type="button"
            onClick={onDeleteRequest}
            className="text-xs text-text-muted hover:text-red-400 transition-colors"
          >
            Delete
          </button>
        )}
        {mode === "edit" && onConfirm && isStale && (
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSavingConfirm}
            className="rounded-md border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-medium text-teal-400 hover:bg-teal-500/20 transition-colors disabled:opacity-40"
          >
            Still correct ✓
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || !name.trim()}
          className="rounded-md px-3 py-1 text-xs font-medium transition-colors bg-page-accent/20 text-page-accent hover:bg-page-accent/30 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSaving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
