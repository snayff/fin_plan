import { formatDistanceToNow } from "date-fns";
import type { SecurityActivityEntry } from "@finplan/shared";

const ACTION_COPY: Record<string, string> = {
  REGISTER: "Account created",
  LOGIN_SUCCESS: "Signed in",
  LOGIN_FAILED: "Sign-in attempt failed",
  LOGOUT: "Signed out",
  SESSION_REVOKED: "Session revoked",
  ALL_SESSIONS_REVOKED: "All sessions revoked",
};

function detailFor(entry: SecurityActivityEntry): string {
  if (entry.action === "UPDATE_PROFILE") {
    const m = entry.metadata as { before?: { name?: string }; after?: { name?: string } } | null;
    const before = m?.before?.name ?? "";
    const after = m?.after?.name ?? "";
    return `Name changed from ${before} to ${after}`;
  }
  return ACTION_COPY[entry.action] ?? entry.action;
}

function SkeletonRow() {
  return (
    <tr className="border-b border-border/40">
      {[1, 2, 3].map((i) => (
        <td key={i} className="px-3 py-2" aria-label="Loading">
          <div className="h-3 w-full animate-pulse rounded bg-muted/30" />
        </td>
      ))}
    </tr>
  );
}

export function SecurityActivityTable({
  entries,
  loading,
}: {
  entries: SecurityActivityEntry[];
  loading: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60">
            <th
              scope="col"
              className="px-3 py-2 text-left text-xs font-medium text-muted-foreground"
            >
              When
            </th>
            <th
              scope="col"
              className="px-3 py-2 text-left text-xs font-medium text-muted-foreground"
            >
              Action
            </th>
            <th
              scope="col"
              className="px-3 py-2 text-left text-xs font-medium text-muted-foreground"
            >
              Details
            </th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : entries.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-3 py-4 text-center text-xs text-muted-foreground">
                No recent activity
              </td>
            </tr>
          ) : (
            entries.map((e) => (
              <tr key={e.id} className="border-b border-border/40 hover:bg-muted/5">
                <td className="px-3 py-2 font-numeric text-xs text-muted-foreground whitespace-nowrap">
                  <span title={e.createdAt}>
                    {formatDistanceToNow(new Date(e.createdAt), { addSuffix: true })}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs">{e.action}</td>
                <td className="px-3 py-2 text-xs">{detailFor(e)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
