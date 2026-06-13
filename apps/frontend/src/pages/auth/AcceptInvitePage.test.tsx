import { beforeEach, describe, expect, it } from "bun:test";
import { screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { Route, Routes } from "react-router-dom";
import { QueryClient } from "@tanstack/react-query";
import AcceptInvitePage from "./AcceptInvitePage";
import { renderWithProviders } from "../../test/helpers/render";
import { setAuthenticated, setUnauthenticated } from "../../test/helpers/auth";
import { server } from "../../test/msw/server";

function renderAcceptInvitePage(queryClient?: QueryClient) {
  return renderWithProviders(
    <Routes>
      <Route path="/accept-invite/:token" element={<AcceptInvitePage />} />
    </Routes>,
    { initialEntries: ["/accept-invite/token-123"], queryClient }
  );
}

describe("AcceptInvitePage", () => {
  beforeEach(() => {
    setUnauthenticated();
  });

  it("shows masked email restriction for email-bound invites", async () => {
    renderAcceptInvitePage();

    await waitFor(() => {
      expect(
        screen.getByText(/this invite must be completed using the invited email address/i)
      ).toBeTruthy();
      expect(screen.getByText(/i\*\*\*\*\*\*@example.com/i)).toBeTruthy();
    });
  });

  it("shows backend mismatch error when logged-in user joins with the wrong account", async () => {
    setAuthenticated();
    server.use(
      http.post("/api/auth/invite/:token/join", () =>
        HttpResponse.json(
          {
            error: {
              message:
                "This invite is for a different email address. Please sign in with the invited account.",
              code: "VALIDATION_ERROR",
              statusCode: 400,
            },
          },
          { status: 400 }
        )
      )
    );

    renderAcceptInvitePage();

    // When authenticated, the component auto-joins via useEffect — no button click needed
    await waitFor(() => {
      expect(
        screen.getByText(
          "This invite is for a different email address. Please sign in with the invited account."
        )
      ).toBeTruthy();
    });
  });

  it("drops previously cached query data after a logged-in user joins a household", async () => {
    setAuthenticated();
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    qc.setQueryData(["accounts"], [{ id: "ac1", name: "Old household account" }]);
    qc.setQueryData(["waterfall", "summary"], { surplus: 100 });

    renderAcceptInvitePage(qc);

    // Auto-join runs via useEffect for authenticated users
    await waitFor(() => {
      expect(screen.getByText(/you're in!/i)).toBeTruthy();
    });

    expect(qc.getQueryData(["accounts"])).toBeUndefined();
    expect(qc.getQueryData(["waterfall", "summary"])).toBeUndefined();
  });
});
