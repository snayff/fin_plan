import { useState } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useAuditLog } from "@/hooks/useSettings";
import { useHouseholdDetails } from "@/hooks/useSettings";
import { Button } from "@/components/ui/button";
import { SettingsSection } from "./SettingsSection";
import { AuditLogFilters } from "./AuditLogFilters";
import { AuditLogTable } from "./AuditLogTable";
import type { AuditEntry, ResourceSlug } from "@finplan/shared";

type Filters = {
  actorId?: string;
  resource?: string;
  dateRange?: string;
};

function dateFromDays(days: string | undefined): string | undefined {
  if (!days) return undefined;
  const d = new Date();
  d.setDate(d.getDate() - parseInt(days));
  return d.toISOString();
}

export function AuditLogSection() {
  const user = useAuthStore((s) => s.user);
  const householdId = user?.activeHouseholdId ?? "";

  const [filters, setFilters] = useState<Filters>({});

  const { data: householdData } = useHouseholdDetails(householdId);
  const members = householdData?.household?.memberProfiles ?? [];

  const queryFilters = {
    actorId: filters.actorId,
    resource: filters.resource as ResourceSlug | undefined,
    dateFrom: dateFromDays(filters.dateRange),
  };

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useAuditLog(queryFilters);

  const entries: AuditEntry[] = data?.pages.flatMap((p) => p.entries) ?? [];

  return (
    <SettingsSection
      id="audit-log"
      title="Audit log"
      description="A record of all changes made to your household data."
    >
      <AuditLogFilters filters={filters} members={members} onChange={setFilters} />

      {isError ? (
        <p className="text-sm text-muted-foreground">Unable to load audit log</p>
      ) : isLoading ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60">
                {["When", "Who", "Action", "Resource", "Changes"].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2 text-left text-xs font-medium text-muted-foreground"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3].map((i) => (
                <tr key={i} className="border-b border-border/40">
                  {[1, 2, 3, 4, 5].map((j) => (
                    <td key={j} className="px-3 py-2" aria-label="Loading">
                      <div className="h-3 w-full animate-pulse rounded bg-muted/30" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <AuditLogTable entries={entries} />
      )}

      {hasNextPage && (
        <div className="pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-page-accent hover:text-page-accent/80"
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? "Loading…" : "Load older entries"}
          </Button>
        </div>
      )}
      <p className="pt-3 text-xs text-muted-foreground">
        Entries older than 180 days are automatically removed.
      </p>
    </SettingsSection>
  );
}
