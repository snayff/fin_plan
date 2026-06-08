/* eslint-disable jsx-a11y/label-has-associated-control -- TODO(a11y): labels need htmlFor/id refactor; autoFocus is intentional for UX on form open */
import { useState } from "react";
import { useHouseholdMembers, useSettings } from "../../hooks/useSettings.js";
import { useAllAccounts } from "../../hooks/useAssets.js";
import { formatCurrency } from "@/utils/format";
import type { AssetType } from "@finplan/shared";

interface Props {
  mode: "add" | "edit";
  assetType?: AssetType;
  initialName?: string;
  initialMemberId?: string | null;
  initialGrowthRatePct?: number | null;
  initialDisposedAt?: string | null;
  initialDisposalAccountId?: string | null;
  isSaving?: boolean;
  isSavingConfirm?: boolean;
  isStale?: boolean;
  onSave: (data: {
    name: string;
    memberId: string | null;
    growthRatePct: number | null;
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

function isoDateOnly(value: string | null | undefined): string {
  if (!value) return "";
  // Server returns full ISO; the <input type="date"> needs YYYY-MM-DD
  return value.length >= 10 ? value.slice(0, 10) : value;
}

export function AssetForm({
  mode,
  assetType,
  initialName = "",
  initialMemberId = null,
  initialGrowthRatePct = null,
  initialDisposedAt = null,
  initialDisposalAccountId = null,
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
  const [growthRatePct, setGrowthRatePct] = useState<string>(
    initialGrowthRatePct != null ? String(initialGrowthRatePct) : ""
  );
  const [initialValue, setInitialValue] = useState<string>("");
  const [valueFocused, setValueFocused] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  // Disposal state — start expanded if the asset already has a disposal date.
  const [disposalOpen, setDisposalOpen] = useState<boolean>(initialDisposedAt != null);
  const [disposedAt, setDisposedAt] = useState<string>(isoDateOnly(initialDisposedAt));
  const [disposalAccountId, setDisposalAccountId] = useState<string | null>(
    initialDisposalAccountId
  );
  const [disposalError, setDisposalError] = useState<string | null>(null);

  const { data: members } = useHouseholdMembers();
  const { data: settings } = useSettings();
  const { data: accounts } = useAllAccounts();
  const showPence = settings?.showPence ?? false;

  const growthRatePlaceholder: string = (() => {
    if (!settings || !assetType) return "e.g. 3.5 or -15";
    const rateMap: Record<AssetType, number> = {
      Property: settings.propertyRatePct ?? 3.5,
      Vehicle: settings.vehicleRatePct ?? -15,
      Other: settings.otherAssetRatePct ?? 0,
    };
    return `Default: ${rateMap[assetType]}`;
  })();

  const displayValue =
    !valueFocused && initialValue
      ? (() => {
          const n = parseFloat(initialValue);
          return isNaN(n) ? initialValue : formatCurrency(n, showPence);
        })()
      : initialValue;

  function parseValue(raw: string): number {
    return parseFloat(raw.replace(/[£,\s]/g, ""));
  }

  function handleSave() {
    if (!name.trim()) {
      setNameError("Name is required");
      return;
    }
    setNameError(null);

    // Disposal validation: both fields together, or both cleared.
    const dateSet = disposalOpen && disposedAt.trim() !== "";
    const acctSet = disposalOpen && disposalAccountId != null && disposalAccountId !== "";
    if (disposalOpen && dateSet !== acctSet) {
      setDisposalError("Set both a date and a target account, or clear both.");
      return;
    }
    setDisposalError(null);

    const parsedGrowth = growthRatePct.trim() === "" ? null : Number(growthRatePct);
    const parsedValue = initialValue.trim() === "" ? undefined : parseValue(initialValue);

    onSave({
      name: name.trim(),
      memberId,
      growthRatePct: parsedGrowth,
      disposedAt: dateSet ? disposedAt : null,
      disposalAccountId: acctSet ? disposalAccountId : null,
      ...(mode === "add" && parsedValue !== undefined ? { initialValue: parsedValue } : {}),
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
            placeholder="e.g. Family Home"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(null);
            }}
            aria-label="Name"
            autoFocus={mode === "add"}
            className={[inputClass, "col-span-2", nameError ? "border-amber-400/60" : ""].join(" ")}
          />
          {nameError && <p className="-mt-0.5 text-xs text-amber-400">{nameError}</p>}
        </div>

        {/* Current value (add mode only) + Growth rate — side by side */}
        {mode === "add" && (
          <div className="flex flex-col gap-1">
            <label className={labelClass}>
              Current value <span className="text-text-muted">*</span>
            </label>
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
          </div>
        )}

        {/* Growth rate */}
        <div className={`flex flex-col gap-1 ${mode === "edit" ? "col-span-2" : ""}`}>
          <label className={labelClass}>Growth rate (% p.a.)</label>
          <input
            type="text"
            inputMode="decimal"
            placeholder={growthRatePlaceholder}
            value={growthRatePct}
            onChange={(e) => setGrowthRatePct(e.target.value)}
            aria-label="Growth rate"
            className={inputClass}
          />
        </div>

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
                  {accounts.map((a) => (
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

      {/* Actions: Cancel · [spacer] · Delete · Still correct · Save */}
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
