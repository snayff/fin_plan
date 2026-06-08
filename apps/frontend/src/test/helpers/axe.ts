import { axe } from "jest-axe";
import type { AxeResults, Result } from "jest-axe";

const FAILING_IMPACTS = new Set(["serious", "critical"]);

export async function expectNoA11yViolations(
  container: Element,
  options?: Parameters<typeof axe>[1]
): Promise<void> {
  const results: AxeResults = await axe(container, options);
  const blocking = results.violations.filter((v: Result) =>
    v.impact ? FAILING_IMPACTS.has(v.impact) : false
  );
  if (blocking.length > 0) {
    const summary = blocking
      .map((v) => `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} nodes)`)
      .join("\n");
    throw new Error(`a11y violations (serious/critical):\n${summary}`);
  }
}
