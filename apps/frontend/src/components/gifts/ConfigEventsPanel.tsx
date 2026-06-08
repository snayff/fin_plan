import { useState } from "react";
import { useConfigEvents, useCreateGiftEvent, useDeleteGiftEvent } from "@/hooks/useGifts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GlossaryTermMarker } from "@/components/help/GlossaryTermMarker";
import type { GiftDateType } from "@finplan/shared";

type Props = { readOnly: boolean };

const MONTHS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

function daysForMonth(month: number): { value: string; label: string }[] {
  const count = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 31;
  return Array.from({ length: count }, (_, i) => ({
    value: String(i + 1),
    label: String(i + 1),
  }));
}

export function ConfigEventsPanel({ readOnly }: Props) {
  const { data, isLoading } = useConfigEvents();
  const create = useCreateGiftEvent();
  const remove = useDeleteGiftEvent();
  const [name, setName] = useState("");
  const [dateType, setDateType] = useState<GiftDateType>("personal");
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [showForm, setShowForm] = useState(false);

  const submit = () => {
    if (!name.trim()) return;
    const payload: Record<string, unknown> = { name: name.trim(), dateType };
    if (dateType === "shared") {
      payload.dateMonth = parseInt(month, 10);
      payload.dateDay = parseInt(day, 10);
    }
    create.mutate(payload as any);
    setName("");
    setMonth("");
    setDay("");
    setShowForm(false);
  };

  const cancel = () => {
    setName("");
    setMonth("");
    setDay("");
    setDateType("personal");
    setShowForm(false);
  };

  if (isLoading || !data) return <div className="p-6 text-sm text-text-muted">Loading…</div>;
  const locked = data.filter((e: any) => e.isLocked);
  const custom = data.filter((e: any) => !e.isLocked);

  const labelClass = "text-text-muted uppercase tracking-[0.07em] text-[10px]";
  const inputClass =
    "rounded-md border border-foreground/10 bg-foreground/[0.04] px-3 py-1.5 text-sm text-text-secondary placeholder:italic placeholder:text-text-muted focus:outline-none focus:border-page-accent/60";
  const selectTriggerClass =
    "h-auto rounded-md border-foreground/10 bg-foreground/[0.04] py-1.5 text-sm focus:ring-page-accent/40";

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-foreground/5">
        <div className="flex items-center gap-3">
          <h2 className="font-heading text-base font-bold text-foreground">Events</h2>
          <span className="text-xs text-foreground/40">
            {data.length} {data.length === 1 ? "event" : "events"}
          </span>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        {/* Locked events */}
        <section>
          <h3 className={labelClass}>
            <GlossaryTermMarker entryId="gifts-locked-event">Locked</GlossaryTermMarker>
          </h3>
          <ul className="mt-2 divide-y divide-foreground/5">
            {locked.map((e: any) => (
              <li
                key={e.id}
                data-testid={`event-row-${e.id}`}
                className="flex items-center justify-between py-2"
              >
                <span className="text-sm text-text-secondary">
                  <span aria-hidden className="mr-2 text-text-muted">
                    🔒
                  </span>
                  {e.name}
                </span>
                <span className="text-[11px] text-text-muted">
                  {e.dateType === "shared" ? (
                    <GlossaryTermMarker entryId="gifts-shared-date">{`${e.dateMonth}/${e.dateDay}`}</GlossaryTermMarker>
                  ) : (
                    <GlossaryTermMarker entryId="gifts-personal-date">personal</GlossaryTermMarker>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Custom events */}
        <section className="mt-6">
          <h3 className={labelClass}>Custom</h3>
          <ul className="mt-2 divide-y divide-foreground/5">
            {custom.map((e: any) => (
              <li
                key={e.id}
                data-testid={`event-row-${e.id}`}
                className="flex items-center justify-between py-2"
              >
                <span className="text-sm text-text-secondary">{e.name}</span>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => remove.mutate(e.id)}
                    className="text-xs text-text-muted hover:text-red-400 transition-colors"
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>

          {/* Add event form */}
          {!readOnly && !showForm && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="mt-3 rounded-md border border-foreground/20 px-3 py-1 text-xs font-medium text-foreground/60 hover:border-page-accent/40 hover:bg-page-accent/8 hover:text-foreground/80 transition-all duration-150"
            >
              + Add event
            </button>
          )}

          {!readOnly && showForm && (
            <div className="mt-3 border-t border-foreground/5 bg-foreground/[0.02] py-3 pr-4 flex flex-col gap-3 border-l-2 border-tier-discretionary pl-[30px]">
              <div className="grid grid-cols-2 gap-3">
                {/* Event name */}
                <div className="col-span-2 flex flex-col gap-1">
                  <label className={labelClass}>
                    Name <span className="text-text-muted">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Halloween, Anniversary"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    aria-label="Event name"
                    autoFocus
                    className={inputClass}
                  />
                </div>

                {/* Date type */}
                <div className="col-span-2 flex flex-col gap-1">
                  <label className={labelClass}>Date type</label>
                  <Select value={dateType} onValueChange={(v) => setDateType(v as GiftDateType)}>
                    <SelectTrigger aria-label="Date type" className={selectTriggerClass}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="shared">Same date every year (e.g. Christmas)</SelectItem>
                      <SelectItem value="personal">Different per person (e.g. Birthday)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Month & Day selects for shared-date events */}
                {dateType === "shared" && (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className={labelClass}>Month</label>
                      <Select value={month} onValueChange={setMonth}>
                        <SelectTrigger aria-label="Month" className={selectTriggerClass}>
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
                    <div className="flex flex-col gap-1">
                      <label className={labelClass}>Day</label>
                      <Select value={day} onValueChange={setDay}>
                        <SelectTrigger aria-label="Day" className={selectTriggerClass}>
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
                    </div>
                  </>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={cancel}
                  className="rounded-md border border-foreground/10 px-3 py-1 text-xs text-text-tertiary hover:bg-foreground/5 transition-colors"
                >
                  Cancel
                </button>
                <span className="flex-1" />
                <button
                  type="button"
                  onClick={submit}
                  disabled={!name.trim()}
                  className="rounded-md px-3 py-1 text-xs font-medium bg-page-accent/20 text-page-accent hover:bg-page-accent/30 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
