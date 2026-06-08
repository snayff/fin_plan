import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAccountsByType } from "@/hooks/useAssets";

interface Props {
  value: string | null | undefined;
  onChange: (accountId: string | null) => void;
}

const NONE_VALUE = "__none__";

const labelClass = "text-text-muted uppercase tracking-[0.07em] text-[10px]";

export function LinkedAccountPicker({ value, onChange }: Props) {
  const { data: savingsAccounts = [] } = useAccountsByType("Savings");

  return (
    <div className="col-span-2 flex flex-col gap-1">
      <label className={labelClass}>Link to account</label>
      <Select
        value={value ?? NONE_VALUE}
        onValueChange={(v) => onChange(v === NONE_VALUE ? null : v)}
      >
        <SelectTrigger
          aria-label="Link to account"
          className="h-auto rounded-md border-foreground/10 bg-foreground/[0.04] py-1.5 text-sm focus:ring-page-accent/40"
        >
          <SelectValue placeholder="None — no account linked" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_VALUE}>
            <span className="text-text-muted italic">None</span>
          </SelectItem>

          {savingsAccounts.length === 0 && (
            <div className="px-3 py-2 text-xs text-text-muted italic">
              No savings accounts found
            </div>
          )}

          {savingsAccounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
