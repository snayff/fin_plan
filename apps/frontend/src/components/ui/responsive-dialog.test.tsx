import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Dialog, DialogTitle, DialogTrigger } from "./dialog";
import { ResponsiveDialogContent } from "./responsive-dialog";

type MqlListener = (e: MediaQueryListEvent) => void;

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

const originalMatchMedia = window.matchMedia;

describe("ResponsiveDialogContent", () => {
  beforeEach(() => {
    setViewport(false);
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  test("renders centred desktop classes when viewport is desktop", () => {
    setViewport(false);
    render(
      <Dialog open>
        <DialogTrigger>open</DialogTrigger>
        <ResponsiveDialogContent>
          <DialogTitle>Test</DialogTitle>
          <div data-testid="body" />
        </ResponsiveDialogContent>
      </Dialog>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("left-[50%]");
    expect(dialog.className).toContain("top-[50%]");
  });

  test("renders bottom-anchored sheet classes when viewport is mobile and variant is sheet", () => {
    setViewport(true);
    render(
      <Dialog open>
        <DialogTrigger>open</DialogTrigger>
        <ResponsiveDialogContent variant="sheet">
          <DialogTitle>Test</DialogTitle>
        </ResponsiveDialogContent>
      </Dialog>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("bottom-0");
    expect(dialog.className).toContain("rounded-t-xl");
    expect(dialog.className).not.toContain("left-[50%]");
  });

  test("renders full-screen classes when viewport is mobile and variant is fullscreen", () => {
    setViewport(true);
    render(
      <Dialog open>
        <DialogTrigger>open</DialogTrigger>
        <ResponsiveDialogContent variant="fullscreen">
          <DialogTitle>Test</DialogTitle>
        </ResponsiveDialogContent>
      </Dialog>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("w-screen");
    expect(dialog.className).toContain("h-[100dvh]");
  });

  test("close button is rendered by default and can be hidden", () => {
    setViewport(false);
    const { rerender } = render(
      <Dialog open>
        <DialogTrigger>open</DialogTrigger>
        <ResponsiveDialogContent>
          <DialogTitle>Test</DialogTitle>
        </ResponsiveDialogContent>
      </Dialog>
    );
    expect(screen.getByText("Close")).toBeInTheDocument();

    rerender(
      <Dialog open>
        <DialogTrigger>open</DialogTrigger>
        <ResponsiveDialogContent hideCloseButton>
          <DialogTitle>Test</DialogTitle>
        </ResponsiveDialogContent>
      </Dialog>
    );
    expect(screen.queryByText("Close")).not.toBeInTheDocument();
  });
});
