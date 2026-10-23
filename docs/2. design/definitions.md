# finplan — Definitions

> This is the canonical reference for all tooltip text in finplan. When a term in the UI has a specific financial meaning — or a specific meaning within finplan — a tooltip is surfaced on hover. The text here is the authoritative source for those tooltips; it should be copied verbatim into implementation. Consult this document when writing or reviewing any UI copy involving financial terms or icon-only elements.
>
> Format per entry: the term as it appears in the UI, the contexts where the tooltip applies, and the tooltip text itself (1–2 sentences, plain English).

---

## Waterfall

**Appears in**: Overview page header, Waterfall Creation Wizard introduction, empty state

**Tooltip**: The way finplan structures your finances — income at the top, committed spend deducted first, then discretionary spend, leaving your surplus at the bottom. Think of money flowing downwards through each layer.

---

## Cashflow

**Appears in**: Forecast page, Cashflow section header

**Tooltip**: A month-by-month projection of your bank balance — starting from today's balance in your linked accounts, then adding income and subtracting committed and discretionary spend for each future month. It shows when money arrives and leaves, not just monthly totals.

---

## Committed Spend

**Appears in**: Overview waterfall (section label), Review Wizard step header, Waterfall Creation Wizard

**Tooltip**: Money you've contracted or obligated yourself to pay — outgoings you can't immediately choose to stop, such as your mortgage, phone contract, or annual insurance.

---

## Discretionary Spend

**Appears in**: Overview waterfall (section label), Review Wizard step header, Waterfall Creation Wizard

**Tooltip**: Spending you choose to make each month and could choose to reduce or stop — for example, your food budget, petrol, or subscriptions you could cancel.

---

## Surplus

**Appears in**: Overview waterfall (section label), surplus indicator tooltip, Review Wizard summary

**Tooltip**: What's left after your committed and discretionary spend is deducted from your income. The goal is to keep this positive and allocate it intentionally — to savings or a buffer.

---

## Net Income

**Appears in**: Income source form (amount field label/hint), Waterfall Creation Wizard step 2

**Tooltip**: Your take-home pay after tax, National Insurance, and any other deductions — what actually arrives in your account. finplan works with net figures only.

---

## One-Off Income

**Appears in**: Income source frequency selector, income source badge in the waterfall

**Tooltip**: A single, non-recurring payment — for example, a bonus, an inheritance, or the proceeds from selling an asset. Not included in your monthly waterfall total; shown separately with its expected month.

---

## Annual Income

**Appears in**: Income source frequency selector, ÷12 indicator in the waterfall

**Tooltip**: Income that recurs once a year — for example, an annual bonus. Shown in the waterfall divided by 12 so it contributes a fair monthly share to your plan.

---

## Amortised (÷12)

**Appears in**: Yearly Bills row in the waterfall (÷12 label), Annual Income entries, cashflow calendar header

**Tooltip**: An annual amount spread evenly across 12 months. finplan uses this so your monthly waterfall reflects a fair share of bills or income that don't land every month. Quarterly amounts are divided by 3; weekly amounts are multiplied by 52 ÷ 12 (≈ 4.33).

---

## Inflation Rate

**Appears in**: Settings — Growth rates, Growth chart real-terms values

**Tooltip**: The annual rate at which purchasing power is expected to erode over time. finplan uses this to calculate 'real terms' projections — showing what a future balance would be worth in today's money. Set in Settings → Growth rates.

---

## ISA

**Appears in**: Savings account form (ISA flag), Wealth page account list, ISA allowance bar

**Tooltip**: Individual Savings Account — a UK savings or investment account where interest and gains are free from tax.

---

## ISA Allowance

**Appears in**: Wealth page (Savings section), ISA allowance progress bar label

**Tooltip**: The maximum you can pay into ISAs in a single tax year — currently £20,000 per person. Contributions across all your ISA accounts count towards one shared limit, which resets each year on 6 April.

---

## Tax Year

**Appears in**: ISA allowance bar (deadline label), Settings → ISA tax year

**Tooltip**: The UK tax year runs from 6 April to 5 April the following year. ISA allowances and some tax thresholds reset at this date.

---

## Equity Value

**Appears in**: Property, Vehicles, and Other asset class forms (balance/value field label)

**Tooltip**: The portion of an asset you own outright — the market value minus any outstanding debt secured against it. For example, a property worth £300,000 with a £200,000 mortgage has an equity value of £100,000.

