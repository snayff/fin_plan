import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ConfigBudgetPanel } from "./ConfigBudgetPanel";
import { ConfigPeoplePanel } from "./ConfigPeoplePanel";
import { ConfigEventsPanel } from "./ConfigEventsPanel";
import { ConfigPlannerModePanel } from "./ConfigPlannerModePanel";
import { QuickAddPanel } from "./QuickAddPanel";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { usePrefersReducedMotion } from "@/utils/motion";
import type { GiftPlannerMode } from "@finplan/shared";

type Drill = "list" | "people" | "events" | "budget" | "mode" | "quickadd";
type Props = {
  currentMode: GiftPlannerMode;
  readOnly: boolean;
  year: number;
  annualBudget: number;
  onDirtyChange?: (dirty: boolean) => void;
};

export function ConfigModePanel({
  currentMode,
  readOnly,
  year,
  annualBudget,
  onDirtyChange,
}: Props) {
  const [drill, setDrill] = useState<Drill>("list");
  const [dir, setDir] = useState(1);
  const [quickAddDirty, setQuickAddDirty] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const reduced = usePrefersReducedMotion();

  const slide = {
    initial: (d: number) => ({ x: reduced ? 0 : d * 24, opacity: 0 }),
    animate: { x: 0, opacity: 1, transition: { duration: 0.18, ease: [0.25, 1, 0.5, 1] } },
    exit: (d: number) => ({
      x: reduced ? 0 : -d * 24,
      opacity: 0,
      transition: { duration: 0.15 },
    }),
  };

  const drillInto = (target: Drill) => {
    setDir(1);
    setDrill(target);
  };

  const drillBack = () => {
    setDir(-1);
    setDrill("list");
  };

  const handleBack = () => {
    if (drill === "quickadd" && quickAddDirty) {
      setShowDiscard(true);
    } else {
      drillBack();
    }
  };

  const handleQuickAddDirtyChange = (dirty: boolean) => {
    setQuickAddDirty(dirty);
    onDirtyChange?.(dirty);
  };

  return (
    <AnimatePresence mode="wait" custom={dir}>
      {drill === "list" ? (
        <motion.div
          key="list"
          custom={dir}
          variants={slide}
          initial="initial"
          animate="animate"
          exit="exit"
          className="flex h-full flex-col"
        >
          <div className="px-4 py-3 flex items-center border-b border-foreground/5">
            <h2 className="font-heading text-base font-bold text-foreground">Config</h2>
          </div>
          <ul className="divide-y divide-foreground/5">
            {[
              { id: "people" as Drill, label: "People", description: "Who you buy gifts for" },
              {
                id: "events" as Drill,
                label: "Events",
                description: "Occasions like birthdays and holidays",
              },
              {
                id: "budget" as Drill,
                label: "Budget",
                description: "Set your annual gift budget",
              },
              {
                id: "mode" as Drill,
                label: "Mode",
                description: "Whether the gift budget links to your waterfall",
              },
              {
                id: "quickadd" as Drill,
                label: "Quick add",
                description: "Set planned amounts for everyone at once",
              },
            ].map((row) => (
              <li
                key={row.id}
                role="button"
                tabIndex={0}
                onClick={() => drillInto(row.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    drillInto(row.id);
                  }
                }}
                className="cursor-pointer px-6 py-3 text-sm text-foreground hover:bg-foreground/5"
              >
                <div>{row.label}</div>
                <div className="text-[11px] text-foreground/40">{row.description}</div>
              </li>
            ))}
          </ul>
        </motion.div>
      ) : (
        <motion.div
          key={drill}
          custom={dir}
          variants={slide}
          initial="initial"
          animate="animate"
          exit="exit"
          className="flex h-full flex-col"
        >
          <button
            type="button"
            onClick={handleBack}
            className="px-6 py-3 text-left text-xs text-foreground/50 hover:text-foreground"
          >
            ← Config / {labelFor(drill)}
          </button>
          {drill === "people" && <ConfigPeoplePanel readOnly={readOnly} year={year} />}
          {drill === "events" && <ConfigEventsPanel readOnly={readOnly} />}
          {drill === "budget" && (
            <ConfigBudgetPanel year={year} readOnly={readOnly} currentBudget={annualBudget} />
          )}
          {drill === "mode" && (
            <ConfigPlannerModePanel currentMode={currentMode} readOnly={readOnly} />
          )}
          {drill === "quickadd" && (
            <QuickAddPanel
              year={year}
              readOnly={readOnly}
              onDirtyChange={handleQuickAddDirtyChange}
            />
          )}
          <ConfirmDialog
            isOpen={showDiscard}
            onClose={() => setShowDiscard(false)}
            onConfirm={() => {
              setShowDiscard(false);
              setQuickAddDirty(false);
              drillBack();
            }}
            title="Discard changes?"
            message="You have unsaved changes to Quick Add. Discard them?"
            confirmText="Discard"
            variant="warning"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function labelFor(drill: Drill): string {
  switch (drill) {
    case "people":
      return "People";
    case "events":
      return "Events";
    case "budget":
      return "Budget";
    case "mode":
      return "Mode";
    case "quickadd":
      return "Quick add";
    default:
      return "";
  }
}
