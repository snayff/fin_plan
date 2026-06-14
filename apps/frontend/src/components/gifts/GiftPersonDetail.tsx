import { useState } from "react";
import { useGiftPerson, useUpsertAllocation } from "@/hooks/useGifts";
import { GlossaryTermMarker } from "@/components/help/GlossaryTermMarker";
import { SkeletonLoader } from "@/components/common/SkeletonLoader";
import { PanelError } from "@/components/common/PanelError";
import type { GiftAllocationRow } from "@finplan/shared";

type Props = { personId: string; year: number; onBack: () => void; readOnly: boolean };

export function GiftPersonDetail({ personId, year, onBack, readOnly }: Props) {
  const { data, isLoading, isError, refetch } = useGiftPerson(personId, year);
  const upsert = useUpsertAllocation();
  if (isError)
    return (
      <PanelError
        variant="detail"
        onRetry={() => void refetch()}
        message="Couldn't load this person."
      />
    );
  if (isLoading || !data) return <SkeletonLoader variant="right-panel" />;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-foreground/5 text-sm text-muted-foreground">
        <button
          type="button"
          data-testid="gifts-breadcrumb-back"
          onClick={onBack}
          className="hover:text-foreground transition-colors"
        >
          ← People
        </button>
        <span>/</span>
        <span className="text-foreground font-medium">{data.person.name}</span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {data.allocations.map((a) => (
          <AllocationCard
            key={a.giftEventId}
            allocation={a}
            readOnly={readOnly}
            onSpent={(value) =>
              upsert.mutate({
                personId,
                eventId: a.giftEventId,
                year,
                data: { spent: value },
              })
            }
            onPlanned={(value) =>
              upsert.mutate({
                personId,
                eventId: a.giftEventId,
                year,
                data: { planned: value },
              })
            }
          />
        ))}
      </div>
    </div>
  );
}

function AllocationCard({
  allocation,
  readOnly,
  onSpent,
  onPlanned,
}: {
  allocation: GiftAllocationRow;
  readOnly: boolean;
  onSpent: (value: number | null) => void;
  onPlanned: (value: number) => void;
}) {
  const [spent, setSpent] = useState<string>(
    allocation.spent !== null ? String(allocation.spent) : ""
  );
  const [planned, setPlanned] = useState<string>(String(allocation.planned));
  const needsDate = allocation.eventDateType === "personal" && allocation.resolvedMonth === null;

  return (
    <div className="rounded border border-foreground/5 bg-foreground/[0.02] px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-foreground">{allocation.eventName}</span>
          {needsDate && (
            <GlossaryTermMarker entryId="gifts-personal-date">
              <span className="inline-flex items-center gap-1 rounded bg-attention-bg px-1.5 py-0.5 text-[11px] text-attention border border-attention-border">
                <span aria-hidden className="h-1 w-1 rounded-full bg-attention" />
                needs date
              </span>
            </GlossaryTermMarker>
          )}
        </div>
        <span className="text-[11px] uppercase tracking-wide text-foreground/40">
          {allocation.status}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-4">
        <label className="flex items-center gap-1 text-[11px] text-foreground/40">
          Planned
          <input
            type="number"
            min={0}
            disabled={readOnly}
            value={planned}
            onChange={(e) => setPlanned(e.target.value)}
            onBlur={() => onPlanned(parseFloat(planned) || 0)}
            data-testid={`planned-input-${allocation.id ?? allocation.giftEventId}`}
            className="w-20 rounded bg-foreground/5 px-2 py-1 font-mono text-sm tabular-nums text-foreground"
          />
        </label>
        <label className="flex items-center gap-1 text-[11px] text-foreground/40">
          Spent
          <input
            type="number"
            min={0}
            disabled={readOnly}
            value={spent}
            onChange={(e) => setSpent(e.target.value)}
            onBlur={() => onSpent(spent === "" ? null : parseFloat(spent))}
            data-testid={`spent-input-${allocation.id ?? allocation.giftEventId}`}
            className="w-20 rounded bg-foreground/5 px-2 py-1 font-mono text-sm tabular-nums text-foreground"
          />
        </label>
      </div>
    </div>
  );
}