---

## Linked Account

**Appears in**: Cashflow header, Linked Accounts popover

**Tooltip**: A Current or Savings account whose balance is included in your cashflow forecast. The sum of all linked account balances forms the starting balance for the projection. Select which accounts to link in the Cashflow header.

---

## Liquidity

**Appears in**: Wealth page summary (By liquidity breakdown labels)

**Tooltip**: How quickly and easily an asset can be converted to cash. Savings accounts are immediately liquid; pensions and property are not.

---

## Net Worth

**Appears in**: Wealth page headline figure label

**Tooltip**: The total value of everything you own (your assets) minus everything you owe (your liabilities). finplan calculates this from the assets recorded on the Wealth page.

---

## Snapshot

**Appears in**: Timeline navigator (dot labels), snapshot banner, Review Wizard summary, `[+ Save snapshot]` control

**Tooltip**: A saved, read-only record of your waterfall at a specific point in time. Snapshots let you compare how your plan has changed over months or years.

---

## Period

**Appears in**: Amount history sparkline (expanded row), edit mode period list, scheduled change indicator ("→ £9 from Oct")

**Tooltip**: A span of time during which an item has a specific planned amount. An item's amount history is a sequence of periods, each with an effective date and amount. The current period determines the item's active amount; past periods form the historical record; future periods represent scheduled changes.

---

## Subcategory

**Appears in**: Settings page, Tier item groupings, Item forms

**Tooltip**: A user-defined grouping within a tier — for example, Housing or Utilities within Committed Spend. Subcategories help you organise items without affecting the waterfall arithmetic. Manage them in Settings → Subcategories.

---

## Waterfall Tier

**Appears in**: Overview page, Tier pages (Income, Committed, Discretionary, Surplus), Settings — Subcategories

**Tooltip**: One of the four layers of the finplan waterfall: Income, Committed Spend, Discretionary Spend, and Surplus. Subcategories live inside a tier, and items are organised by subcategory within each tier.

---

## Yearly Bill

**Appears in**: Committed page (Yearly Bills grouping), Overview waterfall, Cashflow shortfall indicator

**Tooltip**: A committed outgoing paid once per year — for example, annual insurance or a yearly subscription. Shown in the monthly waterfall as an amortised £/12 share, and flagged in cashflow if the full payment could push a month below zero.

---

## Review

**Appears in**: Review Wizard, item rows (right panel), item detail view

**Tooltip**: A periodic prompt that walks you through confirming whether each item's recorded value is still correct. Completing a Review refreshes an item's staleness and optionally saves a snapshot of your waterfall at that point in time.

---

## Staleness

**Appears in**: Staleness indicator (amber dot tooltip), Review Wizard card header, right panel detail view ("Last reviewed" label)

**Tooltip**: A signal that a value hasn't been reviewed or confirmed within the expected timeframe and may no longer be accurate. Staleness is informational only — it never blocks you from using the app.

---

## Held on Behalf Of

**Appears in**: Wealth page (ring-fenced section label), trust savings account badge

**Tooltip**: Savings managed by your household but legally owned by someone else — for example, a child's Junior ISA. These are tracked separately and excluded from your household net worth.

---

## Projection

**Appears in**: Wealth page account detail (projected balance label), savings account list

**Tooltip**: An estimated future balance calculated from the current value plus the linked monthly contribution, compounded at the recorded interest rate. Projections are illustrative only.

---

## Real Terms

**Appears in**: Growth chart (Net Worth stat row)

**Tooltip**: A value adjusted for inflation — showing what a future amount would be worth in today's purchasing power. If your net worth is projected at £150,000 but £120,000 in real terms, the difference reflects the expected erosion of purchasing power over time.

---

## Disposal Date

**Appears in**: Asset and Account edit forms (Planned disposal section), asset/account row badge, Cashflow event list

**Tooltip**: The date on which you plan to sell or close this asset or account. From this date onward the item is excluded from your forecast and its projected value is added as a one-off inflow to the chosen target account.

---

## Liquidation

**Appears in**: Cashflow event list (event type badge), Forecast page

**Tooltip**: The conversion of an asset or account to cash on its disposal date. finplan projects the item's value up to that date using its growth rate, then transfers the proceeds to the account you selected.

---

# Functional Icon Tooltips

