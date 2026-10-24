import { AnimatePresence, motion } from "framer-motion";
import ItemRow from "./ItemRow";
import ItemAccordion from "./ItemAccordion";
import ItemForm from "./ItemForm";
import { isStale } from "./formatAmount";
import { useTierUpdateItem, useConfirmWaterfallItem, type TierItemRow } from "@/hooks/useWaterfall";
import type { TierConfig, TierKey } from "./tierConfig";

const accordionVariants = {
  initial: { height: 0, opacity: 0 },
  animate: { height: "auto", opacity: 1, transition: { duration: 0.2, ease: [0.25, 1, 0.5, 1] } },
  exit: { height: 0, opacity: 0, transition: { duration: 0.2, ease: [0.25, 1, 0.5, 1] } },
};

interface SubcategoryOption {
  id: string;
  name: string;
}

interface MemberOption {
  id: string;
  firstName: string;
}

interface Props {
  tier: TierKey;
  config: TierConfig;
  item: TierItemRow;
  subcategoryName: string;
  subcategories: SubcategoryOption[];
  members?: MemberOption[];
  expandedItemId: string | null;
  editingItemId: string | null;
  onToggleExpand: (id: string) => void;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onDeleteRequest: (id: string) => void;
  now: Date;
  stalenessMonths: number;
  /** Set for planner-owned items: the row is read-only and links to the planner. */
  managedBy?: { label: string; path: string };
}

export default function ItemAreaRow({
  tier,
  config,
  item,
  subcategoryName,
  subcategories,
  members = [],
  expandedItemId,
  editingItemId,
  onToggleExpand,
  onStartEdit,
  onCancelEdit,
  onDeleteRequest,
  now,
  stalenessMonths,
  managedBy,
}: Props) {
  const isExpanded = expandedItemId === item.id;
  const isEditing = !managedBy && editingItemId === item.id;
  const updateItem = useTierUpdateItem(tier, item.id);
  const confirmItem = useConfirmWaterfallItem(tier, item.id);
  const stale = isStale(item.lastReviewedAt, now, stalenessMonths);

  return (
    <ItemRow
      item={{ ...item, subcategoryName }}
      config={config}
      isExpanded={isExpanded}
      onToggle={() => {
        if (isEditing) return;
        onToggleExpand(item.id);
      }}
      now={now}
      stalenessMonths={stalenessMonths}
      members={members}
    >
      <AnimatePresence initial={false}>
        {isExpanded && !isEditing && (
          <motion.div
            key="accordion"
            variants={accordionVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            style={{ overflow: "hidden" }}
          >
            <ItemAccordion
              item={{ ...item, subcategoryName }}
              config={config}
              onEdit={() => onStartEdit(item.id)}
              managedBy={managedBy}
              now={now}
              stalenessMonths={stalenessMonths}
            />
          </motion.div>
        )}
        {isEditing && (
          <motion.div
            key="form"
            variants={accordionVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            style={{ overflow: "hidden" }}
          >
            <ItemForm
              mode="edit"
              item={item}
              config={config}
              subcategories={subcategories}
              members={members}
              initialSubcategoryId={item.subcategoryId}
              isSaving={updateItem.isPending}
              isStale={stale}
              onSave={async (data) => {
                try {
                  await updateItem.mutateAsync(data as unknown as Record<string, unknown>);
                  onCancelEdit();
                  onToggleExpand(item.id);
                } catch {
                  // error handled by useUpdateItem onError (toast)
                }
              }}
              onCancel={onCancelEdit}
              onConfirm={async () => {
                try {
                  await confirmItem.mutateAsync();
                  onCancelEdit();
                } catch {
                  // error handled by mutation onError (toast)
                }
              }}
              onDelete={() => onDeleteRequest(item.id)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </ItemRow>
  );
}
