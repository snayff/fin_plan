import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Lock } from "lucide-react";
import GhostAddButton from "./GhostAddButton";
import ItemAreaRow from "./ItemAreaRow";
import ItemForm from "./ItemForm";
import ItemStatusFilter from "./ItemStatusFilter";
import { GhostedListEmpty } from "@/components/ui/GhostedListEmpty";
import { getEmptyStateCopy } from "./emptyStateCopy";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useCreateItem, useDeleteItem, type TierItemRow } from "@/hooks/useWaterfall";
import { toGBP } from "@finplan/shared";
import type { ItemLifecycleState } from "@finplan/shared";
import { AnimatedCurrency } from "@/components/common/AnimatedCurrency";
import type { TierConfig, TierKey } from "./tierConfig";

interface SubcategoryOption {
  id: string;
  name: string;
}

interface SubcategoryInfo {
  id: string;
  name: string;
  tier: TierKey;
  sortOrder: number;
  isLocked: boolean;
}

export interface LockedManager {
  label: string;
  path: string;
}

interface MemberOption {
  id: string;
  firstName: string;
}

interface Props {
  tier: TierKey;
  config: TierConfig;
  subcategory: SubcategoryInfo | null;
  subcategories: SubcategoryOption[];
  members?: MemberOption[];
  items: TierItemRow[];
  isLoading: boolean;
  now?: Date;
  stalenessMonths?: number;
  initialIsAdding?: boolean;
  onSubcategorySelect?: (id: string) => void;
  lockedManager?: LockedManager;
}

