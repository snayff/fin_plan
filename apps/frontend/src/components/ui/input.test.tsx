import { describe, it } from "bun:test";
import { renderWithProviders } from "@/test/helpers/render";
import { Input } from "./input";
import { expectNoA11yViolations } from "@/test/helpers/axe";

describe("Input", () => {
  it("has no serious or critical a11y violations when labelled", async () => {
    const { container } = renderWithProviders(
      <label htmlFor="email-input">
        Email
        <Input id="email-input" type="email" placeholder="you@example.com" />
      </label>
    );
    await expectNoA11yViolations(container);
  });
});
