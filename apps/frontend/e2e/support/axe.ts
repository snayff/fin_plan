import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

const FAILING_IMPACTS = ["serious", "critical"] as const;

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
