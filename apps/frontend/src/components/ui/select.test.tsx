import { describe, it } from "bun:test";
import { renderWithProviders } from "@/test/helpers/render";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
import { expectNoA11yViolations } from "@/test/helpers/axe";

describe("Select", () => {
  it("has no serious or critical a11y violations", async () => {
    const { container } = renderWithProviders(
      <Select>
        <SelectTrigger aria-label="Choose option">
          <SelectValue placeholder="Select..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option-1">Option 1</SelectItem>
          <SelectItem value="option-2">Option 2</SelectItem>
        </SelectContent>
      </Select>
    );
    // Radix Select portal renders outside the container — axe is run on the
    // trigger only here (closed state), which is the accessible surface that
    // matters for keyboard/screen-reader entry.
    await expectNoA11yViolations(container);
  });
});
