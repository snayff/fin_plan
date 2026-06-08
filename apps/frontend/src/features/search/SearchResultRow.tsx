import { Command } from "cmdk";

type Props = {
  title: string;
  subtitle: string;
  onSelect: () => void;
  value?: string;
};

export function SearchResultRow({ title, subtitle, onSelect, value }: Props) {
  return (
    <Command.Item
      value={value ?? `${title}::${subtitle}`}
      onSelect={onSelect}
      className="flex items-center justify-between px-3 py-2 rounded-sm data-[selected=true]:bg-foreground/[0.06] cursor-pointer"
    >
      <div className="flex flex-col min-w-0">
        <span className="text-sm text-foreground truncate">{title}</span>
        <span className="text-xs text-foreground/60 truncate">{subtitle}</span>
      </div>
    </Command.Item>
  );
}
