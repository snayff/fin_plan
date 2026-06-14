import { toMonthlyAmount } from "@finplan/shared";
import { formatCurrency } from "@/utils/format";
import { TierRow } from "./TierRow";
import type { TierItemRow } from "@/hooks/useWaterfall";

type Tier = "income" | "committed" | "discretionary";

interface Subcategory {
  id: string;
  name: string;
  sortOrder: number;
}

interface Member {
  id: string;
  firstName: string;
  name: string;
}

type TierItemRowWithExtra = TierItemRow & { isDraft?: boolean };

interface Props {
  tier: Tier;
  subcategory: Subcategory;
  items: TierItemRowWithExtra[];
  members: Member[];
  showPence: boolean;
  onAddDraft: (subcategoryId: string) => void;
  onDeleteItem: (id: string) => Promise<unknown>;
  onSaveName: (id: string, name: string) => Promise<unknown>;
  onSaveAmount: (id: string, amount: number) => Promise<unknown>;
}

function monthlyTotal(items: TierItemRow[]): number {
  return items.reduce((sum, i) => {
    return sum + toMonthlyAmount(i.amount, i.spendType);
  }, 0);
}

export function SubcategoryGroup({
  tier,
  subcategory,
  items,
  members,
  showPence,
  onAddDraft,
  onDeleteItem,
  onSaveName,
  onSaveAmount,
}: Props) {
  const total = monthlyTotal(items);
  const colSpan = 7;

  return (
    <>
      <tr className="bg-foreground/[0.02]">
        <td
          colSpan={colSpan}
          className="px-3 py-2 font-heading text-[10px] uppercase tracking-wider text-text-tertiary"
        >
          <div className="flex items-baseline justify-between">
            <span>{subcategory.name}</span>
            <span className="font-numeric text-xs tabular-nums text-text-secondary">
              {formatCurrency(total, showPence)}/mo
            </span>
          </div>
        </td>
      </tr>
      {items.map((item) => (
        <TierRow
          key={item.id}
          tier={tier}
          item={item}
          members={members}
          showPence={showPence}
          onSaveName={(name) => onSaveName(item.id, name)}
          onSaveAmount={(amount) => onSaveAmount(item.id, amount)}
          onDelete={() => onDeleteItem(item.id)}
        />
      ))}
      <tr>
        <td colSpan={colSpan} className="px-3 py-1.5 text-left">
          <button
            type="button"
            aria-label={`Add item to ${subcategory.name}`}
            onClick={() => onAddDraft(subcategory.id)}
            className="text-xs italic text-text-tertiary transition-colors hover:text-text-secondary"
          >
            + add
          </button>
        </td>
      </tr>
    </>
  );
}
