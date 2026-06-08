// Waterfall-specific component patterns for the renew design system.
// These components are unique to finplan and have no equivalent in the legacy app.
import { PatternSection } from "./PatternSection";
import { PatternExample } from "./PatternExample";

// ---------------------------------------------------------------------------
// Mini component implementations for demonstration purposes.
// These are visual-only demos — not the real app components.
// ---------------------------------------------------------------------------

function DemoWaterfallTierRow({
  name,
  total,
  color,
  selected = false,
  staleBadge,
  shortfall = false,
  isSurplus = false,
}: {
  name: string;
  total: string;
  color: string;
  selected?: boolean;
  staleBadge?: string;
  shortfall?: boolean;
  isSurplus?: boolean;
}) {
  return (
    <div
      className={`
        flex items-center justify-between px-3 py-2 rounded-sm cursor-pointer transition-colors border-l-2
        ${selected ? "" : "border-transparent"}
      `}
      style={{
        borderLeftColor: selected ? color : undefined,
        backgroundColor: selected ? `color-mix(in srgb, ${color} 14%, transparent)` : undefined,
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className={`font-heading font-extrabold uppercase tracking-tier ${isSurplus ? "text-base" : "text-sm"}`}
          style={{ color }}
        >
          {name}
        </span>
        {staleBadge && (
          <span className="flex items-center gap-1 text-attention">
            <span
              className="rounded-full bg-attention shrink-0"
              style={{ width: "5px", height: "5px" }}
            />
            <span className="text-xs">{staleBadge}</span>
          </span>
        )}
        {shortfall && (
          <span className="flex items-center gap-1 text-attention">
            <span
              className="rounded-full bg-attention shrink-0"
              style={{ width: "5px", height: "5px" }}
            />
            <span className="text-xs">shortfall</span>
          </span>
        )}
      </div>
      <span
        className={`font-numeric font-semibold tabular-nums ${isSurplus ? "text-xl font-bold" : "text-sm"}`}
        style={{ color: isSurplus ? color : undefined }}
      >
        {total}
      </span>
    </div>
  );
}

function DemoWaterfallConnector({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 pl-4 py-0.5">
      <div className="flex flex-col items-center">
        <div className="w-px h-2 bg-border" />
      </div>
      <span className="text-xs text-text-muted font-body">→ {label}</span>
    </div>
  );
}

function DemoStalenessIndicator({ variant }: { variant: "dot" | "detail" }) {
  if (variant === "dot") {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span
          className="rounded-full bg-attention inline-block shrink-0"
          style={{ width: "5px", height: "5px" }}
          title="Last reviewed: 14 months ago"
        />
        <span className="font-body font-medium text-text-secondary">Josh Salary</span>
        <span className="font-body text-attention" style={{ fontSize: "9px" }}>
          14mo ago
        </span>
        <span className="font-numeric text-sm tabular-nums text-text-secondary ml-auto">
          £5,148
        </span>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <p className="text-3xl font-extrabold font-numeric text-tier-income tabular-nums">£5,148</p>
      <p className="text-xs font-body text-text-tertiary">Last reviewed: 14 months ago</p>
    </div>
  );
}

function DemoButtonPair({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex gap-2">
      <button className="px-4 py-2 text-sm font-heading font-bold rounded-md bg-surface-elevated text-text-secondary hover:brightness-110 transition-colors">
        {left}
      </button>
      <button className="px-4 py-2 text-sm font-heading font-bold rounded-md bg-primary text-white hover:bg-primary-hover transition-colors">
        {right}
      </button>
    </div>
  );
}

function DemoNudgeCard({ title, text, link }: { title?: string; text: string; link?: string }) {
  return (
    <div className="p-3 rounded-md bg-attention-bg border border-attention-border text-sm space-y-1.5">
      <div className="flex items-center gap-2">
        <span
          className="rounded-full bg-attention shrink-0"
          style={{ width: "5px", height: "5px" }}
        />
        {title && <span className="font-heading font-bold text-foreground">{title}</span>}
      </div>
      <p className="text-text-secondary font-body">{text}</p>
      {link && (
        <a href="#" className="text-xs text-page-accent hover:underline">
          {link} →
        </a>
      )}
    </div>
  );
}

function DemoTimelineNavigator() {
  const dots = [
    { label: "Jan 2025 Review", filled: false },
    { label: "Apr 2025 Review", filled: false },
    { label: "Jan 2026 Review", filled: true },
  ];
  return (
    <div className="flex items-center gap-3 py-1 px-1">
      <button className="text-text-tertiary hover:text-foreground text-xs">◂</button>
      {dots.map((dot, i) => (
        <div key={i} className="flex flex-col items-center gap-0.5 group cursor-pointer">
          <div
            className={`w-2.5 h-2.5 rounded-full border ${
              dot.filled
                ? "bg-primary border-primary"
                : "border-text-tertiary group-hover:border-primary"
            }`}
            title={dot.label}
          />
          <span className="text-xs text-text-tertiary hidden group-hover:block absolute mt-4 bg-card border border-border px-2 py-1 rounded whitespace-nowrap z-10">
            {dot.label}
          </span>
        </div>
      ))}
      <span className="text-xs text-text-tertiary ml-1">Now</span>
      <button className="text-text-tertiary hover:text-foreground text-xs">▸</button>
    </div>
  );
}

export function WaterfallPatterns() {
  return (
    <div className="space-y-12">
      <div>
        <h2 className="text-2xl font-heading font-bold text-foreground mb-2">Waterfall</h2>
        <p className="text-sm text-text-secondary">
          Components unique to the finplan waterfall mental model. The waterfall is the identity of
          the app — these components are the primary visual language.
        </p>
      </div>

      <PatternSection
        id="waterfall-tier-row"
        title="WaterfallTierRow"
        description="Used in the left panel of the Overview page. One row per waterfall tier — tier name, total, and optional badges. The left panel shows tier summaries only; individual items appear in the right panel when a tier is selected."
        useWhen={[
          "Left panel — one per waterfall tier (Income, Committed, Discretionary, Surplus)",
          "Showing aggregate tier totals and staleness counts",
        ]}
        avoidWhen={[
          "Individual item rows — use ItemRow in the right panel instead",
          "Non-waterfall pages — Wealth and Planner have different left panel content",
        ]}
      >
        <PatternExample label="All four states">
          <div className="space-y-0.5 w-64">
            <DemoWaterfallTierRow name="Income" total="£8,856" color="hsl(var(--tier-income))" />
            <DemoWaterfallConnector label="minus committed spend" />
            <DemoWaterfallTierRow
              name="Committed Spend"
              total="£4,817"
              color="hsl(var(--tier-committed))"
              selected
              staleBadge="3 stale"
            />
            <DemoWaterfallConnector label="minus discretionary" />
            <DemoWaterfallTierRow
              name="Discretionary"
              total="£3,830"
              color="hsl(var(--tier-discretionary))"
            />
            <div className="border-t border-border mt-1 pt-1">
              <DemoWaterfallTierRow
                name="Surplus"
                total="£209 · 2.4%"
                color="hsl(var(--tier-surplus))"
                isSurplus
              />
            </div>
          </div>
        </PatternExample>

        <div className="grid grid-cols-2 gap-4">
          <PatternExample label="Selected state (left border + surface highlight)">
            <div className="w-56">
              <DemoWaterfallTierRow
                name="Committed Spend"
                total="£4,817"
                color="hsl(var(--tier-committed))"
                selected
              />
            </div>
          </PatternExample>
          <PatternExample label="Stale badge (amber — informational only)">
            <div className="w-56">
              <DemoWaterfallTierRow
                name="Committed Spend"
                total="£4,817"
                color="hsl(var(--tier-committed))"
                staleBadge="3 stale"
              />
            </div>
          </PatternExample>
          <PatternExample label="Shortfall indicator (Committed only, when cashflow projects a gap)">
            <div className="w-56">
              <DemoWaterfallTierRow
                name="Committed Spend"
                total="£4,817"
                color="hsl(var(--tier-committed))"
                shortfall
              />
            </div>
          </PatternExample>
          <PatternExample label="Surplus row — absolute + percentage, bold + 2xl">
            <div className="w-56">
              <DemoWaterfallTierRow
                name="Surplus"
                total="£209 · 2.4%"
                color="hsl(var(--tier-surplus))"
                isSurplus
              />
            </div>
          </PatternExample>
        </div>
      </PatternSection>

      <PatternSection
        id="waterfall-connector"
        title="WaterfallConnector"
        description="The cascade element between tier rows. Structural, not decorative — it communicates the waterfall mental model. Must not draw the eye: muted colour, xs text, no animation."
        useWhen={["Between every adjacent pair of WaterfallTierRow components in the left panel"]}
        avoidWhen={["In the right panel", "Outside the Overview left panel waterfall"]}
      >
        <PatternExample>
          <div className="space-y-0 w-48 text-sm">
            <div
              className="px-3 py-1 font-heading font-extrabold uppercase text-xs tracking-tier"
              style={{ color: "hsl(var(--tier-income))" }}
            >
              INCOME &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; £8,856
            </div>
            <DemoWaterfallConnector label="minus committed spend" />
            <div
              className="px-3 py-1 font-heading font-extrabold uppercase text-xs tracking-tier"
              style={{ color: "hsl(var(--tier-committed))" }}
            >
              COMMITTED &nbsp;&nbsp;&nbsp; £4,817
            </div>
            <DemoWaterfallConnector label="minus discretionary" />
            <div
              className="px-3 py-1 font-heading font-extrabold uppercase text-xs tracking-tier"
              style={{ color: "hsl(var(--tier-discretionary))" }}
            >
              DISCRETIONARY £3,830
            </div>
            <div className="px-3 py-0.5 border-t border-border mt-0.5">
              <span className="text-xs text-text-muted font-body">= equals</span>
            </div>
            <div
              className="px-3 py-1 font-heading font-bold text-base tracking-tier uppercase"
              style={{ color: "hsl(var(--tier-surplus))" }}
            >
              SURPLUS &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; £209
            </div>
          </div>
        </PatternExample>
      </PatternSection>

      <PatternSection
        id="staleness-indicator"
        title="StalenessIndicator"
        description="Communicates that a value hasn't been reviewed within its threshold. Informational only — never blocks action. Never red. Absent when current (silence = approval)."
        useWhen={[
          "dot: inline in right panel item list rows (ItemRow) when item is stale",
          "detail text: right panel detail view (State 3), below the headline value",
        ]}
        avoidWhen={[
          "In the left panel — staleness is signalled only via the aggregate count badge on WaterfallTierRow",
          "Using red or destructive palette — staleness is not an error",
        ]}
      >
        <div className="grid grid-cols-2 gap-4">
          <PatternExample label="Row level — 5px amber dot before label, age text after label at 9px">
            <DemoStalenessIndicator variant="dot" />
            <p className="text-xs text-text-tertiary mt-2">
              Dot before label, amber age text after. Hover dot: "Last reviewed: 14 months ago"
            </p>
          </PatternExample>
          <PatternExample label="Detail view — expanded text below headline value">
            <DemoStalenessIndicator variant="detail" />
          </PatternExample>
        </div>
      </PatternSection>

      <PatternSection
        id="button-pair"
        title="ButtonPair"
        description="The standard confirm/edit pattern throughout the app. The rightmost button is always the affirmative action. No exceptions."
        useWhen={[
          "Right panel detail view (State 3): [ Edit ] [ Still correct ✓ ]",
          "Review Wizard item cards: [ Update ] [ Still correct ✓ ]",
          "Any form: [ Cancel ] [ Save ]",
          "Any wizard step: [ Back ] [ Confirm ]",
        ]}
        avoidWhen={[
          "Reversing the order — affirmative must always be rightmost",
          "Using more than two buttons in the pair",
        ]}
      >
        <div className="space-y-4">
          <PatternExample label="Detail view — rightmost is affirmative (still correct)">
            <DemoButtonPair left="Edit" right="Still correct ✓" />
          </PatternExample>
          <PatternExample label="Review wizard — after stale item is updated">
            <DemoButtonPair left="Update" right="Still correct ✓" />
          </PatternExample>
          <PatternExample label="Form — rightmost is Save">
            <DemoButtonPair left="Cancel" right="Save" />
          </PatternExample>
          <PatternExample label="Wizard step — rightmost is Confirm">
            <DemoButtonPair left="Back" right="Confirm" />
          </PatternExample>
          <PatternExample type="avoid" label="✗ Wrong — affirmative on left">
            <DemoButtonPair left="Still correct ✓" right="Edit" />
          </PatternExample>
        </div>
      </PatternSection>

      <PatternSection
        id="nudge-card"
        title="NudgeCard"
        description="A contextual, non-advisory prompt in the right panel. Surfaces arithmetic and mechanical options — never recommendations. One at a time. Absent when no opportunity exists."
        useWhen={[
          "Right panel only — below the ButtonPair in State 3 (item detail)",
          "When a mechanical action or observation is available for the selected item",
        ]}
        avoidWhen={[
          "In the left panel",
          "Stacking multiple nudges — one at a time only",
          "Recommending a course of action — arithmetic and options only",
        ]}
      >
        <div className="space-y-4">
          <PatternExample type="correct" label="✓ Arithmetic + options — non-advisory">
            <DemoNudgeCard
              text="Redirecting £50/mo to Zopa (7.10%) could earn ~£230 more per year."
              link="See savings accounts"
            />
          </PatternExample>
          <PatternExample type="correct" label="✓ Informational — remaining allowance + deadline">
            <DemoNudgeCard
              text="Your ISA allowance has £11,600 remaining before April."
              link="See ISA accounts"
            />
          </PatternExample>
          <PatternExample type="avoid" label="✗ Recommendation — not acceptable">
            <DemoNudgeCard text="You should move your savings to Zopa for a better rate." />
          </PatternExample>
        </div>
      </PatternSection>

      <PatternSection
        id="timeline-navigator"
        title="TimelineNavigator"
        description="A row of snapshot dots above the two-panel area on the Overview page. Clicking a dot loads that snapshot in read-only mode."
        useWhen={[
          "Overview page only — above the left + right panels",
          "When at least one snapshot exists",
        ]}
        avoidWhen={[
          "Other pages",
          "When viewing a snapshot — replaced by SnapshotBanner in that state",
        ]}
      >
        <PatternExample label="Snapshot dots — hover to see name, click to load read-only view">
          <DemoTimelineNavigator />
        </PatternExample>
      </PatternSection>
    </div>
  );
}
