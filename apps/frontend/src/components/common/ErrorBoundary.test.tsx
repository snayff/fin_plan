import { describe, it, expect, mock, beforeEach } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const reportError = mock(() => {});
mock.module("@/lib/errorReporter", () => ({ reportError }));

import { ErrorBoundary } from "./ErrorBoundary";

function Boom(): never {
  throw new Error("kaboom");
}

beforeEach(() => {
  reportError.mockClear();
});

describe("ErrorBoundary", () => {
  it("renders the default fallback when a child throws", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByText(/something went wrong/i)).toBeTruthy();
  });

  it("routes the caught error through reportError with the label context", () => {
    render(
      <ErrorBoundary label="test-region">
        <Boom />
      </ErrorBoundary>
    );
    expect(reportError).toHaveBeenCalled();
    const [err, context] = reportError.mock.calls[0] as [Error, Record<string, unknown>];
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("kaboom");
    expect(context).toMatchObject({ label: "test-region" });
  });

  it("offers a scoped retry that resets boundary state and re-renders children", async () => {
    const user = userEvent.setup();

    // Fail on the first render, succeed on the retry re-render.
    let shouldThrow = true;
    function Flaky() {
      if (shouldThrow) {
        throw new Error("transient");
      }
      return <div>recovered content</div>;
    }

    render(
      <ErrorBoundary onReset={() => (shouldThrow = false)}>
        <Flaky />
      </ErrorBoundary>
    );

    expect(screen.getByText(/something went wrong/i)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByText("recovered content")).toBeTruthy();
  });

  it("calls onReset when the scoped retry is used", async () => {
    const user = userEvent.setup();
    const onReset = mock(() => {});
    render(
      <ErrorBoundary onReset={onReset}>
        <Boom />
      </ErrorBoundary>
    );
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(onReset).toHaveBeenCalled();
  });

  it("renders a custom fallback when provided", () => {
    render(
      <ErrorBoundary fallback={<div>custom fallback</div>}>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByText("custom fallback")).toBeTruthy();
  });
});
