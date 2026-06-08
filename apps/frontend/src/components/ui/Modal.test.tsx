import { describe, it } from "bun:test";
import { renderWithProviders } from "@/test/helpers/render";
import Modal from "./Modal";
import { expectNoA11yViolations } from "@/test/helpers/axe";

describe("Modal", () => {
  it("has no serious or critical a11y violations when open", async () => {
    renderWithProviders(
      <Modal isOpen={true} onClose={() => {}} title="Confirm action">
        <p>Are you sure you want to proceed?</p>
      </Modal>
    );
    // Radix Dialog portals content outside the container — the dialog role and
    // title are rendered into document.body. We run axe on document.body to
    // capture the full dialog structure.
    await expectNoA11yViolations(document.body);
  });
});
