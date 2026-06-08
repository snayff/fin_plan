import { useCallback, useRef, useState } from "react";
import { useAddParam } from "@/features/search/useAddParam";
import { TwoPanelLayout } from "@/components/layout/TwoPanelLayout";
import { GiftsLeftAside, type GiftsMode } from "@/components/gifts/GiftsLeftAside";
import { GiftsModePanel } from "@/components/gifts/GiftsModePanel";
import { UpcomingModePanel } from "@/components/gifts/UpcomingModePanel";
import { ConfigModePanel } from "@/components/gifts/ConfigModePanel";
import { YearRolloverBanner } from "@/components/gifts/YearRolloverBanner";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useGiftsState } from "@/hooks/useGifts";

export default function GiftsPage() {
  const year = new Date().getFullYear();
  const [mode, setMode] = useState<GiftsMode>("gifts");
  const [configDirty, setConfigDirty] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const pendingModeRef = useRef<GiftsMode | null>(null);

  const handleModeChange = useCallback(
    (newMode: GiftsMode) => {
      if (mode === "config" && configDirty) {
        pendingModeRef.current = newMode;
        setShowDiscard(true);
      } else {
        setMode(newMode);
      }
    },
    [mode, configDirty]
  );

  useAddParam(() => {
    // TODO: wire add modal for gifts
  });

  const stateQuery = useGiftsState(year);

  if (stateQuery.isLoading || !stateQuery.data) {
    return (
      <div
        data-testid="gifts-page"
        className="flex h-screen items-center justify-center text-sm text-foreground/40"
      >
        Loading…
      </div>
    );
  }

  const state = stateQuery.data;

  return (
    <div data-testid="gifts-page" className="relative h-full">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 20% 20%, rgba(139,92,246,0.08) 0%, transparent 70%)",
        }}
      />
      <YearRolloverBanner year={year} pending={state.rolloverPending} />
      <TwoPanelLayout
        left={
          <GiftsLeftAside
            mode={mode}
            onModeChange={handleModeChange}
            budget={state.budget}
            readOnly={state.isReadOnly}
          />
        }
        right={
          <div className="flex h-full flex-col">
            {mode === "gifts" && (
              <GiftsModePanel people={state.people} year={year} readOnly={state.isReadOnly} />
            )}
            {mode === "upcoming" && (
              <UpcomingModePanel year={year} onNavigateToGifts={() => setMode("gifts")} />
            )}
            {mode === "config" && (
              <ConfigModePanel
                currentMode={state.mode}
                readOnly={state.isReadOnly}
                year={year}
                annualBudget={state.budget.annualBudget}
                onDirtyChange={setConfigDirty}
              />
            )}
          </div>
        }
      />
      <ConfirmDialog
        isOpen={showDiscard}
        onClose={() => {
          setShowDiscard(false);
          pendingModeRef.current = null;
        }}
        onConfirm={() => {
          setShowDiscard(false);
          setConfigDirty(false);
          if (pendingModeRef.current) {
            setMode(pendingModeRef.current);
            pendingModeRef.current = null;
          }
        }}
        title="Discard changes?"
        message="You have unsaved changes to Quick Add. Discard them?"
        confirmText="Discard"
        variant="warning"
      />
    </div>
  );
}
