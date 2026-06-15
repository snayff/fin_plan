import { describe, it, expect, mock } from "bun:test";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/helpers/render";
import { useAuthStore } from "@/stores/authStore";
import type { ApiError } from "@/lib/api";
import { HouseholdSection } from "./HouseholdSection";

const toastSuccess = mock(() => {});
const toastError = mock(() => {});

const inviteMutate = mock(
  (_variables: unknown, options?: { onError?: (error: unknown) => void }) => {
    options?.onError?.({
      message: "A user with this email is already a member of this household",
      statusCode: 409,
    } satisfies ApiError);
  }
);

mock.module("sonner", () => ({
  toast: {
    success: toastSuccess,
    error: toastError,
  },
}));

mock.module("@/hooks/useSettings", () => ({
  useHouseholdDetails: () => ({
    data: {
      household: {
        name: "Test Household",
        memberProfiles: [
          {
            id: "member-1",
            userId: "user-1",
            name: "Owner",
            role: "owner",
            user: { id: "user-1", name: "Owner", email: "owner@example.com" },
          },
        ],
        invites: [],
      },
    },
  }),
  useRenameHousehold: () => ({ mutate: mock(() => {}), isPending: false }),
  useInviteMember: () => ({ mutate: inviteMutate, isPending: false }),
  useCancelInvite: () => ({ mutate: mock(() => {}), isPending: false }),
  useRemoveMember: () => ({ mutate: mock(() => {}), isPending: false }),
  useLeaveHousehold: () => ({ mutate: mock(() => {}), isPending: false }),
  useUpdateMemberRole: () => ({ mutate: mock(() => {}), isPending: false }),
  useCreateMember: () => ({ mutate: mock(() => {}), isPending: false }),
  useUpdateMember: () => ({ mutate: mock(() => {}), isPending: false }),
  useDeleteMember: () => ({ mutate: mock(() => {}), isPending: false }),
}));

describe("HouseholdSection", () => {
  it("shows the backend error message when invite creation conflicts", () => {
    useAuthStore.setState({
      user: {
        id: "user-1",
        name: "Owner",
        email: "owner@example.com",
        activeHouseholdId: "household-1",
      } as any,
      accessToken: "token",
      isAuthenticated: true,
      authStatus: "authenticated",
      isLoading: false,
      error: null,
    });

    renderWithProviders(<HouseholdSection />);

    const nameInput = screen.getByLabelText("Invited person's name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "New Member" } });
    const input = screen.getByLabelText("Invite email address") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "member@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Create link" }));

    expect(inviteMutate).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledWith(
      "A user with this email is already a member of this household"
    );
    expect(input.value).toBe("member@example.com");
  });
});
