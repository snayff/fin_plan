import { useGiftsUpcoming } from "@/hooks/useGifts";
import { GhostedListEmpty } from "@/components/ui/GhostedListEmpty";
import { formatCurrency } from "@/utils/format";
import { useSettings } from "@/hooks/useSettings";
import type { GiftUpcomingResponse } from "@finplan/shared";

const MONTH_NAMES = [
  "Dateless",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type Props = { year: number; onNavigateToGifts?: () => void };

export function UpcomingModePanel({ year, onNavigateToGifts }: Props) {
  const { data, isLoading } = useGiftsUpcoming(year);
  const { data: settings } = useSettings();
  const showPence = settings?.showPence ?? false;
  if (isLoading || !data) return <div className="p-6 text-sm text-foreground/40">Loading…</div>;

  const hasRows = data.groups.some((g) => g.rows.length > 0);

  const totalGifts =
    data.callouts.thisMonth.count +
    data.callouts.nextThreeMonths.count +
    data.callouts.restOfYear.count +
    data.callouts.dateless.count;
  const totalPlanned =
    data.callouts.thisMonth.total +
    data.callouts.nextThreeMonths.total +
    data.callouts.restOfYear.total +
    data.callouts.dateless.total;

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 py-3 flex items-center justify-between border-b border-foreground/5">
        <div className="flex items-center gap-3">
          <h2 className="font-heading text-base font-bold text-foreground">Upcoming</h2>
          <span className="text-xs text-foreground/40">
            {totalGifts} {totalGifts === 1 ? "gift" : "gifts"}
          </span>
          <span className="font-numeric text-sm text-page-accent">
            {formatCurrency(totalPlanned, showPence)}
          </span>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        <CalloutGrid callouts={data.callouts} showPence={showPence} />
        {!hasRows ? (
          <div className="mt-6">
            <GhostedListEmpty
              ctaHeading="No upcoming gifts"
              ctaText="Plan gifts for your people to see them here."
              ctaButtonLabel="Go to Gifts"
              onCtaClick={onNavigateToGifts}
            />
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {data.groups.map((g) => (
              <section key={g.month}>
                <h3 className="mb-2 text-[11px] uppercase tracking-wide text-foreground/40">
                  {MONTH_NAMES[g.month]}
                </h3>
                <ul className="space-y-1">
                  {g.rows.length === 0 && (
                    <li className="text-xs text-foreground/30">Nothing scheduled.</li>
                  )}
                  {g.rows.map((row) => (
                    <li
                      key={`${row.eventId}-${row.day ?? "x"}-${row.recipients[0]?.personId ?? ""}`}
                      className="flex items-center justify-between rounded bg-foreground/[0.02] px-3 py-2"
                    >
                      <div>
                        <div className="text-sm text-foreground">
                          {row.eventName}
                          {row.day ? (
                            <span className="ml-1 text-foreground/40">{row.day}</span>
                          ) : null}
                        </div>
                        <div className="text-[11px] text-foreground/50">
                          {row.recipients.map((r) => r.personName).join(", ")}
                        </div>
                      </div>
                      <div className="font-mono text-sm tabular-nums text-foreground/65">
                        {formatCurrency(row.plannedTotal, showPence)}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CalloutGrid({
  callouts,
  showPence,
}: {
  callouts: GiftUpcomingResponse["callouts"];
  showPence: boolean;
}) {
  const cards: { id: keyof GiftUpcomingResponse["callouts"]; label: string }[] = [
    { id: "thisMonth", label: "This month" },
    { id: "nextThreeMonths", label: "Next 3 months" },
    { id: "restOfYear", label: "Rest of year" },
    { id: "dateless", label: "Dateless" },
  ];
  return (
    <div className="grid grid-cols-4 gap-3">
      {cards.map((c) => (
        <div
          key={c.id}
          data-testid={`callout-${c.id}`}
          className="rounded border border-foreground/5 bg-foreground/[0.02] p-3"
        >
          <div className="text-[10px] uppercase tracking-wide text-foreground/40">{c.label}</div>
          <div className="font-mono text-base tabular-nums text-foreground">
            {formatCurrency(callouts[c.id].total, showPence)}
          </div>
          <div className="text-[10px] text-foreground/40">
            {callouts[c.id].count} {callouts[c.id].count === 1 ? "gift" : "gifts"}
          </div>
        </div>
      ))}
    </div>
  );
}
