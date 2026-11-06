import { configureAxe } from "jest-axe";
import type { AxeResults, Result } from "jest-axe";

const FAILING_IMPACTS = new Set(["serious", "critical"]);

// Radix's FocusGuards render invisible `tabindex="0"` spans at the edges of
// <body>, and its `hideOthers` stamps them `aria-hidden`. axe's
// aria-hidden-focus rule flags that pairing (since happy-dom 20.9 models their
// focusability). The guards are unreachable in practice — FocusScope loops Tab
// inside the dialog and a guard that does receive focus hands it straight back —
// so exempt exactly those nodes and keep the rule for everything else.
const axe = configureAxe({
  globalOptions: {
    rules: [
      {
        id: "aria-hidden-focus",
        selector: '[aria-hidden="true"]:not([data-radix-focus-guard])',
      },
    ],
  },
});

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
