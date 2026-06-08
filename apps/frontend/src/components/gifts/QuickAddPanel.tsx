import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useBulkUpsertAllocations,
  useCreateGiftEvent,
  useCreateGiftPerson,
  useQuickAddMatrix,
  useSetGiftBudget,
} from "@/hooks/useGifts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import type { GiftDateType } from "@finplan/shared";

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

type Props = {
  year: number;
  readOnly: boolean;
  onDirtyChange?: (dirty: boolean) => void;
};

type AddForm = "person" | "event" | null;

export function QuickAddPanel({ year, readOnly, onDirtyChange }: Props) {
  const matrix = useQuickAddMatrix(year);
  const bulk = useBulkUpsertAllocations();
  const setBudgetMutation = useSetGiftBudget();
  const createPerson = useCreateGiftPerson();
  const createEvent = useCreateGiftEvent();
  const [cells, setCells] = useState<Record<string, string>>({});
  const [initialCells, setInitialCells] = useState<Record<string, string>>({});
  const [initialized, setInitialized] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);

  // Inline add form state
  const [addForm, setAddForm] = useState<AddForm>(null);
  const [personName, setPersonName] = useState("");
  const [eventName, setEventName] = useState("");
  const [eventDateType, setEventDateType] = useState<GiftDateType>("personal");
  const [eventMonth, setEventMonth] = useState("");
  const [eventDay, setEventDay] = useState("");
  const [personNameError, setPersonNameError] = useState("");

  // Pre-populate cells from existing allocations once data loads
  useEffect(() => {
    if (matrix.data && !initialized) {
      const initial: Record<string, string> = {};
      for (const a of matrix.data.allocations) {
        if (a.planned > 0) {
          initial[`${a.personId}-${a.eventId}`] = String(a.planned);
        }
      }
      setCells(initial);
      setInitialCells(initial);
      setInitialized(true);
    }
  }, [matrix.data, initialized]);

  // Dirty tracking
  const isDirty = useMemo(() => {
    const allKeys = new Set([...Object.keys(cells), ...Object.keys(initialCells)]);
    for (const key of allKeys) {
      const current = cells[key] ?? "";
      const initial = initialCells[key] ?? "";
      if (current !== initial) return true;
    }
    return false;
  }, [cells, initialCells]);

  const prevDirtyRef = useRef(false);
  useEffect(() => {
    if (isDirty !== prevDirtyRef.current) {
      prevDirtyRef.current = isDirty;
      onDirtyChange?.(isDirty);
    }
  }, [isDirty, onDirtyChange]);

  // Guard browser navigation/refresh when dirty
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const people = matrix.data?.people ?? [];
  const events = matrix.data?.events ?? [];
  const budget = matrix.data?.budget;

  const [budgetInput, setBudgetInput] = useState<string | null>(null);
  const budgetDisplayValue = budgetInput ?? String(budget?.annual ?? 0);

  const saveBudget = () => {
    const parsed = parseFloat(budgetDisplayValue);
    if (Number.isNaN(parsed) || parsed < 0) return;
    if (parsed === (budget?.annual ?? 0)) {
      setBudgetInput(null);
      return;
    }
    setBudgetMutation.mutate({ year, data: { annualBudget: parsed } });
    setBudgetInput(null);
  };

  const set = (personId: string, eventId: string, value: string) =>
    setCells((prev) => ({ ...prev, [`${personId}-${eventId}`]: value }));

  const cellValue = (personId: string, eventId: string): number => {
    const raw = cells[`${personId}-${eventId}`];
    if (!raw) return 0;
    const n = parseFloat(raw);
    return Number.isNaN(n) ? 0 : n;
  };

  const rowTotal = (personId: string): number =>
    events.reduce((sum, e) => sum + cellValue(personId, e.id), 0);

  const colTotal = (eventId: string): number =>
    people.reduce((sum, p) => sum + cellValue(p.id, eventId), 0);

  const grandTotal = useMemo(
    () => people.reduce((sum, p) => sum + rowTotal(p.id), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cells, people, events]
  );

  const allocated = grandTotal;
  const activeBudget = parseFloat(budgetDisplayValue) || 0;
  const remaining = activeBudget - allocated;

  const save = () => {
    const payload = Object.entries(cells)
      .map(([key, value]) => {
        const [personId, eventId] = key.split("-");
        const planned = parseFloat(value);
        if (Number.isNaN(planned) || planned <= 0) return null;
        return { personId: personId!, eventId: eventId!, year, planned };
      })
      .filter(
        (c): c is { personId: string; eventId: string; year: number; planned: number } => c !== null
      );
    bulk.mutate(
      { cells: payload },
      {
        onSuccess: () => {
          const next: Record<string, string> = {};
          for (const [key, value] of Object.entries(cells)) {
            const n = parseFloat(value);
            if (!Number.isNaN(n) && n > 0) next[key] = String(n);
          }
          setCells(next);
          setInitialCells(next);
        },
      }
    );
  };

  const resetCells = useCallback(() => {
    setCells({});
    setInitialCells({});
    setInitialized(false);
  }, []);

  const handleCancel = () => {
    if (isDirty) {
      setShowDiscard(true);
    } else {
      resetCells();
    }
  };

  // Add person
  const isPersonDuplicate = (n: string) =>
    people.some((p) => p.name.toLowerCase() === n.toLowerCase());

  const submitPerson = () => {
    const trimmed = personName.trim();
    if (!trimmed) return;
    if (isPersonDuplicate(trimmed)) {
      setPersonNameError("A person with that name already exists");
      return;
    }
    createPerson.mutate({ name: trimmed });
    setPersonName("");
    setPersonNameError("");
    setAddForm(null);
  };

  // Add event
  const submitEvent = () => {
    if (!eventName.trim()) return;
    const payload: Record<string, unknown> = { name: eventName.trim(), dateType: eventDateType };
    if (eventDateType === "shared") {
      payload.dateMonth = parseInt(eventMonth, 10);
      payload.dateDay = parseInt(eventDay, 10);
    }
    createEvent.mutate(payload as any);
    setEventName("");
    setEventDateType("personal");
    setEventMonth("");
    setEventDay("");
    setAddForm(null);
  };

  const cancelAddForm = () => {
    setPersonName("");
    setPersonNameError("");
    setEventName("");
    setEventDateType("personal");
    setEventMonth("");
    setEventDay("");
    setAddForm(null);
  };

  const labelClass = "text-text-muted uppercase tracking-[0.07em] text-[10px]";
  const inputClass =
    "rounded-md border border-foreground/10 bg-foreground/[0.04] px-3 py-1.5 text-sm text-text-secondary placeholder:italic placeholder:text-text-muted focus:outline-none focus:border-page-accent/60";
  const selectTriggerClass =
    "h-auto rounded-md border-foreground/10 bg-foreground/[0.04] py-1.5 text-sm focus:ring-page-accent/40";

  if (matrix.isLoading || !matrix.data) {
    return <div className="p-6 text-sm text-foreground/40">Loading…</div>;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-foreground/5">
        <h2 className="font-heading text-base font-bold text-foreground">Quick Add</h2>
        <p className="mt-0.5 text-[11px] text-foreground/40">
          {people.length} people · {events.length} events
        </p>
      </div>

      <div className="flex-1 flex flex-col gap-4 p-6 overflow-auto">
        {/* Helper text */}
        <div className="rounded-md border border-foreground/10 bg-foreground/[0.03] px-3.5 py-2.5 text-xs text-foreground/40">
          Bulk-enter people, events, and planned amounts for {year}. Empty cells mean "no gift
          planned".
        </div>

        {/* Inline add buttons / forms */}
        {!readOnly && (
          <div className="flex flex-col gap-3">
            {/* Ghost buttons row */}
            {addForm === null && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAddForm("person")}
                  className="rounded-md border border-foreground/20 px-3 py-1 text-xs font-medium text-foreground/60 hover:border-page-accent/40 hover:bg-page-accent/8 hover:text-foreground/80 transition-all duration-150"
                >
                  + Add person
                </button>
                <button
                  type="button"
                  onClick={() => setAddForm("event")}
                  className="rounded-md border border-foreground/20 px-3 py-1 text-xs font-medium text-foreground/60 hover:border-page-accent/40 hover:bg-page-accent/8 hover:text-foreground/80 transition-all duration-150"
                >
                  + Add event
                </button>
              </div>
            )}

            {/* Add person form */}
            {addForm === "person" && (
              <div className="border-t border-foreground/5 bg-foreground/[0.02] py-3 pr-4 flex flex-col gap-3 border-l-2 border-tier-discretionary pl-[30px]">
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>
                    Name <span className="text-foreground/30">*</span>
                  </label>
                  <input
                    autoFocus
                    type="text"
                    placeholder="e.g. Mum, Best friend"
                    value={personName}
                    onChange={(e) => {
                      setPersonName(e.target.value);
                      setPersonNameError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitPerson();
                      if (e.key === "Escape") cancelAddForm();
                    }}
                    className={[
                      "rounded-md border bg-foreground/[0.04] px-3 py-1.5 text-sm text-text-secondary placeholder:italic placeholder:text-text-muted focus:outline-none focus:border-page-accent/60",
                      personNameError ? "border-attention/60" : "border-foreground/10",
                    ].join(" ")}
                  />
                  {personNameError && (
                    <p className="text-[11px] text-attention">{personNameError}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={cancelAddForm}
                    className="rounded-md border border-foreground/10 px-3 py-1 text-xs text-text-tertiary hover:bg-foreground/5 transition-colors"
                  >
                    Cancel
                  </button>
                  <span className="flex-1" />
                  <button
                    type="button"
                    onClick={submitPerson}
                    disabled={!personName.trim()}
                    className="rounded-md px-3 py-1 text-xs font-medium bg-page-accent/20 text-page-accent hover:bg-page-accent/30 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
            )}

            {/* Add event form */}
            {addForm === "event" && (
              <div className="border-t border-foreground/5 bg-foreground/[0.02] py-3 pr-4 flex flex-col gap-3 border-l-2 border-tier-discretionary pl-[30px]">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 flex flex-col gap-1">
                    <label className={labelClass}>
                      Name <span className="text-foreground/30">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Halloween, Anniversary"
                      value={eventName}
                      onChange={(e) => setEventName(e.target.value)}
                      aria-label="Event name"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Escape") cancelAddForm();
                      }}
                      className={inputClass}
                    />
                  </div>

                  <div className="col-span-2 flex flex-col gap-1">
                    <label className={labelClass}>Date type</label>
                    <Select
                      value={eventDateType}
                      onValueChange={(v) => setEventDateType(v as GiftDateType)}
                    >
                      <SelectTrigger aria-label="Date type" className={selectTriggerClass}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="shared">
                          Same date every year (e.g. Christmas)
                        </SelectItem>
                        <SelectItem value="personal">
                          Different per person (e.g. Birthday)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {eventDateType === "shared" && (
                    <>
                      <div className="flex flex-col gap-1">
                        <label className={labelClass}>Month</label>
                        <Select value={eventMonth} onValueChange={setEventMonth}>
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
                        <Select value={eventDay} onValueChange={setEventDay}>
                          <SelectTrigger aria-label="Day" className={selectTriggerClass}>
                            <SelectValue placeholder="Day" />
                          </SelectTrigger>
                          <SelectContent>
                            {daysForMonth(parseInt(eventMonth, 10) || 1).map((d) => (
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

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={cancelAddForm}
                    className="rounded-md border border-foreground/10 px-3 py-1 text-xs text-text-tertiary hover:bg-foreground/5 transition-colors"
                  >
                    Cancel
                  </button>
                  <span className="flex-1" />
                  <button
                    type="button"
                    onClick={submitEvent}
                    disabled={!eventName.trim()}
                    className="rounded-md px-3 py-1 text-xs font-medium bg-page-accent/20 text-page-accent hover:bg-page-accent/30 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Matrix */}
        {people.length === 0 || events.length === 0 ? (
          <div className="rounded-md border border-foreground/10 px-4 py-8 text-center text-xs text-foreground/40">
            {people.length === 0 && events.length === 0
              ? "Add people and events above to get started."
              : people.length === 0
                ? "Add people above to get started."
                : "Add events above to get started."}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-foreground/10 bg-foreground/[0.02]">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-foreground/[0.04] px-4 py-3 text-left font-heading text-[10px] font-semibold uppercase tracking-wider text-foreground/40 border-b border-foreground/10">
                    Person
                  </th>
                  {events.map((e) => (
                    <th
                      key={e.id}
                      className="bg-foreground/[0.04] px-2.5 py-3 text-right font-heading text-[10px] font-semibold uppercase tracking-wider text-foreground/40 border-b border-foreground/10 whitespace-nowrap"
                    >
                      {e.name}
                    </th>
                  ))}
                  <th className="bg-foreground/[0.04] px-2.5 py-3 text-right font-heading text-[10px] font-semibold uppercase tracking-wider text-foreground/40 border-b border-foreground/10 border-l border-foreground/10">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id} className="group hover:bg-foreground/[0.02]">
                    <td className="sticky left-0 z-10 bg-inherit px-4 py-0 text-[13px] font-medium text-foreground whitespace-nowrap border-b border-foreground/5">
                      {p.name}
                      {p.memberId && (
                        <span className="ml-1.5 inline-block rounded bg-violet-500/12 px-1.5 py-px text-[9px] uppercase tracking-wider text-violet-400">
                          Household
                        </span>
                      )}
                    </td>
                    {events.map((e) => (
                      <td
                        key={e.id}
                        className="border-b border-foreground/5 border-l border-foreground/[0.04] p-0"
                      >
                        <input
                          type="number"
                          min={0}
                          step="any"
                          data-testid={`cell-${p.id}-${e.id}`}
                          aria-label={`Planned amount for ${p.name} × ${e.name}`}
                          disabled={readOnly}
                          placeholder="—"
                          value={cells[`${p.id}-${e.id}`] ?? ""}
                          onChange={(ev) => set(p.id, e.id, ev.target.value)}
                          className="w-full min-w-[64px] bg-transparent px-2.5 py-3 text-right font-mono text-xs tabular-nums text-foreground/70 placeholder:text-foreground/20 focus:bg-violet-500/8 focus:text-foreground focus:outline-none"
                        />
                      </td>
                    ))}
                    <td className="border-b border-foreground/5 border-l border-foreground/10 bg-foreground/[0.04] px-2.5 py-3 text-right font-mono text-xs tabular-nums text-foreground">
                      {rowTotal(p.id) > 0 ? `£${rowTotal(p.id).toLocaleString()}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="sticky left-0 z-10 bg-foreground/[0.04] px-4 py-3 font-heading text-[10px] font-semibold uppercase tracking-wider text-foreground/40 border-t border-foreground/10">
                    Total
                  </td>
                  {events.map((e) => (
                    <td
                      key={e.id}
                      className="bg-foreground/[0.04] px-2.5 py-3 text-right font-mono text-xs tabular-nums text-foreground/65 border-t border-foreground/10"
                    >
                      {colTotal(e.id) > 0 ? `£${colTotal(e.id).toLocaleString()}` : "—"}
                    </td>
                  ))}
                  <td className="bg-foreground/[0.04] px-2.5 py-3 text-right font-mono text-xs font-semibold tabular-nums text-foreground border-t border-foreground/10 border-l border-foreground/10">
                    {grandTotal > 0 ? `£${grandTotal.toLocaleString()}` : "—"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Summary strip */}
        {budget && (
          <div className="flex gap-7 rounded-lg border border-foreground/10 bg-foreground/[0.02] px-5 py-3.5">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-medium uppercase tracking-wider text-foreground/40">
                Budget
              </span>
              <div className="flex items-center gap-0.5">
                <span className="font-mono text-[15px] font-semibold tabular-nums text-foreground/40">
                  £
                </span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  disabled={readOnly}
                  value={budgetDisplayValue}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  onBlur={saveBudget}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveBudget();
                  }}
                  className="w-24 bg-transparent font-mono text-[15px] font-semibold tabular-nums text-foreground border-b border-foreground/20 focus:border-page-accent/60 focus:outline-none py-0"
                />
              </div>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-medium uppercase tracking-wider text-foreground/40">
                Currently allocated
              </span>
              <span className="font-mono text-[15px] font-semibold tabular-nums text-foreground">
                £{allocated.toLocaleString()}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-medium uppercase tracking-wider text-foreground/40">
                Remaining
              </span>
              <span className="font-mono text-[15px] font-semibold tabular-nums text-foreground">
                £{remaining.toLocaleString()}
              </span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-md bg-foreground/[0.06] border border-foreground/10 px-3 py-1.5 text-xs text-foreground/65 hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={readOnly || bulk.isPending}
            className="rounded-md bg-violet-600/15 border border-violet-600/40 px-3 py-1.5 text-xs text-violet-300 hover:bg-violet-600/25"
          >
            Save
          </button>
        </div>
      </div>

      {/* Discard confirmation */}
      <ConfirmDialog
        isOpen={showDiscard}
        onClose={() => setShowDiscard(false)}
        onConfirm={() => {
          setShowDiscard(false);
          resetCells();
        }}
        title="Discard changes?"
        message="You have unsaved changes. Discard them?"
        confirmText="Discard"
        variant="warning"
      />
    </div>
  );
}
