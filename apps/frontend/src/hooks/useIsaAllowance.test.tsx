import { describe, it, expect } from "bun:test";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useIsaAllowance } from "./useIsaAllowance";
import { server } from "@/test/msw/server";
import { http, HttpResponse } from "msw";

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("useIsaAllowance", () => {
  it("fetches ISA allowance summary from /api/accounts/isa-allowance", async () => {
    server.use(
      http.get("/api/accounts/isa-allowance", () =>
        HttpResponse.json({
          taxYearStart: "2026-04-06",
          taxYearEnd: "2027-04-05",
          daysRemaining: 200,
          annualLimit: 20000,
          byMember: [],
        })
      )
    );
    const { result } = renderHook(() => useIsaAllowance(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.annualLimit).toBe(20000);
    expect(result.current.data?.byMember).toEqual([]);
  });
});
