import { Command } from "cmdk";
import { useIsMobile } from "@/hooks/useIsMobile";

type Props = {
  title: string;
  subtitle: string;
  onSelect: () => void;
  value?: string;
  /**
   * When true and the viewport is mobile, render a "(desktop only)" badge.
   * Used for routes that soft-block on mobile (Goals, Gifts, Help, Household
   * Settings, FullWaterfall). Tapping still navigates and lands on the
   * MobileUnsupportedNotice — preserves discoverability per Item 2 amendment.
   */
  desktopOnly?: boolean;
};

export function SearchResultRow({ title, subtitle, onSelect, value, desktopOnly }: Props) {
  const isMobile = useIsMobile();
  const showBadge = isMobile && desktopOnly;
  return (
    <Command.Item
      value={value ?? `${title}::${subtitle}`}
      onSelect={onSelect}
      className="flex cursor-pointer items-center justify-between rounded-sm px-3 py-2 data-[selected=true]:bg-foreground/[0.06]"
    >
      <div className="flex min-w-0 flex-col">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm text-foreground">{title}</span>
          {showBadge && (
            <span
              aria-label="Desktop only"
              className="shrink-0 rounded-sm bg-foreground/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-foreground/55"
            >
              desktop only
            </span>
          )}
        </span>
        <span className="truncate text-xs text-foreground/60">{subtitle}</span>
      </div>
    </Command.Item>
  );
}
