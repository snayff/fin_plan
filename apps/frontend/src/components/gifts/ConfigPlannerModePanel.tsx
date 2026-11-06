import { useState } from "react";
import { useSetGiftMode } from "@/hooks/useGifts";
import { ModeSwitchConfirmDialog } from "./ModeSwitchConfirmDialog";
import { GlossaryTermMarker } from "@/components/help/GlossaryTermMarker";
import type { GiftPlannerMode } from "@finplan/shared";

type Props = { currentMode: GiftPlannerMode; readOnly: boolean };

export function ConfigPlannerModePanel({ currentMode, readOnly }: Props) {
  const [pending, setPending] = useState<GiftPlannerMode | null>(null);
  const setMode = useSetGiftMode();

  const choose = (mode: GiftPlannerMode) => {
    if (mode === currentMode) return;
    setPending(mode);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 py-3 flex items-center border-b border-foreground/5">
        <h2 className="font-heading text-base font-bold text-foreground">Mode</h2>
      </div>
      <div className="flex-1 p-6">
        <fieldset className="flex flex-col gap-2 text-sm text-foreground">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="planner-mode"
              aria-label="Synced mode"
              checked={currentMode === "synced"}
              disabled={readOnly}
              onChange={() => choose("synced")}
            />
            <GlossaryTermMarker entryId="gifts-synced-mode">Synced</GlossaryTermMarker> — annual
            budget flows into the waterfall
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="planner-mode"
              aria-label="Independent mode"
              checked={currentMode === "independent"}
              disabled={readOnly}
              onChange={() => choose("independent")}
            />
            <GlossaryTermMarker entryId="gifts-independent-mode">Independent</GlossaryTermMarker> —
            planner runs standalone, no waterfall link
          </label>
        </fieldset>
        {pending && (
          <ModeSwitchConfirmDialog
            fromMode={currentMode}
            toMode={pending}
            onCancel={() => setPending(null)}
            onConfirm={() => {
              setMode.mutate({ mode: pending });
              setPending(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
