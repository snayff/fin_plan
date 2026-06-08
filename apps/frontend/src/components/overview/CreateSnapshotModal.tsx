import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { useCreateSnapshot } from "@/hooks/useSettings";

interface CreateSnapshotModalProps {
  onClose: () => void;
  onCreated?: (id: string) => void;
}

export function CreateSnapshotModal({ onClose, onCreated }: CreateSnapshotModalProps) {
  const defaultName = format(new Date(), "MMMM yyyy");
  const [name, setName] = useState(defaultName);
  const [duplicateError, setDuplicateError] = useState(false);

  const createSnapshot = useCreateSnapshot();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setDuplicateError(false);
    createSnapshot.mutate(name, {
      onSuccess: (snapshot: any) => {
        onCreated?.(snapshot.id as string);
        onClose();
      },
      onError: (err: unknown) => {
        if ((err as any)?.status === 409) {
          setDuplicateError(true);
        }
      },
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-lg border shadow-lg p-6 w-full max-w-sm space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold">Save snapshot</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="snapshot-name">
              Name
            </label>
            <input
              id="snapshot-name"
              className="w-full rounded border px-3 py-1.5 text-sm bg-background focus:outline-none focus:border-primary"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setDuplicateError(false);
              }}
              autoFocus
              required
            />
            {duplicateError && (
              <p className="text-xs text-destructive">
                A snapshot with this name already exists — choose a different name.
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={createSnapshot.isPending}>
              {createSnapshot.isPending ? "Saving…" : "Save"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
