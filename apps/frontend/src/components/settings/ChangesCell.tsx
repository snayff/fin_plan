import { format, parseISO, isValid } from "date-fns";
import type { AuditChange } from "@finplan/shared";

type Props = { changes: AuditChange[] | null; action: string };

const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function humanizeField(field: string): string {
  return field
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toLowerCase())
    .trim();
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

function formatValue(value: unknown): { text: string; empty: boolean } {
  if (isEmpty(value)) return { text: "(empty)", empty: true };
  if (typeof value === "boolean") return { text: value ? "Yes" : "No", empty: false };
  if (typeof value === "string" && ISO_DATETIME_RE.test(value)) {
    const parsed = parseISO(value);
    if (isValid(parsed)) return { text: format(parsed, "d MMM yyyy"), empty: false };
  }
  return { text: String(value), empty: false };
}

function ValueSpan({ value, tone }: { value: unknown; tone: "before" | "after" }) {
  const { text, empty } = formatValue(value);
  const base = tone === "after" ? "text-foreground" : "text-muted-foreground";
  if (empty) return <span className={`${base} italic opacity-70`}>{text}</span>;
  return <span className={base}>{text}</span>;
}

export function ChangesCell({ changes, action }: Props) {
  if (!changes || changes.length === 0)
    return <span className="text-muted-foreground text-xs">—</span>;

  const isCreate = action.startsWith("CREATE_");
  const isDelete = action.startsWith("DELETE_");

  return (
    <div className="space-y-2">
      {changes.map((c, i) => (
        <div key={i} className="flex flex-col gap-0.5">
          <span className="label-section">{humanizeField(c.field)}</span>
          <div className="font-mono text-xs">
            {isCreate && <ValueSpan value={c.after} tone="after" />}
            {isDelete && (
              <span className="text-muted-foreground line-through">
                <ValueSpan value={c.before} tone="before" />
              </span>
            )}
            {!isCreate && !isDelete && (
              <span className="inline-flex flex-wrap items-baseline gap-1">
                <ValueSpan value={c.before} tone="before" />
                <span className="text-muted-foreground">→</span>
                <ValueSpan value={c.after} tone="after" />
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