> These tooltips appear on hover over icon-only UI elements — icons that carry meaning but are not accompanied by visible label text. They explain what tapping or clicking the icon does (or what it represents), in plain English.

---

## Staleness Indicator (amber dot ●)

**Appears in**: Item rows in the right panel (5px amber dot before the label + amber detail text), right panel detail view

**Tooltip**: This value hasn't been reviewed recently — it may no longer be accurate. Click to open the item and confirm it.

---

## Still Correct (checkmark confirm button)

**Appears in**: `ButtonPair` in the right panel detail view, Review Wizard item card

**Tooltip**: Confirm this value is still accurate. Updates the last-reviewed date to today without changing the value.

---

## Snapshot Dot (timeline navigator)

**Appears in**: Timeline navigator above the Overview waterfall

**Tooltip**: [snapshot name] — [date]. Click to view your waterfall as it was on this date (read-only).

_Note: the tooltip is dynamic — it shows the actual snapshot name and date on hover._

---

## Savings ↔ Waterfall Link Icon

**Appears in**: Wealth page savings account row, waterfall discretionary savings row

**Tooltip**: This savings account is linked to a waterfall allocation. Contributions from your plan are used for projections on this account.

---

## Surplus Benchmark

**Appears in**: Settings page, Surplus page benchmark warning

**Tooltip**: The minimum surplus percentage you're aiming for — typically 10% of net income. When your surplus falls below this threshold, an amber nudge appears on the Surplus page. Adjust the benchmark in Settings → Surplus benchmark.

---

## Surplus Percentage

**Appears in**: Surplus row in the waterfall left panel (alongside the absolute figure)

**Tooltip**: Your surplus as a percentage of your total net income. A common benchmark is 10% or above, though the right level depends on your circumstances.

---

## Tightest Dip

**Appears in**: Cashflow year view headline cards

**Tooltip**: The lowest projected bank balance across your cashflow forecast window. If this figure is negative, it means your balance is projected to go below zero in that month — a signal to review upcoming outgoings or move funds.

---

## Yearly Bill Cashflow Shortfall Indicator

**Appears in**: Committed Spend tier row (left panel), when a cashflow shortfall is projected

**Tooltip**: One or more yearly bills may not be fully covered in their due month. Open Committed Spend to see the cashflow calendar.

---

## Held on Behalf Of Badge

**Appears in**: Wealth page trust savings section (account row badge)

**Tooltip**: This account is managed by your household but is owned by [name]. It is excluded from your household net worth.

---

# Gift Planner

---

## Annual Budget (Gifts)

**Appears in**: Gift planner left aside, budget summary

**Tooltip**: The total amount set aside for gift-giving this year. In Synced mode this flows into the waterfall as a Discretionary item; in Independent mode it is tracked here only.

---

## Planned (Gifts)

**Appears in**: Gift planner budget summary, allocation cards

**Tooltip**: The sum of all planned gift amounts across every person and event this year. Compare against your annual budget to see whether your plan fits.

---

## Spent (Gifts)

**Appears in**: Gift planner budget summary, allocation cards

**Tooltip**: The sum of amounts actually spent on gifts so far this year.

---

## Synced Mode

**Appears in**: Config → Mode panel

**Tooltip**: The gift planner creates and manages a "Gifts" item in your Discretionary waterfall tier. Your annual gift budget is deducted from your surplus automatically.

---

## Independent Mode

**Appears in**: Config → Mode panel

**Tooltip**: The gift planner runs standalone with no connection to your waterfall. Useful if you track gifts separately or haven't set up a waterfall yet.

---

## Locked Event

**Appears in**: Config → Events panel

**Tooltip**: A built-in event (like Birthday or Christmas) that cannot be renamed or deleted. You can still choose not to plan gifts for it.

---

## Personal Date Type

**Appears in**: Config → Events panel, Add Event form

**Tooltip**: The date differs for each person — for example, each person has their own birthday. To set it, open the person under Gifts → People and enter the day and month on that event's card.

---

## Shared Date Type

**Appears in**: Config → Events panel, Add Event form

**Tooltip**: The same date for everyone — for example, Christmas is always 25 December regardless of the recipient.

---

## Monthly contribution limit

**Appears in**: Account form (Savings), Account detail panel

**Tooltip**: The most this account lets you pay in each month. finplan uses this to flag spare capacity and surface higher-rate alternatives among your other savings accounts.
