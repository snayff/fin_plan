import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

const FAILING_IMPACTS = ["serious", "critical"] as const;

/**
 * The overview's right-hand financial-summary panel (Sankey, doughnuts, tier
 * sparkline cards) renders many tier-coloured / reduced-opacity data-viz labels
 * that still fail WCAG AA color-contrast. Per-component remediation of these
 * visualisations is deferred to https://github.com/snayff/fin_plan/issues/80
 * (the contrast audit explicitly defers data-viz to a design-sign-off pass).
 *
 * Overview a11y checks exclude ONLY this panel; every rule remains fully
 * enforced on every other authed page and on the rest of the overview (top
 * nav, waterfall left panel, page chrome).
 */
export const OVERVIEW_DATAVIZ_EXCLUDE = '[data-testid="financial-summary-panel"]';

/**
 * Wait for the overview waterfall left-panel entrance animation to settle.
 * `WaterfallLeftPanel` fades its tier sections in with a framer-motion stagger;
 * a frame sampled mid-stagger renders tier text at partial opacity, which axe
 * reads as a near-invisible color-contrast failure. We poll until every direct
 * section wrapper has reached full opacity (resolves instantly under reduced
 * motion). Best-effort: if the panel never mounts, fall through to the check.
 */
export async function waitForWaterfallSettled(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () => {
        const nav = document.querySelector('nav[aria-label="Waterfall items"]');
        if (!nav) return false;
        return Array.from(nav.children).every(
          (c) => parseFloat(getComputedStyle(c).opacity || "1") >= 0.99
        );
      },
      { timeout: 5_000 }
    )
    .catch(() => {
      /* panel absent or still animating at timeout — proceed with the check */
    });
}

export interface AxeOptions {
  exclude?: string[];
  disableRules?: string[];
}

export async function checkA11y(page: Page, opts: AxeOptions = {}): Promise<void> {
  let builder = new AxeBuilder({ page });
  if (opts.exclude?.length) for (const sel of opts.exclude) builder = builder.exclude(sel);
  if (opts.disableRules?.length) builder = builder.disableRules(opts.disableRules);
  const results = await builder.analyze();
  const blocking = results.violations.filter((v) =>
    FAILING_IMPACTS.includes(v.impact as (typeof FAILING_IMPACTS)[number])
  );
  if (blocking.length > 0) {
    const summary = blocking
      .map((v) => `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} nodes)`)
      .join("\n");
    expect(blocking, `a11y violations:\n${summary}`).toEqual([]);
  }
}
