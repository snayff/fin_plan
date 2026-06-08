import { useState } from "react";
import { useSetGiftBudget } from "@/hooks/useGifts";

type Props = { year: number; readOnly: boolean; currentBudget: number };

export function ConfigBudgetPanel({ year, readOnly, currentBudget }: Props) {
  const [value, setValue] = useState(String(currentBudget));
  const setBudget = useSetGiftBudget();

  const parsed = parseFloat(value);
  const isValid = !Number.isNaN(parsed) && parsed >= 0;
  const hasChanged = isValid && parsed !== currentBudget;

  const save = () => {
    if (!isValid || !hasChanged) return;
    setBudget.mutate({ year, data: { annualBudget: parsed } });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 py-3 flex items-center border-b border-foreground/5">
        <h2 className="font-heading text-base font-bold text-foreground">Budget</h2>
      </div>
      <div className="flex-1 p-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-text-muted uppercase tracking-[0.07em] text-[10px]">
              Annual budget
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-foreground/40">£</span>
              <input
                type="number"
                min={0}
                step="any"
                disabled={readOnly}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                }}
                className="w-48 rounded-md border border-foreground/10 bg-foreground/[0.04] px-3 py-1.5 font-mono text-sm tabular-nums text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-page-accent/60"
              />
            </div>
          </div>
          <div>
            <button
              type="button"
              onClick={save}
              disabled={readOnly || !hasChanged || setBudget.isPending}
              className="rounded-md px-3 py-1.5 text-xs font-medium bg-page-accent/20 text-page-accent hover:bg-page-accent/30 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
