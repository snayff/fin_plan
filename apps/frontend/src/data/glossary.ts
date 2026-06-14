export type GlossaryTag = "financial" | "finplan";

export interface GlossaryEntry {
  id: string;
  term: string;
  definition: string;
  tag: GlossaryTag;
  relatedConceptIds: string[];
  relatedTermIds: string[];
  appearsIn: string[];
}

// Canonical definitions from docs/2. design/definitions.md — verbatim
// Sorted alphabetically by term (enforced by tests)
export const GLOSSARY_ENTRIES: GlossaryEntry[] = [
  {
    id: "amortised",
    term: "Amortised (÷12)",
    definition:
      "An annual amount spread evenly across 12 months. finplan uses this so your monthly waterfall reflects a fair share of bills or income that don't land every month. Quarterly amounts are divided by 3; weekly amounts are multiplied by 52 ÷ 12 (≈ 4.33).",
    tag: "financial",
    relatedConceptIds: ["amortisation"],
    relatedTermIds: ["annual-income", "yearly-bill"],
    appearsIn: ["Committed Spend waterfall", "Annual Income entries", "Cashflow calendar"],
  },
  {
    id: "gifts-annual-budget",
    term: "Annual Budget (Gifts)",
    definition:
      "The total amount set aside for gift-giving this year. In Synced mode this flows into the waterfall as a Discretionary item; in Independent mode it is tracked here only.",
    tag: "finplan",
    relatedConceptIds: ["waterfall"],
    relatedTermIds: ["discretionary-spend", "surplus"],
    appearsIn: ["Gift planner left aside", "Budget summary"],
  },
  {
    id: "annual-income",
    term: "Annual Income",
    definition:
      "Income that recurs once a year — for example, an annual bonus. Shown in the waterfall divided by 12 so it contributes a fair monthly share to your plan.",
    tag: "financial",
    relatedConceptIds: ["waterfall"],
    relatedTermIds: ["amortised", "net-income"],
    appearsIn: ["Income page", "Overview waterfall"],
  },
  {
    id: "cashflow",
    term: "Cashflow",
    definition:
      "A month-by-month projection of your bank balance — starting from today's balance in your linked accounts, then adding income and subtracting committed and discretionary spend for each future month. It shows when money arrives and leaves, not just monthly totals.",
    tag: "finplan",
    relatedConceptIds: ["cashflow-forecasting"],
    relatedTermIds: ["linked-account", "surplus", "committed-spend"],
    appearsIn: ["Forecast page", "Cashflow section header"],
  },
  {
    id: "committed-spend",
    term: "Committed Spend",
    definition:
      "Money you've contracted or obligated yourself to pay — outgoings you can't immediately choose to stop, such as your mortgage, phone contract, or annual insurance.",
    tag: "financial",
    relatedConceptIds: ["waterfall"],
    relatedTermIds: ["discretionary-spend", "surplus"],
    appearsIn: ["Overview waterfall", "Committed page"],
  },
  {
    id: "discretionary-spend",
    term: "Discretionary Spend",
    definition:
      "Spending you choose to make each month and could choose to reduce or stop — for example, your food budget, petrol, or subscriptions you could cancel.",
    tag: "financial",
    relatedConceptIds: ["waterfall"],
    relatedTermIds: ["committed-spend", "surplus"],
    appearsIn: ["Overview waterfall", "Discretionary page"],
  },
  {
    id: "equity-value",
    term: "Equity Value",
    definition:
      "The portion of an asset you own outright — the market value minus any outstanding debt secured against it. For example, a property worth £300,000 with a £200,000 mortgage has an equity value of £100,000.",
    tag: "financial",
    relatedConceptIds: ["net-worth"],
    relatedTermIds: ["net-worth", "liquidity"],
    appearsIn: ["Wealth page"],
  },
  {
    id: "held-on-behalf-of",
    term: "Held on Behalf Of",
    definition:
      "Savings managed by your household but legally owned by someone else — for example, a child's Junior ISA. These are tracked separately and excluded from your household net worth.",
    tag: "finplan",
    relatedConceptIds: ["net-worth", "isa-allowances"],
    relatedTermIds: ["net-worth", "isa"],
    appearsIn: ["Wealth page"],
  },
  {
    id: "gifts-independent-mode",
    term: "Independent Mode",
    definition:
      "The gift planner runs standalone with no connection to your waterfall. Useful if you track gifts separately or haven't set up a waterfall yet.",
    tag: "finplan",
    relatedConceptIds: [],
    relatedTermIds: ["gifts-synced-mode"],
    appearsIn: ["Config — Mode panel"],
  },
  {
    id: "inflation-rate",
    term: "Inflation Rate",
    definition:
      "The annual rate at which purchasing power is expected to erode over time. finplan uses this to calculate 'real terms' projections — showing what a future balance would be worth in today's money. Set in Settings → Growth rates.",
    tag: "financial",
    relatedConceptIds: ["compound-interest"],
    relatedTermIds: ["real-terms", "projection"],
    appearsIn: ["Settings — Growth rates", "Growth chart real-terms values"],
  },
  {
    id: "isa",
    term: "ISA",
    definition:
      "Individual Savings Account — a UK savings or investment account where interest and gains are free from tax.",
    tag: "financial",
    relatedConceptIds: ["isa-allowances"],
    relatedTermIds: ["isa-allowance", "tax-year"],
    appearsIn: ["Wealth page"],
  },
  {
    id: "isa-allowance",
    term: "ISA Allowance",
    definition:
      "The maximum you can pay into ISAs in a single tax year — currently £20,000 per person. Contributions across all your ISA accounts count towards one shared limit, which resets each year on 6 April.",
    tag: "financial",
    relatedConceptIds: ["isa-allowances"],
    relatedTermIds: ["isa", "tax-year"],
    appearsIn: ["Wealth page", "ISA allowance progress bar"],
  },
  {
    id: "linked-account",
    term: "Linked Account",
    definition:
      "A Current or Savings account whose balance is included in your cashflow forecast. The sum of all linked account balances forms the starting balance for the projection. Select which accounts to link in the Cashflow header.",
    tag: "finplan",
    relatedConceptIds: ["cashflow-forecasting"],
    relatedTermIds: ["cashflow"],
    appearsIn: ["Cashflow header", "Linked Accounts popover"],
  },
  {
    id: "liquidity",
    term: "Liquidity",
    definition:
      "How quickly and easily an asset can be converted to cash. Savings accounts are immediately liquid; pensions and property are not.",
    tag: "financial",
    relatedConceptIds: ["net-worth"],
    relatedTermIds: ["net-worth", "equity-value"],
    appearsIn: ["Wealth page"],
  },
  {
    id: "gifts-locked-event",
    term: "Locked Event",
    definition:
      "A built-in event (like Birthday or Christmas) that cannot be renamed or deleted. You can still choose not to plan gifts for it.",
    tag: "finplan",
    relatedConceptIds: [],
    relatedTermIds: [],
    appearsIn: ["Config — Events panel"],
  },
  {
    id: "net-income",
    term: "Net Income",
    definition:
      "Your take-home pay after tax, National Insurance, and any other deductions — what actually arrives in your account. finplan works with net figures only.",
    tag: "financial",
    relatedConceptIds: ["waterfall"],
    relatedTermIds: ["annual-income", "one-off-income"],
    appearsIn: ["Income page", "Overview waterfall"],
  },
  {
    id: "net-worth",
    term: "Net Worth",
    definition:
      "The total value of everything you own (your assets) minus everything you owe (your liabilities). finplan calculates this from the assets recorded on the Wealth page, and excludes pensions — they're illiquid, retirement-restricted wealth shown separately in the Forecast.",
    tag: "financial",
    relatedConceptIds: [],
    relatedTermIds: ["equity-value", "liquidity"],
    appearsIn: ["Wealth page"],
  },
  {
    id: "one-off-income",
    term: "One-Off Income",
    definition:
      "A single, non-recurring payment — for example, a bonus, an inheritance, or the proceeds from selling an asset. Not included in your monthly waterfall total; shown separately with its expected month.",
    tag: "financial",
    relatedConceptIds: ["waterfall"],
    relatedTermIds: ["net-income", "annual-income"],
    appearsIn: ["Income page", "Overview waterfall"],
  },
  {
    id: "period",
    term: "Period",
    definition:
      "A span of time during which an item has a specific planned amount. An item's value history is a sequence of periods, each with an effective date and amount. The current period determines the item's active amount; past periods form the historical record; future periods represent scheduled changes.",
    tag: "finplan",
    relatedConceptIds: [],
    relatedTermIds: ["snapshot"],
    appearsIn: ["Value history sparkline", "Edit mode period list"],
  },
  {
    id: "gifts-personal-date",
    term: "Personal Date Type",
    definition:
      "The date differs for each person — for example, each person has their own birthday. You set the date per person in the Gifts tab.",
    tag: "finplan",
    relatedConceptIds: [],
    relatedTermIds: ["gifts-shared-date"],
    appearsIn: ["Config — Events panel", "Add Event form"],
  },
  {
    id: "gifts-planned",
    term: "Planned (Gifts)",
    definition:
      "The sum of all planned gift amounts across every person and event this year. Compare against your annual budget to see whether your plan fits.",
    tag: "finplan",
    relatedConceptIds: [],
    relatedTermIds: ["gifts-annual-budget"],
    appearsIn: ["Gift planner budget summary", "Allocation cards"],
  },
  {
    id: "projection",
    term: "Projection",
    definition:
      "An estimated future balance calculated from the current value plus the linked monthly contribution, compounded at the recorded interest rate. Projections are illustrative only.",
    tag: "financial",
    relatedConceptIds: ["compound-interest"],
    relatedTermIds: ["net-worth"],
    appearsIn: ["Wealth page"],
  },
  {
    id: "real-terms",
    term: "Real Terms",
    definition:
      "A value adjusted for inflation — showing what a future amount would be worth in today's purchasing power. If your net worth is projected at £150,000 but £120,000 in real terms, the difference reflects the expected erosion of purchasing power over time.",
    tag: "financial",
    relatedConceptIds: ["compound-interest"],
    relatedTermIds: ["net-worth", "projection"],
    appearsIn: ["Growth chart"],
  },
  {
    id: "review",
    term: "Review",
    definition:
      "A periodic prompt that walks you through confirming whether each item's recorded value is still correct. Completing a Review refreshes an item's staleness and optionally saves a snapshot of your waterfall at that point in time.",
    tag: "finplan",
    relatedConceptIds: [],
    relatedTermIds: ["staleness", "snapshot"],
    appearsIn: ["Review Wizard", "Item rows"],
  },
  {
    id: "gifts-shared-date",
    term: "Shared Date Type",
    definition:
      "The same date for everyone — for example, Christmas is always 25 December regardless of the recipient.",
    tag: "finplan",
    relatedConceptIds: [],
    relatedTermIds: ["gifts-personal-date"],
    appearsIn: ["Config — Events panel", "Add Event form"],
  },
  {
    id: "snapshot",
    term: "Snapshot",
    definition:
      "A saved, read-only record of your waterfall at a specific point in time. Snapshots let you compare how your plan has changed over months or years.",
    tag: "finplan",
    relatedConceptIds: ["waterfall"],
    relatedTermIds: ["period"],
    appearsIn: ["Overview timeline", "Snapshot banner"],
  },
  {
    id: "gifts-spent",
    term: "Spent (Gifts)",
    definition: "The sum of amounts actually spent on gifts so far this year.",
    tag: "finplan",
    relatedConceptIds: [],
    relatedTermIds: ["gifts-annual-budget", "gifts-planned"],
    appearsIn: ["Gift planner budget summary", "Allocation cards"],
  },
  {
    id: "staleness",
    term: "Staleness",
    definition:
      "A signal that a value hasn't been reviewed or confirmed within the expected timeframe and may no longer be accurate. Staleness is informational only — it never blocks you from using the app.",
    tag: "finplan",
    relatedConceptIds: [],
    relatedTermIds: ["period"],
    appearsIn: ["Item rows", "Review Wizard", "Right panel detail view"],
  },
  {
    id: "subcategory",
    term: "Subcategory",
    definition:
      "A user-defined grouping within a tier — for example, Housing or Utilities within Committed Spend. Subcategories help you organise items without affecting the waterfall arithmetic. Manage them in Settings → Subcategories.",
    tag: "finplan",
    relatedConceptIds: ["waterfall"],
    relatedTermIds: ["tier", "committed-spend", "discretionary-spend"],
    appearsIn: ["Settings page", "Tier item groupings", "Item forms"],
  },
  {
    id: "surplus",
    term: "Surplus",
    definition:
      "What's left after your committed and discretionary spend is deducted from your income. The goal is to keep this positive and allocate it intentionally — to savings or a buffer.",
    tag: "financial",
    relatedConceptIds: ["waterfall"],
    relatedTermIds: ["committed-spend", "discretionary-spend"],
    appearsIn: ["Overview waterfall", "Surplus page"],
  },
  {
    id: "surplus-benchmark",
    term: "Surplus Benchmark",
    definition:
      "The minimum surplus percentage you're aiming for — typically 10% of net income. When your surplus falls below this threshold, an amber nudge appears on the Surplus page. Adjust the benchmark in Settings → Surplus benchmark.",
    tag: "finplan",
    relatedConceptIds: ["waterfall"],
    relatedTermIds: ["surplus", "surplus-percentage", "net-income"],
    appearsIn: ["Settings page", "Surplus page benchmark warning"],
  },
  {
    id: "surplus-percentage",
    term: "Surplus Percentage",
    definition:
      "Your surplus as a percentage of your total net income. A common benchmark is 10% or above, though the right level depends on your circumstances.",
    tag: "financial",
    relatedConceptIds: ["waterfall"],
    relatedTermIds: ["surplus", "net-income"],
    appearsIn: ["Overview waterfall", "Surplus page"],
  },
  {
    id: "gifts-synced-mode",
    term: "Synced Mode",
    definition:
      'The gift planner creates and manages a "Gifts" item in your Discretionary waterfall tier. Your annual gift budget is deducted from your surplus automatically.',
    tag: "finplan",
    relatedConceptIds: ["waterfall"],
    relatedTermIds: ["discretionary-spend", "gifts-annual-budget"],
    appearsIn: ["Config — Mode panel"],
  },
  {
    id: "tax-year",
    term: "Tax Year",
    definition:
      "The UK tax year runs from 6 April to 5 April the following year. ISA allowances and some tax thresholds reset at this date.",
    tag: "financial",
    relatedConceptIds: ["isa-allowances"],
    relatedTermIds: ["isa-allowance"],
    appearsIn: ["ISA allowance bar", "Settings"],
  },
  {
    id: "tightest-dip",
    term: "Tightest Dip",
    definition:
      "The lowest projected bank balance across your cashflow forecast window. If this figure is negative, it means your balance is projected to go below zero in that month — a signal to review upcoming outgoings or move funds.",
    tag: "finplan",
    relatedConceptIds: ["cashflow-forecasting"],
    relatedTermIds: ["cashflow", "linked-account"],
    appearsIn: ["Cashflow year view headline cards"],
  },
  {
    id: "waterfall",
    term: "Waterfall",
    definition:
      "The way finplan structures your finances — income at the top, committed spend deducted first, then discretionary spend, leaving your surplus at the bottom. Think of money flowing downwards through each layer.",
    tag: "finplan",
    relatedConceptIds: [],
    relatedTermIds: ["tier", "committed-spend", "discretionary-spend", "surplus"],
    appearsIn: ["Overview page", "Waterfall Creation Wizard"],
  },
  {
    id: "tier",
    term: "Waterfall Tier",
    definition:
      "One of the four layers of the finplan waterfall: Income, Committed Spend, Discretionary Spend, and Surplus. Subcategories live inside a tier, and items are organised by subcategory within each tier.",
    tag: "finplan",
    relatedConceptIds: ["waterfall"],
    relatedTermIds: ["waterfall", "subcategory", "committed-spend", "discretionary-spend"],
    appearsIn: ["Overview page", "Tier pages", "Settings — Subcategories"],
  },
  {
    id: "yearly-bill",
    term: "Yearly Bill",
    definition:
      "A committed outgoing paid once per year — for example, annual insurance or a yearly subscription. Shown in the monthly waterfall as an amortised £/12 share, and flagged in cashflow if the full payment could push a month below zero.",
    tag: "finplan",
    relatedConceptIds: ["amortisation", "cashflow-forecasting"],
    relatedTermIds: ["amortised", "committed-spend", "cashflow"],
    appearsIn: ["Committed page", "Overview waterfall", "Cashflow shortfall indicator"],
  },
];

export function getGlossaryEntry(id: string): GlossaryEntry | undefined {
  return GLOSSARY_ENTRIES.find((e) => e.id === id);
}
