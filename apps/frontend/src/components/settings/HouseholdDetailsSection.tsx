import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/stores/authStore";
import { useHouseholdDetails, useRenameHousehold } from "@/hooks/useSettings";
import { SettingsSection } from "./SettingsSection";
import { AutoSaveField } from "./AutoSaveField";
import { useAutoSave } from "@/hooks/useAutoSave";

export function HouseholdDetailsSection() {
  const user = useAuthStore((s) => s.user);
  const householdId = user?.activeHouseholdId ?? "";
  const { data } = useHouseholdDetails(householdId);
  const rename = useRenameHousehold();
  const household = data?.household;
  const currentMember = household?.memberProfiles.find((m) => m.userId === user?.id);
  // Renaming the household is a household-level change: owners and admins may do it.
  const canEditDetails = currentMember?.role === "owner" || currentMember?.role === "admin";

  const { value, setValue, status, errorMessage } = useAutoSave<string>({
    initialValue: household?.name ?? "",
    onSave: async (next) => rename.mutateAsync({ id: householdId, name: next }),
  });

  return (
    <SettingsSection
      id="details"
      title="Details"
      description="Name and basic information about this household."
    >
      {canEditDetails ? (
        <AutoSaveField
          label="Household name"
          htmlFor="hh-name"
          status={status}
          errorMessage={errorMessage}
        >
          <Input
            id="hh-name"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={status === "error"}
          />
        </AutoSaveField>
      ) : (
        <div className="text-sm text-foreground/60">{household?.name}</div>
      )}
    </SettingsSection>
  );
}
