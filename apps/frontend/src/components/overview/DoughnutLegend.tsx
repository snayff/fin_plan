export interface LegendEntry {
  colour: string;
  label: string;
}

interface DoughnutLegendProps {
  entries: LegendEntry[];
}

const MAX_ENTRIES = 7;

export function DoughnutLegend({ entries }: DoughnutLegendProps) {
  const needsOverflow = entries.length > MAX_ENTRIES;
  const visible = needsOverflow ? entries.slice(0, MAX_ENTRIES - 1) : entries;
  const overflowCount = entries.length - visible.length;

  return (
    <ul className="flex flex-col gap-1.5">
      {visible.map((entry) => (
        <li key={entry.label} className="flex items-center gap-2 min-w-0">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: entry.colour }}
            aria-hidden="true"
          />
          <span className="text-xs truncate font-body text-text-secondary">{entry.label}</span>
        </li>
      ))}
      {needsOverflow && (
        <li className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full shrink-0 bg-foreground/20" aria-hidden="true" />
          <span className="text-xs font-body text-foreground/40">{overflowCount} others</span>
        </li>
      )}
    </ul>
  );
}
