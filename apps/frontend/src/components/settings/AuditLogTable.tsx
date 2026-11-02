import { formatDistanceToNow } from "date-fns";
import type { AuditEntry } from "@finplan/shared";
import { ActionBadge } from "./ActionBadge";
import { ChangesCell } from "./ChangesCell";

type Props = {
  entries: AuditEntry[];
};

function RelativeTime({ iso }: { iso: string }) {
  const date = new Date(iso);
  const relative = formatDistanceToNow(date, { addSuffix: true });
  return (
    <span title={iso} className="cursor-default">
      {relative}
    </span>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b border-border/40">
      {[1, 2, 3, 4, 5].map((i) => (
        <td key={i} className="px-3 py-2" aria-label="Loading">
          <div className="h-3 w-full animate-pulse rounded bg-muted/30" />
        </td>
      ))}
    </tr>
  );
}

export function AuditLogTable({ entries }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60">
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">When</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Who</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
              Action
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
              Resource
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
              Changes
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-xs text-muted-foreground">
                  No changes recorded yet
                </td>
              </tr>
            </>
          ) : (
            entries.map((entry) => (
              <tr key={entry.id} className="border-b border-border/40 hover:bg-muted/5">
                <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                  <RelativeTime iso={entry.createdAt} />
                </td>
                <td className="px-3 py-2 text-xs whitespace-nowrap">
                  {entry.actorName ?? <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-2">
                  <ActionBadge action={entry.action} />
                </td>
                <td className="px-3 py-2">
                  <div className="text-xs">
                    {entry.resourceId ?? <span className="text-muted-foreground">—</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">{entry.resource}</div>
                </td>
                <td className="px-3 py-2">
                  <ChangesCell changes={entry.changes} action={entry.action} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
