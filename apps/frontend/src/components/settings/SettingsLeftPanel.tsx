import { PageHeader } from "@/components/common/PageHeader";
import { cn } from "@/lib/utils";

export interface SettingsNavItem {
  id: string;
  label: string;
  group?: string;
}

interface SettingsLeftPanelProps {
  title: string;
  subLabel?: string;
  contextName?: string;
  activeId: string;
  items: SettingsNavItem[];
  onNavClick: (id: string) => void;
}

export function SettingsLeftPanel({
  title,
  subLabel,
  contextName,
  activeId,
  items,
  onNavClick,
}: SettingsLeftPanelProps) {
  const version = import.meta.env.VITE_APP_VERSION ?? "dev";
  const hasGroups = items.some((i) => i.group);

  const groups = hasGroups
    ? items.reduce<{ key: string; items: SettingsNavItem[] }[]>((acc, item) => {
        const key = item.group ?? "";
        const last = acc[acc.length - 1];
        if (last && last.key === key) last.items.push(item);
        else acc.push({ key, items: [item] });
        return acc;
      }, [])
    : [{ key: "", items }];

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0">
        <PageHeader title={title} contextName={contextName} />
        {subLabel && (
          <p className="px-4 -mt-2 pb-3 text-xs font-medium text-foreground/40">{subLabel}</p>
        )}
      </div>
      <nav aria-label="Settings sections" className="flex-1 min-h-0 overflow-y-auto">
        {groups.map((g) => (
          <div key={g.key || "flat"}>
            {g.key && <p className="label-detail px-4 pt-3 pb-1">{g.key}</p>}
            {g.items.map((item) => {
              const isActive = item.id === activeId;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={isActive ? "true" : undefined}
                  onClick={() => onNavClick(item.id)}
                  className={cn(
                    "relative flex w-full items-center px-4 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-page-accent",
                    isActive
                      ? "font-medium text-page-accent bg-page-accent/14 border-l-2 border-page-accent rounded-r-sm"
                      : "text-foreground/60 hover:bg-page-accent/5 hover:text-foreground/90"
                  )}
                >
                  <span className="relative z-10">{item.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="shrink-0 border-t border-foreground/10 px-4 py-3 flex justify-between text-sm">
        <span className="text-foreground/40">finplan</span>
        <span className="font-numeric text-xs text-foreground/30">v{version}</span>
      </div>
    </div>
  );
}
