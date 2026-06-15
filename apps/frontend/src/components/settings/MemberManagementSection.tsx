import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/stores/authStore";
import {
  useHouseholdDetails,
  useCreateMember,
  useUpdateMember,
  useDeleteMember,
  useUpdateMemberRole,
  useRemoveMember,
} from "@/hooks/useSettings";
import type { Member } from "@/services/household.service";
import type { ApiError } from "@/lib/api";
import { MemberReassignmentPrompt } from "./MemberReassignmentPrompt";

interface MemberFormState {
  name: string;
  dateOfBirth: string;
  retirementYear: string;
}

const EMPTY_FORM: MemberFormState = { name: "", dateOfBirth: "", retirementYear: "" };

export function MemberManagementSection() {
  const user = useAuthStore((s) => s.user);
  const householdId = user?.activeHouseholdId ?? "";
  const { data } = useHouseholdDetails(householdId);

  const members: Member[] = data?.household?.memberProfiles ?? [];
  const currentMember = members.find((m) => m.userId === user?.id);
  // Member management is a household-level change: owners and admins may do it.
  // Fine-grained guards (e.g. an admin cannot remove the owner) live in the API.
  const canManage = currentMember?.role === "owner" || currentMember?.role === "admin";
  const ownerCount = members.filter((m) => m.role === "owner").length;

  const createMutation = useCreateMember();
  const updateMutation = useUpdateMember();
  const deleteMutation = useDeleteMember();
  const updateRoleMutation = useUpdateMemberRole(householdId);
  const removeMutation = useRemoveMember();

  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<MemberFormState>(EMPTY_FORM);
  const [reassignFor, setReassignFor] = useState<{ member: Member; itemCount: number } | null>(
    null
  );

  function resetForm() {
    setForm(EMPTY_FORM);
    setShowAdd(false);
    setEditingId(null);
  }

  function buildPayload() {
    const trimmedName = form.name.trim();
    const dob = form.dateOfBirth.trim();
    const retYearStr = form.retirementYear.trim();
    const retYear = retYearStr ? Number.parseInt(retYearStr, 10) : null;
    return {
      name: trimmedName,
      dateOfBirth: dob ? dob : null,
      retirementYear: Number.isFinite(retYear) ? retYear : null,
    };
  }

  function friendlyError(err: unknown, fallback: string): string {
    if (
      err &&
      typeof err === "object" &&
      "message" in err &&
      typeof (err as ApiError).message === "string"
    ) {
      return (err as ApiError).message;
    }
    return fallback;
  }

  function handleCreate() {
    const payload = buildPayload();
    if (!payload.name) return;
    createMutation.mutate(
      { householdId, data: payload },
      {
        onSuccess: () => {
          toast.success("Member added");
          resetForm();
        },
        onError: (err: unknown) => {
          toast.error(friendlyError(err, "Failed to add member. Please try again."));
        },
      }
    );
  }

  function handleUpdate() {
    if (!editingId) return;
    const payload = buildPayload();
    if (!payload.name) return;
    updateMutation.mutate(
      { householdId, memberId: editingId, data: payload },
      {
        onSuccess: () => {
          toast.success("Member updated");
          resetForm();
        },
        onError: (err: unknown) => {
          toast.error(friendlyError(err, "Failed to update member. Please try again."));
        },
      }
    );
  }

  function handleDelete(member: Member, reassignToMemberId?: string) {
    deleteMutation.mutate(
      { householdId, memberId: member.id, reassignToMemberId },
      {
        onSuccess: () => {
          toast.success("Member deleted");
          setReassignFor(null);
        },
        onError: (err: unknown) => {
          const message = friendlyError(err, "Failed to delete member. Please try again.");
          const match = message.match(/(\d+)\s+assigned items?/i);
          if (match && !reassignToMemberId) {
            const count = Number.parseInt(match[1] ?? "0", 10);
            setReassignFor({ member, itemCount: count });
          } else {
            toast.error(message);
          }
        },
      }
    );
  }

  function handleChangeRole(member: Member, nextRole: "member" | "admin") {
    if (!member.userId) return;
    updateRoleMutation.mutate(
      { targetUserId: member.userId, role: nextRole },
      {
        onSuccess: () => {
          toast.success(nextRole === "admin" ? "Role changed to admin" : "Role changed to member");
        },
        onError: (err: unknown) => {
          toast.error(friendlyError(err, "Failed to update role. Please try again."));
        },
      }
    );
  }

  function handleRemoveLinked(member: Member) {
    removeMutation.mutate(
      { householdId, memberId: member.id },
      {
        onSuccess: () => {
          toast.success("Member removed");
        },
        onError: (err: unknown) => {
          toast.error(friendlyError(err, "Failed to remove member. Please try again."));
        },
      }
    );
  }

  function startEdit(member: Member) {
    setEditingId(member.id);
    setShowAdd(false);
    setForm({
      name: member.name,
      dateOfBirth: member.dateOfBirth ?? "",
      retirementYear: member.retirementYear?.toString() ?? "",
    });
  }

  function startAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowAdd(true);
  }

  const showForm = showAdd || editingId !== null;
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Members</p>
        {canManage && !showForm && (
          <Button size="sm" variant="outline" onClick={startAdd}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add member
          </Button>
        )}
      </div>

      {showForm && (
        <div className="rounded-md border bg-card/50 p-3 space-y-3">
          <div className="space-y-1">
            <Label htmlFor="member-name">Name</Label>
            <Input
              id="member-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Alex"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="member-dob">
                Date of birth <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="member-dob"
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="member-retirement">
                Retirement year{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="member-retirement"
                type="number"
                min="1900"
                max="2200"
                value={form.retirementYear}
                onChange={(e) => setForm({ ...form, retirementYear: e.target.value })}
                placeholder="e.g. 2055"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={resetForm}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={editingId ? handleUpdate : handleCreate}
              disabled={!form.name.trim() || isSubmitting}
            >
              {editingId ? "Save" : "Add"}
            </Button>
          </div>
        </div>
      )}

      <ul className="space-y-1">
        {members.map((member) => (
          <li
            key={member.id}
            className="flex items-center justify-between py-1.5 border-b last:border-b-0"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{member.name}</span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {member.role}
              </Badge>
              {!member.userId && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                  Not yet linked
                </Badge>
              )}
            </div>
            {canManage && editingId !== member.id && (
              <div className="flex items-center gap-3">
                {!member.userId && (
                  <>
                    <button
                      type="button"
                      aria-label={`Edit ${member.name}`}
                      className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => startEdit(member)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${member.name}`}
                      className="p-1 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                      disabled={deleteMutation.isPending}
                      onClick={() => handleDelete(member)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
                {member.userId !== null &&
                  member.userId !== user?.id &&
                  member.role !== "owner" && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                      disabled={updateRoleMutation.isPending}
                      onClick={() =>
                        handleChangeRole(member, member.role === "admin" ? "member" : "admin")
                      }
                    >
                      {member.role === "admin" ? "Make member" : "Make admin"}
                    </button>
                  )}
                {member.userId !== null &&
                  member.userId !== user?.id &&
                  !(member.role === "owner" && ownerCount <= 1) && (
                    <button
                      type="button"
                      aria-label={`Remove ${member.name} from household`}
                      className="p-1 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                      disabled={removeMutation.isPending}
                      onClick={() => handleRemoveLinked(member)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {reassignFor && (
        <MemberReassignmentPrompt
          isOpen={true}
          memberName={reassignFor.member.name}
          itemCount={reassignFor.itemCount}
          destinations={members
            .filter((m) => m.id !== reassignFor.member.id)
            .map((m) => ({ id: m.id, name: m.name }))}
          onConfirm={(destId) => handleDelete(reassignFor.member, destId)}
          onCancel={() => setReassignFor(null)}
        />
      )}
    </div>
  );
}
