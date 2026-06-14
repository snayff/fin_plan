import { motion, LayoutGroup } from "framer-motion";
import { usePrefersReducedMotion } from "@/utils/motion";

export type ForecastSection = "cashflow" | "growth";

interface ForecastSectionNavigatorProps {
  selected: ForecastSection;
  onSelect: (section: ForecastSection) => void;
}

const ENTRIES: Array<{ id: ForecastSection; label: string }> = [
  { id: "cashflow", label: "Cashflow" },
  { id: "growth", label: "Growth" },
];

const containerVariants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.06 } },
};

const rowVariants = {
  initial: { opacity: 0, x: -22 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.2, ease: [0.25, 1, 0.5, 1] } },
};

export function ForecastSectionNavigator({ selected, onSelect }: ForecastSectionNavigatorProps) {
  const reduced = usePrefersReducedMotion();

  return (
    <LayoutGroup>
      <motion.nav
        aria-label="Forecast sections"
        className="flex flex-col"
        variants={containerVariants}
        initial={reduced ? false : "initial"}
        animate="animate"
      >
        {ENTRIES.map((e) => {
          const active = e.id === selected;
          return (
            <motion.button
              key={e.id}
              type="button"
              onClick={() => onSelect(e.id)}
              aria-current={active || undefined}
              variants={rowVariants}
              className={[
                "relative flex w-full items-center px-4 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                active
                  ? "font-medium text-page-accent"
                  : "text-foreground/60 hover:bg-page-accent/5",
              ].join(" ")}
            >
              {active && !reduced && (
                <motion.div
                  layoutId="forecast-section-indicator"
                  className="absolute inset-0 bg-page-accent/14 border-l-2 border-page-accent rounded-r-sm"
                  transition={{ duration: 0.22, ease: [0.25, 1, 0.5, 1] }}
                />
              )}
              {active && reduced && (
                <div className="absolute inset-0 bg-page-accent/14 border-l-2 border-page-accent rounded-r-sm" />
              )}
              <span className="relative z-10">{e.label}</span>
            </motion.button>
          );
        })}
      </motion.nav>
    </LayoutGroup>
  );
}
