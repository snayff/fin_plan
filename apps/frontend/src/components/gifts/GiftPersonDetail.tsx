import { useState } from "react";
import { useGiftPerson, useUpsertAllocation } from "@/hooks/useGifts";
import { GlossaryTermMarker } from "@/components/help/GlossaryTermMarker";
import { SkeletonLoader } from "@/components/common/SkeletonLoader";
import { PanelError } from "@/components/common/PanelError";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { GiftAllocationRow } from "@finplan/shared";
import { MONTHS, daysForMonth } from "./giftDates";

const inputClass =
  "w-24 rounded-md border border-foreground/10 bg-foreground/[0.04] px-2 py-1 font-numeric text-sm tabular-nums text-text-secondary focus:outline-none focus:border-page-accent/60 disabled:opacity-50";
const selectTriggerClass =
  "h-auto rounded-md border-foreground/10 bg-foreground/[0.04] py-1 text-sm focus:ring-page-accent/40";

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
            onDate={(dateMonth, dateDay) =>
              upsert.mutate({
                personId,
                eventId: a.giftEventId,
                year,
                data: { dateMonth, dateDay },
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
  onDate,
}: {
  allocation: GiftAllocationRow;
  readOnly: boolean;
  onSpent: (value: number | null) => void;
  onPlanned: (value: number) => void;
  onDate: (dateMonth: number, dateDay: number) => void;
}) {
  const [spent, setSpent] = useState<string>(
    allocation.spent !== null ? String(allocation.spent) : ""
  );
  const [planned, setPlanned] = useState<string>(String(allocation.planned));
  const isPersonal = allocation.eventDateType === "personal";
  const [month, setMonth] = useState<string>(
    allocation.dateMonth !== null ? String(allocation.dateMonth) : ""
  );
  const [day, setDay] = useState<string>(
    allocation.dateDay !== null ? String(allocation.dateDay) : ""
  );
  const needsDate = isPersonal && allocation.resolvedMonth === null;
  const cardKey = allocation.id ?? allocation.giftEventId;

  // Persist once both halves of the date are chosen.
  const commitDate = (nextMonth: string, nextDay: string) => {
    if (!nextMonth || !nextDay) return;
    onDate(parseInt(nextMonth, 10), parseInt(nextDay, 10));
  };

  return (
    <div className="rounded border border-foreground/10 bg-foreground/[0.02] px-4 py-3">
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
        <span className="label-section">{allocation.status}</span>
      </div>
      {needsDate && !readOnly && (
        <p className="mt-1 text-xs text-text-tertiary">
          Pick the day and month below so this shows up in Upcoming.
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          <span className="label-chart">Planned</span>
          <input
            type="number"
            min={0}
            disabled={readOnly}
            value={planned}
            onChange={(e) => setPlanned(e.target.value)}
            onBlur={() => onPlanned(parseFloat(planned) || 0)}
            aria-label={`${allocation.eventName} planned`}
            data-testid={`planned-input-${cardKey}`}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label-chart">Spent</span>
          <input
            type="number"
            min={0}
            disabled={readOnly}
            value={spent}
            onChange={(e) => setSpent(e.target.value)}
            onBlur={() => onSpent(spent === "" ? null : parseFloat(spent))}
            aria-label={`${allocation.eventName} spent`}
            data-testid={`spent-input-${cardKey}`}
            className={inputClass}
          />
        </label>
        {isPersonal && (
          <div className="flex flex-col gap-1" data-testid={`date-fields-${cardKey}`}>
            <span className="label-chart">Date</span>
            <div className="flex gap-2">
              <Select
                value={day}
                disabled={readOnly}
                onValueChange={(v) => {
                  setDay(v);
                  commitDate(month, v);
                }}
              >
                <SelectTrigger
                  aria-label={`${allocation.eventName} day`}
                  className={`${selectTriggerClass} w-20`}
                >
                  <SelectValue placeholder="Day" />
                </SelectTrigger>
                <SelectContent>
                  {daysForMonth(parseInt(month, 10) || 1).map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={month}
                disabled={readOnly}
                onValueChange={(v) => {
                  // Clamp the day if the new month is shorter (e.g. 31 → February).
                  const maxDay = daysForMonth(parseInt(v, 10)).length;
                  const nextDay = day && parseInt(day, 10) > maxDay ? String(maxDay) : day;
                  setMonth(v);
                  setDay(nextDay);
                  commitDate(v, nextDay);
                }}
              >
                <SelectTrigger
                  aria-label={`${allocation.eventName} month`}
                  className={`${selectTriggerClass} w-32`}
                >
                  <SelectValue placeholder="Month" />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
