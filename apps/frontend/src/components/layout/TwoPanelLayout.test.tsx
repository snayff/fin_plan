import { afterEach, beforeEach, describe, expect, it, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";
import { TwoPanelLayout } from "./TwoPanelLayout";
import { expectNoA11yViolations } from "@/test/helpers/axe";

describe("TwoPanelLayout", () => {
  it("has no serious or critical a11y violations", async () => {
    const { container } = renderWithProviders(
      <TwoPanelLayout left={<div>Left panel</div>} right={<div>Right panel</div>} />
    );
    await expectNoA11yViolations(container);
  });

  it("has no serious or critical a11y violations when right is null", async () => {
    const { container } = renderWithProviders(
      <TwoPanelLayout left={<div>Left panel</div>} right={null} rightPlaceholder="Select an item" />
    );
    await expectNoA11yViolations(container);
  });
});

type MqlListener = (e: MediaQueryListEvent) => void;
const originalMatchMedia = window.matchMedia;

function setViewport(mobile: boolean) {
  const listeners = new Set<MqlListener>();
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: mobile,
      media: query,
      onchange: null,
      addEventListener: (event: string, listener: MqlListener) => {
        if (event === "change") listeners.add(listener);
      },
      removeEventListener: (event: string, listener: MqlListener) => {
        if (event === "change") listeners.delete(listener);
      },
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

describe("TwoPanelLayout responsive behaviour", () => {
  beforeEach(() => setViewport(false));
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  test("desktop: renders both panels regardless of selectedKey", () => {
    setViewport(false);
    render(
      <TwoPanelLayout
        left={<div data-testid="left">L</div>}
        right={<div data-testid="right">R</div>}
        selectedKey={null}
      />
    );
    expect(screen.getByTestId("left")).toBeInTheDocument();
    expect(screen.getByTestId("right")).toBeInTheDocument();
  });

  test("mobile + selectedKey == null: renders only left", () => {
    setViewport(true);
    render(
      <TwoPanelLayout
        left={<div data-testid="left">L</div>}
        right={<div data-testid="right">R</div>}
        selectedKey={null}
      />
    );
    expect(screen.getByTestId("left")).toBeInTheDocument();
    expect(screen.queryByTestId("right")).not.toBeInTheDocument();
  });

  test("mobile + selectedKey != null: renders only right", () => {
    setViewport(true);
    render(
      <TwoPanelLayout
        left={<div data-testid="left">L</div>}
        right={<div data-testid="right">R</div>}
        selectedKey="some-id"
      />
    );
    expect(screen.queryByTestId("left")).not.toBeInTheDocument();
    expect(screen.getByTestId("right")).toBeInTheDocument();
  });

  test("mobile + selectedKey != null but right is null: shows placeholder", () => {
    setViewport(true);
    render(
      <TwoPanelLayout
        left={<div data-testid="left">L</div>}
        right={null}
        selectedKey="some-id"
        rightPlaceholder="Pick something"
      />
    );
    expect(screen.getByText("Pick something")).toBeInTheDocument();
  });

  test("selectedKey defaults to null when omitted (left-only on mobile)", () => {
    setViewport(true);
    render(
      <TwoPanelLayout
        left={<div data-testid="left">L</div>}
        right={<div data-testid="right">R</div>}
      />
    );
    expect(screen.getByTestId("left")).toBeInTheDocument();
    expect(screen.queryByTestId("right")).not.toBeInTheDocument();
  });
});
