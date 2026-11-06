interface Props {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}

export default function GhostAddButton({ onClick, disabled, label = "+ Add" }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "rounded-md border px-3 py-1 text-xs font-medium transition-all duration-150",
        "border-foreground/20 text-foreground/60",
        "hover:border-page-accent/40 hover:bg-page-accent/8 hover:text-foreground/80",
        "disabled:cursor-not-allowed disabled:opacity-40",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
