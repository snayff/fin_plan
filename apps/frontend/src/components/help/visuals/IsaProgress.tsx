import { formatCurrency } from "@/utils/format";
import { useSettings } from "@/hooks/useSettings";

export function IsaProgress() {
  const { data: settings } = useSettings();
  const showPence = settings?.showPence ?? false;
  const limit = 20000;
  const contributed = 8500;
  const pct = (contributed / limit) * 100;

  return (
    <div className="rounded-lg border bg-card/50 p-4">
      <div className="flex justify-between text-xs text-muted-foreground mb-2">
        <span>ISA contributions this tax year</span>
        <span className="font-mono font-semibold text-foreground">
          {formatCurrency(contributed, showPence)} / {formatCurrency(limit, showPence)}
        </span>
      </div>
      <div className="h-3 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-tier-surplus/60 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground/60 mt-2">
        Resets 6 April · {formatCurrency(limit - contributed, showPence)} remaining
      </p>
    </div>
  );
}
