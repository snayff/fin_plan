import { useState } from "react";

interface Props {
  isSaving?: boolean;
  onSave: (data: { value: number; date: string; note: string | null }) => void;
  onCancel: () => void;
}

function todayISO() {
  return new Date().toISOString().split("T")[0]!;
}

const labelClass = "text-text-muted uppercase tracking-[0.07em] text-[10px]";
const inputClass =
  "rounded-md border border-foreground/10 bg-foreground/[0.04] px-3 py-1.5 text-sm text-text-secondary placeholder:italic placeholder:text-text-muted focus:outline-none focus:border-page-accent/60";

export function RecordBalanceInlineForm({ isSaving, onSave, onCancel }: Props) {
  const [value, setValue] = useState("");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [valueError, setValueError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);

  function handleSave() {
    let valid = true;
    const numValue = parseFloat(value);

    if (!value || isNaN(numValue) || numValue <= 0) {
      setValueError("Value must be greater than 0");
      valid = false;
    } else {
      setValueError(null);
    }

    if (date > todayISO()) {
      setDateError("Date cannot be in the future");
      valid = false;
    } else {
      setDateError(null);
    }

    if (!valid) return;
    onSave({ value: numValue, date, note: note.trim() || null });
  }

  return (
    <div className="flex flex-col gap-3 pt-1">
      <div className="grid grid-cols-2 gap-3">
        {/* Value */}
        <div className="flex flex-col gap-1">
          <label className={labelClass}>
            Value (£) <span className="text-text-muted">*</span>
          </label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            placeholder="0.00"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setValueError(null);
            }}
            aria-label="Balance value"
            className={[inputClass, "font-numeric", valueError ? "border-amber-400/60" : ""].join(
              " "
            )}
          />
          {valueError && <p className="-mt-0.5 text-xs text-amber-400">{valueError}</p>}
        </div>

        {/* Date */}
        <div className="flex flex-col gap-1">
          <label className={labelClass}>
            Date <span className="text-text-muted">*</span>
          </label>
          <input
            type="date"
            max={todayISO()}
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setDateError(null);
            }}
            aria-label="Balance date"
            className={[inputClass, dateError ? "border-amber-400/60" : ""].join(" ")}
          />
          {dateError && <p className="-mt-0.5 text-xs text-amber-400">{dateError}</p>}
        </div>

        {/* Note */}
        <div className="col-span-2 flex flex-col gap-1">
          <label className={labelClass}>Note (optional)</label>
          <input
            type="text"
            placeholder="e.g. end of year valuation"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label="Note"
            className={inputClass}
          />
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
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="rounded-md px-3 py-1 text-xs font-medium transition-colors bg-page-accent/20 text-page-accent hover:bg-page-accent/30 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSaving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
