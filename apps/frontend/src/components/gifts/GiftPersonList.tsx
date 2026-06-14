import { GhostedListEmpty } from "@/components/ui/GhostedListEmpty";
import type { GiftPersonRow } from "@finplan/shared";
import { formatCurrency } from "@/utils/format";
import { useSettings } from "@/hooks/useSettings";

type Props = {
  people: GiftPersonRow[];
  onSelect: (id: string) => void;
};

export function GiftPersonList({ people, onSelect }: Props) {
  const { data: settings } = useSettings();
  const showPence = settings?.showPence ?? false;
  const plannedTotal = people.reduce((sum, p) => sum + p.plannedTotal, 0);

  if (people.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <div className="px-4 py-3 flex items-center border-b border-foreground/5">
          <h2 className="font-heading text-base font-bold text-foreground">Gifts</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          <GhostedListEmpty
            showCta={false}
            ctaText="Select a person to start planning their gifts."
          />
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col">
      <div className="px-4 py-3 flex items-center justify-between border-b border-foreground/5">
        <div className="flex items-center gap-3">
          <h2 className="font-heading text-base font-bold text-foreground">Gifts</h2>
          <span className="text-xs text-foreground/40">
            {people.length} {people.length === 1 ? "person" : "people"}
          </span>
          <span className="font-numeric text-sm text-page-accent">
            {formatCurrency(plannedTotal, showPence)}
          </span>
        </div>
      </div>
      <ul className="flex-1 divide-y divide-foreground/5 overflow-y-auto">
        {people.map((p) => (
          <li key={p.id}>
            {/* eslint-disable-next-line jsx-a11y/control-has-associated-label -- the accessible name is the row's text content (person name + totals); a static aria-label would override and drop the totals */}
            <button
              type="button"
              data-testid={`person-row-${p.id}`}
              onClick={() => onSelect(p.id)}
              className="flex w-full cursor-pointer items-center gap-4 px-6 py-3 text-left transition-colors hover:bg-foreground/5"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-foreground">{p.name}</span>
                  {p.isHouseholdMember && (
                    <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-foreground/50">
                      Household
                    </span>
                  )}
                  {p.hasOverspend && (
                    <span
                      data-testid={`overspend-dot-${p.id}`}
                      aria-hidden
                      className="h-1.5 w-1.5 rounded-full bg-attention"
                    />
                  )}
                </div>
                <div className="mt-1 flex gap-3 text-[11px]">
                  <span className="text-foreground/40">{p.plannedCount} planned</span>
                  <span className="text-foreground/65">{p.boughtCount} bought</span>
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-sm tabular-nums text-foreground">
                  {formatCurrency(p.plannedTotal, showPence)}
                </div>
                <div className="font-mono text-[11px] tabular-nums text-foreground/40">
                  {formatCurrency(p.spentTotal, showPence)} spent
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
