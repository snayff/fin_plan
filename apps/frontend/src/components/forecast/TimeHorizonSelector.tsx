import { cn } from "@/lib/utils";
import type { ForecastHorizon } from "@finplan/shared";

const HORIZONS: { value: ForecastHorizon; label: string }[] = [
  { value: 1, label: "1y" },
  { value: 3, label: "3y" },
  { value: 10, label: "10y" },
  { value: 20, label: "20y" },
  { value: 30, label: "30y" },
];

interface TimeHorizonSelectorProps {
  value: ForecastHorizon;
  onChange: (horizon: ForecastHorizon) => void;
}

export function TimeHorizonSelector({ value, onChange }: TimeHorizonSelectorProps) {
  return (
    <div
      role="group"
      aria-label="Time horizon"
      className="flex items-center gap-0.5 bg-surface rounded-lg p-0.5 border border-surface-elevated"
    >
      {HORIZONS.map(({ value: h, label }) => (
        <button
          key={h}
          type="button"
          role="button"
          aria-pressed={value === h}
          onClick={() => onChange(h)}
          className={cn(
            "px-3 py-1 rounded-md text-xs font-heading font-medium transition-colors duration-150",
            value === h
              ? "bg-surface-elevated text-page-accent"
              : "text-text-tertiary hover:text-text-secondary"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
