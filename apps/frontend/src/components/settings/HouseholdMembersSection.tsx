import { useState } from "react";
import type { ApiError } from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useAuthStore } from "@/stores/authStore";
import {
  useHouseholdDetails,
  useInviteMember,
  useCancelInvite,
  useLeaveHousehold,
} from "@/hooks/useSettings";
import { SettingsSection } from "./SettingsSection";
import { MemberManagementSection } from "./MemberManagementSection";

export function HouseholdMembersSection() {
  const user = useAuthStore((s) => s.user);
  const householdId = user?.activeHouseholdId ?? "";
  const navigate = useNavigate();

  const { data } = useHouseholdDetails(householdId);
  const household = data?.household;

  const inviteMember = useInviteMember();
  const cancelInvite = useCancelInvite();
  const leaveHousehold = useLeaveHousehold();

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteResult, setInviteResult] = useState<{
    token: string;
    invitedEmail: string;
  } | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  const currentUserId = user?.id;
  const currentMember = household?.memberProfiles.find((m) => m.userId === currentUserId);
  const isOwner = currentMember?.role === "owner";
  // Inviting and cancelling invites are household-level changes: owners and admins.
  const canManageMembers = isOwner || currentMember?.role === "admin";
  const ownerCount = household?.memberProfiles.filter((m) => m.role === "owner").length ?? 0;
  const isSoleOwner = isOwner && ownerCount <= 1;

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    inviteMember.mutate(
      { householdId, email: inviteEmail, name: inviteName },
      {
        onSuccess: (result) => {
          setInviteResult(result);
          setInviteEmail("");
          setInviteName("");
          toast.success("Invite created");
        },
        onError: (error) => {
          toast.error((error as unknown as ApiError).message ?? "Failed to create invite");
        },
      }
    );
  }

  function handleLeave() {
    leaveHousehold.mutate(householdId, {
      onSuccess: () => {
        toast.success("You have left the household");
        navigate("/overview");
      },
    });
  }

  const inviteUrl = inviteResult
    ? `${window.location.origin}/accept-invite/${inviteResult.token}`
    : null;

  return (
    <SettingsSection
      id="members"
      title="Members & invites"
      description="Manage who has access to this household."
    >
      <MemberManagementSection />

      {!isSoleOwner && currentMember && (
        <>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-destructive transition-colors"
            onClick={() => setShowLeaveConfirm(true)}
          >
            Leave household
          </button>
          <ConfirmDialog
            isOpen={showLeaveConfirm}
            onClose={() => setShowLeaveConfirm(false)}
            title="Leave household?"
            message="You will lose access to this household's data. This cannot be undone."
            confirmText="Leave"
            onConfirm={handleLeave}
            variant="danger"
          />
        </>
      )}

      {/* Invite form */}
      {canManageMembers && (
        <div className="space-y-3">
          <p className="text-sm font-medium">Invite member</p>
          <form onSubmit={handleInvite} className="flex flex-col gap-2 max-w-sm">
            <Input
              type="text"
              placeholder="Name"
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              required
              aria-label="Invited person's name"
            />
            <div className="flex items-center gap-2">
              <Input
                type="email"
                placeholder="Email address"
                className="flex-1"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
                aria-label="Invite email address"
              />
              <Button type="submit" size="sm" disabled={inviteMember.isPending}>
                {inviteMember.isPending ? "Creating…" : "Create link"}
              </Button>
            </div>
          </form>

          {inviteResult && inviteUrl && (
            <div className="rounded-lg border p-4 space-y-3 max-w-xs">
              <QRCodeSVG value={inviteUrl} size={120} />
              <p className="text-xs text-muted-foreground break-all">{inviteUrl}</p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => {
                    void navigator.clipboard.writeText(inviteUrl);
                    toast.success("Link copied");
                  }}
                >
                  Copy link
                </button>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setInviteResult(null)}
                >
                  Done
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                For {inviteResult.invitedEmail} · Expires in 24 hours
              </p>
            </div>
          )}

          {/* Pending invites */}
          {(household?.invites ?? []).length > 0 && (
            <div className="space-y-1">
              <p className="label-section">Pending invites</p>
              {(household?.invites ?? []).map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center justify-between py-1.5 border-b last:border-b-0"
                >
                  <div>
                    <p className="text-sm">{invite.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Expires {format(new Date(invite.expiresAt), "dd MMM yyyy")}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                    onClick={() =>
                      cancelInvite.mutate(
                        { householdId, inviteId: invite.id },
                        { onSuccess: () => toast.success("Invite cancelled") }
                      )
                    }
                  >
                    Cancel
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </SettingsSection>
  );
}
