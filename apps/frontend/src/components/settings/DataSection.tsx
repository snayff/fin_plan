import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Download, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useAuthStore } from "@/stores/authStore";
import { useExportHousehold, useImportHousehold, useValidateImport } from "@/hooks/useExportImport";
import { useDeleteHousehold, useHouseholdDetails } from "@/hooks/useSettings";
import { SettingsSection } from "./SettingsSection";
import { ImportDestinationDialog } from "./ImportDestinationDialog";

export function DataSection() {
  const user = useAuthStore((s) => s.user);
  const householdId = user?.activeHouseholdId ?? "";
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImportData, setPendingImportData] = useState<unknown>(null);
  const [showDestination, setShowDestination] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const exportMutation = useExportHousehold();
  const validateMutation = useValidateImport();
  const importMutation = useImportHousehold();
  const deleteMutation = useDeleteHousehold();
  const { data: householdData } = useHouseholdDetails(householdId);
  const householdName = householdData?.household?.name ?? "this household";

  function handleExport() {
    if (!householdId) return;
    exportMutation.mutate(undefined, {
      onSuccess: () => toast.success("Export downloaded"),
      onError: () => toast.error("Export failed. Please try again."),
    });
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // reset so the same file can be picked again

    let parsed: unknown;
    try {
      const text = await file.text();
      parsed = JSON.parse(text);
    } catch {
      toast.error("Could not read this file. Please select a valid JSON file.");
      return;
    }

    validateMutation.mutate(parsed, {
      onSuccess: (result) => {
        if (!result.valid) {
          toast.error(result.errors?.[0] ?? "This file is not a valid finplan export.");
          return;
        }
        setPendingImportData(parsed);
        setShowDestination(true);
      },
      onError: () => toast.error("Could not validate the file. Please try again."),
    });
  }

  function handleConfirmDelete() {
    if (!householdId) return;
    deleteMutation.mutate(householdId, {
      onSuccess: () => {
        toast.success("Household deleted");
        setShowDeleteConfirm(false);
        navigate("/overview");
      },
      onError: () => {
        toast.error("Could not delete this household. Please try again.");
        setShowDeleteConfirm(false);
      },
    });
  }

  function handleConfirmImport(mode: "overwrite" | "create_new") {
    if (!pendingImportData || !householdId) return;
    importMutation.mutate(
      { data: pendingImportData, mode },
      {
        onSuccess: () => {
          toast.success(
            mode === "create_new" ? "New household created from import" : "Household data imported"
          );
          setShowDestination(false);
          setPendingImportData(null);
        },
        onError: () => {
          toast.error("Import failed. Please try again.");
          setShowDestination(false);
        },
      }
    );
  }

  return (
    <SettingsSection
      id="data"
      title="Data"
      description="Back up your household data or restore from a previous export."
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4 rounded-md border p-4">
          <div>
            <h3 className="text-sm font-medium">Export</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Download a JSON backup of all data in this household.
            </p>
          </div>
          <Button onClick={handleExport} disabled={exportMutation.isPending}>
            <Download className="h-3.5 w-3.5 mr-2" />
            {exportMutation.isPending ? "Exporting…" : "Export"}
          </Button>
        </div>

        <div className="flex items-start justify-between gap-4 rounded-md border p-4">
          <div>
            <h3 className="text-sm font-medium">Import</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Restore data from a JSON backup. Choose to overwrite this household or create a new
              one.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={handleImportClick}
            disabled={validateMutation.isPending || importMutation.isPending}
          >
            <Upload className="h-3.5 w-3.5 mr-2" />
            Import…
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleFileChange}
            aria-label="Import data file"
          />
        </div>

        <div className="flex items-start justify-between gap-4 rounded-md border border-destructive/40 bg-destructive/5 p-4">
          <div>
            <h3 className="text-sm font-medium text-destructive">Delete household</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Permanently remove this household and all its data — members, accounts, assets, and
              snapshots. This cannot be undone.
            </p>
          </div>
          <Button
            variant="destructive"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="h-3.5 w-3.5 mr-2" />
            {deleteMutation.isPending ? "Deleting…" : "Delete…"}
          </Button>
        </div>
      </div>

      <ImportDestinationDialog
        isOpen={showDestination}
        onClose={() => {
          setShowDestination(false);
          setPendingImportData(null);
        }}
        onConfirm={handleConfirmImport}
        isPending={importMutation.isPending}
      />

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="Delete household?"
        message={`Permanently delete "${householdName}" and all its data — members, accounts, assets, and snapshots. This cannot be undone.`}
        confirmText="Delete"
        onConfirm={handleConfirmDelete}
        isLoading={deleteMutation.isPending}
        variant="danger"
      />
    </SettingsSection>
  );
}
