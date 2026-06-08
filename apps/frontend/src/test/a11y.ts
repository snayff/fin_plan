/**
 * Accessibility test helpers.
 *
 * Uses axe-core directly (bun:test doesn't have a vitest-axe equivalent and
 * happy-dom is fine for axe's DOM analysis). The smoke pass in Phase 5 mounts
 * each in-scope page and asserts `expectNoA11yViolations(container)`.
 */

import axe, { type AxeResults, type RunOptions } from "axe-core";
import { expect } from "bun:test";

/**
 * Run axe against a container element. Throws if any violations are found,
 * with a readable summary of the rules that failed and the offending nodes.
 */
export async function expectNoA11yViolations(
  container: Element,
  options?: RunOptions
): Promise<void> {
  const results: AxeResults = await axe.run(container, options);

  if (results.violations.length === 0) return;

  const summary = results.violations
    .map((v) => {
      const nodes = v.nodes
        .slice(0, 3)
        .map((n) => `    - ${n.target.join(" ")} (${n.failureSummary?.split("\n")[0] ?? ""})`)
        .join("\n");
      const extra = v.nodes.length > 3 ? `\n    … and ${v.nodes.length - 3} more` : "";
      return `  [${v.impact ?? "moderate"}] ${v.id}: ${v.help}\n${nodes}${extra}\n    Help: ${v.helpUrl}`;
    })
    .join("\n\n");

  expect.fail(`Found ${results.violations.length} a11y violation(s):\n\n${summary}\n`);
}
