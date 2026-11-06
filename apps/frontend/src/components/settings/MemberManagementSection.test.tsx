import { describe, it, expect, mock } from "bun:test";
import { screen, fireEvent } from "@testing-library/react";
import { createMemberSchema } from "@finplan/shared";
import { renderWithProviders } from "@/test/helpers/render";

let currentRole: "owner" | "admin" | "member" = "admin";

function useAuthStoreMock(selector: (state: unknown) => unknown) {
  return selector({ user: { id: "me", activeHouseholdId: "h1" } });
}
useAuthStoreMock.setState = () => {};
mock.module("@/stores/authStore", () => ({ useAuthStore: useAuthStoreMock }));

const idleMutation = () => ({ mutate: mock(() => {}), isPending: false });
const createMutate = mock((_vars: { householdId: string; data: unknown }) => {});

mock.module("@/hooks/useSettings", () => ({
  useHouseholdDetails: () => ({
    data: {
      household: {
        memberProfiles: [{ id: "m1", userId: "me", role: currentRole, name: "Me" }],
        invites: [],
      },
    },
  }),
  useCreateMember: () => ({ mutate: createMutate, isPending: false }),
  useUpdateMember: idleMutation,
  useDeleteMember: idleMutation,
  useUpdateMemberRole: idleMutation,
  useRemoveMember: idleMutation,
}));

import { MemberManagementSection } from "./MemberManagementSection";

describe("MemberManagementSection", () => {
  it("lets an admin add a member", () => {
    currentRole = "admin";
    renderWithProviders(<MemberManagementSection />);
    expect(screen.getByRole("button", { name: /add member/i })).toBeTruthy();
  });

  it("hides member management from a plain member", () => {
    currentRole = "member";
    renderWithProviders(<MemberManagementSection />);
    expect(screen.queryByRole("button", { name: /add member/i })).toBeNull();
  });

  it("sends a date of birth the API schema accepts", () => {
    currentRole = "admin";
    renderWithProviders(<MemberManagementSection />);
    fireEvent.click(screen.getByRole("button", { name: /add member/i }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "LR" } });
    fireEvent.change(screen.getByLabelText(/date of birth/i), {
      target: { value: "2015-06-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    expect(createMutate).toHaveBeenCalled();
    const { data } = createMutate.mock.calls[0]![0];
    expect(createMemberSchema.safeParse(data).success).toBe(true);
  });
});
