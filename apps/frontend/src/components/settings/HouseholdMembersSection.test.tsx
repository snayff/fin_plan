import { describe, it, expect, mock } from "bun:test";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";

let currentRole: "owner" | "admin" | "member" = "admin";

function useAuthStoreMock(selector: (state: unknown) => unknown) {
  return selector({ user: { id: "me", activeHouseholdId: "h1" } });
}
useAuthStoreMock.setState = () => {};
mock.module("@/stores/authStore", () => ({ useAuthStore: useAuthStoreMock }));

const idleMutation = () => ({ mutate: mock(() => {}), isPending: false });

mock.module("@/hooks/useSettings", () => ({
  useHouseholdDetails: () => ({
    data: {
      household: {
        memberProfiles: [{ id: "m1", userId: "me", role: currentRole, name: "Me" }],
        invites: [],
      },
    },
  }),
  useInviteMember: idleMutation,
  useCancelInvite: idleMutation,
  useLeaveHousehold: idleMutation,
  useCreateMember: idleMutation,
  useUpdateMember: idleMutation,
  useDeleteMember: idleMutation,
  useUpdateMemberRole: idleMutation,
  useRemoveMember: idleMutation,
}));

import { HouseholdMembersSection } from "./HouseholdMembersSection";

describe("HouseholdMembersSection", () => {
  it("lets an admin see the invite form", () => {
    currentRole = "admin";
    renderWithProviders(<HouseholdMembersSection />);
    expect(screen.getByText("Invite member")).toBeTruthy();
  });

  it("hides the invite form from a plain member", () => {
    currentRole = "member";
    renderWithProviders(<HouseholdMembersSection />);
    expect(screen.queryByText("Invite member")).toBeNull();
  });
});