export default function ItemArea({
  tier,
  config,
  subcategory,
  subcategories,
  members = [],
  items,
  isLoading,
  now = new Date(),
  stalenessMonths = 12,
  initialIsAdding,
  onSubcategorySelect,
  lockedManager,
}: Props) {
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [isAddingItem, setIsAddingItem] = useState(initialIsAdding ?? false);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<"name" | "createdAt" | "monthlyValue">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [recentlyAddedItemId, setRecentlyAddedItemId] = useState<string | null>(null);
  const [selectedStates, setSelectedStates] = useState<Set<ItemLifecycleState>>(
    new Set(["active"])
  );
  const navigate = useNavigate();

  const stateCounts = useMemo(() => {
    const counts: Record<ItemLifecycleState, number> = { active: 0, future: 0, expired: 0 };
    for (const item of items) {
      const state = (item as TierItemRow & { lifecycleState?: ItemLifecycleState }).lifecycleState;
      counts[state ?? "active"]++;
    }
    return counts;
  }, [items]);

  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        const state = (item as TierItemRow & { lifecycleState?: ItemLifecycleState })
          .lifecycleState;
        return selectedStates.has(state ?? "active");
      }),
    [items, selectedStates]
  );

  const createItem = useCreateItem(tier);
  const deleteItem = useDeleteItem(tier, deletingItemId ?? "");

  const displayItems = useMemo(() => {
    const sorted = [...filteredItems].sort((a, b) => {
      let cmp: number;
      if (sortField === "name") {
        cmp = a.name.localeCompare(b.name);
      } else if (sortField === "createdAt") {
        cmp = a.createdAt.getTime() - b.createdAt.getTime();
      } else {
        const aMonthly = a.spendType === "monthly" ? a.amount : Math.round(a.amount / 12);
        const bMonthly = b.spendType === "monthly" ? b.amount : Math.round(b.amount / 12);
        cmp = aMonthly - bMonthly;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    if (!recentlyAddedItemId) return sorted;
    const pinned = sorted.find((i) => i.id === recentlyAddedItemId);
    if (!pinned) return sorted;
    return [pinned, ...sorted.filter((i) => i.id !== recentlyAddedItemId)];
  }, [filteredItems, sortField, sortDir, recentlyAddedItemId]);

  // Monthly-equivalent total
  const total = items.reduce((sum, item) => {
    const monthly = item.spendType === "monthly" ? item.amount : Math.round(item.amount / 12);
    return sum + monthly;
  }, 0);

  const deletingItem = items.find((it) => it.id === deletingItemId);

  if (!subcategory) return null;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <div className="h-8 animate-pulse rounded bg-foreground/5 w-1/2" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-foreground/5" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-foreground/5">
        <div className="flex items-center gap-3">
          <h2 className="font-heading text-base font-bold text-foreground">{subcategory.name}</h2>
          {lockedManager && (
            <Lock className="h-3.5 w-3.5 text-foreground/40" aria-label="Synced subcategory" />
          )}
          <span className="text-xs text-foreground/40">
            {items.length} {items.length === 1 ? "item" : "items"}
          </span>
          <span className={`font-numeric text-sm ${config.textClass}`}>
            <AnimatedCurrency value={toGBP(total)} />
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Link
            to={`/waterfall#${tier}`}
            className="rounded-md border border-foreground/20 px-3 py-1 text-xs font-medium text-foreground/60 hover:border-page-accent/40 hover:bg-page-accent/8 hover:text-foreground/80 transition-all duration-150"
          >
            View all
          </Link>
          {!lockedManager && (
            <GhostAddButton
              onClick={() => {
                setIsAddingItem(true);
                setExpandedItemId(null);
                setEditingItemId(null);
              }}
              disabled={isAddingItem}
            />
          )}
          {lockedManager && (
            <Link
              to={lockedManager.path}
              className="rounded-md border border-foreground/20 px-3 py-1 text-xs font-medium text-foreground/60 hover:border-page-accent/40 hover:bg-page-accent/8 hover:text-foreground/80 transition-all duration-150"
            >
              Open {lockedManager.label}
            </Link>
          )}
        </div>
      </div>

      {/* Lifecycle filter + sort */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-foreground/5">
        <ItemStatusFilter
          counts={stateCounts}
          selected={selectedStates}
          onChange={setSelectedStates}
        />
        {items.length > 1 && (
          <div className="flex items-center gap-1.5">
            <select
              value={sortField}
              onChange={(e) => {
                setSortField(e.target.value as "name" | "createdAt" | "monthlyValue");
                setRecentlyAddedItemId(null);
              }}
              className="bg-transparent border border-foreground/10 rounded px-1.5 py-0.5 text-xs text-foreground/60 cursor-pointer focus:outline-none focus:border-foreground/20"
            >
              <option value="name">Name</option>
              <option value="createdAt">Date added</option>
              <option value="monthlyValue">Value / month</option>
            </select>
            <button
              onClick={() => {
                setSortDir(sortDir === "asc" ? "desc" : "asc");
                setRecentlyAddedItemId(null);
              }}
              className="text-foreground/40 hover:text-foreground/70 transition-colors text-xs w-5 h-5 flex items-center justify-center"
              title={sortDir === "asc" ? "Ascending" : "Descending"}
            >
              {sortDir === "asc" ? "↑" : "↓"}
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Add form at top */}
        <AnimatePresence initial={false}>
          {isAddingItem && (
            <motion.div
              key="add-form"
              initial={{ height: 0, opacity: 0 }}
              animate={{
                height: "auto",
                opacity: 1,
                transition: { duration: 0.2, ease: [0.25, 1, 0.5, 1] },
              }}
              exit={{
                height: 0,
                opacity: 0,
                transition: { duration: 0.2, ease: [0.25, 1, 0.5, 1] },
              }}
              style={{ overflow: "hidden" }}
            >
              <ItemForm
                mode="add"
                config={config}
                subcategories={subcategories}
                members={members}
                initialSubcategoryId={subcategory.id}
                isSaving={createItem.isPending}
                onSave={async (data) => {
                  try {
                    const created = await createItem.mutateAsync(
                      data as unknown as Record<string, unknown>
                    );
                    setRecentlyAddedItemId((created as { id: string }).id);
                    setIsAddingItem(false);
                    if (data.subcategoryId !== subcategory.id) {
                      onSubcategorySelect?.(data.subcategoryId);
                    }
                  } catch {
                    // error handled by useCreateItem onError (toast)
                  }
                }}
                onCancel={() => setIsAddingItem(false)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty state */}
        {items.length === 0 && !isAddingItem && !lockedManager && (
          <GhostedListEmpty
            ctaHeading={getEmptyStateCopy(subcategory.name, tier).header}
            ctaText={getEmptyStateCopy(subcategory.name, tier).body}
            onCtaClick={() => setIsAddingItem(true)}
          />
        )}

        {/* Synced empty state — subcategory managed elsewhere (e.g. Gift Planner) */}
        {items.length === 0 && lockedManager && (
          <GhostedListEmpty
            ctaHeading={`${subcategory.name} are managed in the ${lockedManager.label}`}
            ctaText={`Your annual ${subcategory.name.toLowerCase()} budget syncs here automatically from the ${lockedManager.label}.`}
            ctaButtonLabel={`Open ${lockedManager.label}`}
            onCtaClick={() => navigate(lockedManager.path)}
          />
        )}

        {/* Filtered empty state — items exist but none match the current filter */}
        {items.length > 0 && filteredItems.length === 0 && !isAddingItem && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-text-tertiary">
              No {[...selectedStates].join(" or ")} items in this category.
            </p>
            <button
              type="button"
              onClick={() => setSelectedStates(new Set(["active", "future", "expired"]))}
              className="mt-2 text-xs text-text-muted hover:text-text-secondary transition-colors"
            >
              Show all items
            </button>
          </div>
        )}

        {/* Item list */}
        {displayItems.map((item) => (
          <div key={item.id} data-search-focus={item.id}>
            <ItemAreaRow
              tier={tier}
              config={config}
              item={item}
              subcategoryName={subcategory.name}
              subcategories={subcategories}
              members={members}
              expandedItemId={expandedItemId}
              editingItemId={editingItemId}
              onToggleExpand={(id) => setExpandedItemId(expandedItemId === id ? null : id)}
              onStartEdit={setEditingItemId}
              onCancelEdit={() => setEditingItemId(null)}
              onDeleteRequest={setDeletingItemId}
              now={now}
              stalenessMonths={stalenessMonths}
            />
          </div>
        ))}
      </div>

      <ConfirmDialog
        isOpen={!!deletingItemId}
        onClose={() => setDeletingItemId(null)}
        onConfirm={async () => {
          await deleteItem.mutateAsync();
          setDeletingItemId(null);
          setEditingItemId(null);
          setExpandedItemId(null);
        }}
        title={deletingItem ? `Remove ${deletingItem.name}?` : "Remove item?"}
        message={
          deletingItem
            ? `${deletingItem.name} will be permanently removed from your plan.`
            : "This item will be permanently removed from your plan."
        }
        confirmText="Remove"
        variant="danger"
        isLoading={deleteItem.isPending}
      />
    </div>
  );
}
