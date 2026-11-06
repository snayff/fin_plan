// Renew form patterns — input states, progressive disclosure, inline edit transform
import { PatternSection } from "./PatternSection";
import { PatternExample } from "./PatternExample";

function DemoInput({
  label,
  value,
  state,
  message,
}: {
  label: string;
  value?: string;
  state: "default" | "focused" | "error" | "warning" | "disabled" | "success";
  message?: string;
}) {
  const borderClass = {
    default: "border-border",
    focused: "border-primary ring-2 ring-primary/20",
    error: "border-destructive ring-2 ring-destructive/20",
    warning: "border-attention ring-2 ring-attention/20",
    disabled: "border-border opacity-50",
    success: "border-success ring-2 ring-success/20",
  }[state];

  const messageClass = {
    default: "text-text-tertiary",
    focused: "text-text-tertiary",
    error: "text-destructive",
    warning: "text-attention",
    disabled: "text-text-tertiary",
    success: "text-success",
  }[state];

  return (
    <div className="space-y-1">
      <label className="text-sm text-text-secondary block">{label}</label>
      <input
        aria-label={label}
        className={`w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none ${borderClass}`}
        value={value ?? ""}
        placeholder={value ? undefined : "Enter value..."}
        disabled={state === "disabled"}
        readOnly
      />
      {message && <p className={`text-xs ${messageClass}`}>{message}</p>}
    </div>
  );
}

export function FormRenewPatterns() {
  return (
    <div className="space-y-12">
      <div>
        <h2 className="text-2xl font-heading font-bold text-foreground mb-2">Forms</h2>
        <p className="text-sm text-text-secondary">
          Form patterns: input states, progressive disclosure, and the inline edit transform.
        </p>
      </div>

      <PatternSection
        id="input-states"
        title="Input states"
        description="All form inputs provide six states. Error uses destructive (red), warning uses attention (amber), success uses success (green) — consistent with the colour signal rules."
        useWhen={[
          "error: failed validation — genuine problem",
          "warning: value is valid but outside expected range (e.g. unusually large salary)",
          "success: inline validation passed",
        ]}
        avoidWhen={[
          "Using error state for staleness or informational warnings — those use amber (attention)",
          "Using warning for errors — reserve red for genuine problems",
        ]}
      >
        <div className="grid grid-cols-2 gap-6 max-w-xl">
          <DemoInput label="Unselected (default)" value="£5,148" state="default" />
          <DemoInput
            label="Focused"
            value="£5,148"
            state="focused"
            message="Keyboard focus or click"
          />
          <DemoInput
            label="Error"
            value="not a number"
            state="error"
            message="Please enter a valid amount"
          />
          <DemoInput
            label="Warning"
            value="£98,000"
            state="warning"
            message="This is higher than typical — double-check it's correct"
          />
          <DemoInput
            label="Disabled"
            value="£5,148"
            state="disabled"
            message="Read-only or locked"
          />
          <DemoInput label="Success / valid" value="£5,148" state="success" message="Looks good" />
        </div>
      </PatternSection>

      <PatternSection
        id="progressive-disclosure"
        title="Progressive disclosure"
        description="Forms show only mandatory fields by default. Optional fields are hidden behind a clearly labelled reveal. Exception: if an optional field already has data, it is always shown — never hide a user's own data."
        useWhen={[
          "All add/edit forms in the waterfall, wizards, Wealth page, and Planner",
          "When a form has 2+ optional fields with no existing data",
        ]}
        avoidWhen={[
          "Hiding mandatory fields behind a reveal — those are always visible",
          "Hiding optional fields that already have user-entered data",
        ]}
      >
        <div className="space-y-4 max-w-sm">
          <PatternExample label="Mandatory fields visible, optional hidden">
            <div className="space-y-3">
              <DemoInput label="Name *" value="British Gas" state="default" />
              <DemoInput label="Amount *" value="£122" state="default" />
              <button className="text-sm text-page-accent hover:underline text-left">
                + More options
              </button>
            </div>
          </PatternExample>
          <PatternExample label="Optional fields revealed — user clicked '+ More options'">
            <div className="space-y-3">
              <DemoInput label="Name *" value="British Gas" state="default" />
              <DemoInput label="Amount *" value="£122" state="default" />
              <button className="text-sm text-page-accent hover:underline text-left">
                + More options
              </button>
              <div className="border-l-2 border-border pl-3 space-y-3">
                <DemoInput label="Notes (optional)" state="default" />
                <DemoInput label="Category tag (optional)" state="default" />
              </div>
            </div>
          </PatternExample>
        </div>
      </PatternSection>

      <PatternSection
        id="inline-edit-transform"
        title="Inline edit transform"
        description="When the user clicks [ Edit ] in the right panel detail view, the form opens in place — the detail view converts to an edit form. No navigation occurs. The breadcrumb does not change."
        useWhen={["Right panel detail view (State 3) — clicking [ Edit ] on any item"]}
        avoidWhen={[
          "Opening a modal for editing — inline is always preferred",
          "Navigating to a new depth level — edit happens in-situ, breadcrumb stays the same",
        ]}
      >
        <div className="grid grid-cols-2 gap-4">
          <PatternExample label="Before — detail view">
            <div className="space-y-2 text-sm">
              <p className="text-xs text-text-tertiary">← Committed / British Gas</p>
              <p className="text-3xl font-semibold font-mono text-tier-income tabular-nums">£122</p>
              <p className="text-xs text-text-tertiary">per month · Last reviewed: Jan 2026</p>
              <div className="h-12 bg-background rounded border border-border flex items-center justify-center text-xs text-text-tertiary">
                [sparkline]
              </div>
              <div className="flex gap-2 pt-1">
                <button className="px-3 py-1.5 text-xs rounded border border-border text-foreground">
                  Edit
                </button>
                <button className="px-3 py-1.5 text-xs rounded bg-primary text-white">
                  Still correct ✓
                </button>
              </div>
            </div>
          </PatternExample>
          <PatternExample label="After clicking Edit — form in same position, same breadcrumb">
            <div className="space-y-3 text-sm">
              <p className="text-xs text-text-tertiary">← Committed / British Gas</p>
              <DemoInput label="Name" value="British Gas" state="focused" />
              <DemoInput label="Amount (£/mo)" value="122" state="default" />
              <button className="text-xs text-page-accent hover:underline">+ More options</button>
              <div className="flex gap-2 pt-1">
                <button className="px-3 py-1.5 text-xs rounded border border-border text-foreground">
                  Cancel
                </button>
                <button className="px-3 py-1.5 text-xs rounded bg-primary text-white">Save</button>
              </div>
            </div>
          </PatternExample>
        </div>
      </PatternSection>
    </div>
  );
}
