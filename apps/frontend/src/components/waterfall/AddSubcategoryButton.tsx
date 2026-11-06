import { useState } from "react";

interface Props {
  onCreate: (name: string) => Promise<unknown>;
}

export function AddSubcategoryButton({ onCreate }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setEditing(false);
    setValue("");
    setError(null);
  };

  const submit = async () => {
    const name = value.trim();
    if (!name) return;
    setSaving(true);
    setError(null);
    try {
      await onCreate(name);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add subcategory");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="w-full rounded-md border border-foreground/10 px-3 py-2 text-xs text-text-tertiary hover:border-foreground/25 hover:text-text-secondary transition-colors"
      >
        + Add subcategory
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          type="text"
          aria-label="New subcategory name"
          placeholder="New subcategory name"
          maxLength={24}
          value={value}
          disabled={saving}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
            if (e.key === "Escape") reset();
          }}
          className="flex-1 rounded-md border border-foreground/15 bg-foreground/[0.03] px-3 py-1.5 text-sm focus:outline-none focus:border-page-accent/60"
        />
        <button
          type="button"
          onClick={reset}
          className="text-xs text-text-tertiary hover:text-text-secondary"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-[11px] text-attention">{error}</p>}
    </div>
  );
}
