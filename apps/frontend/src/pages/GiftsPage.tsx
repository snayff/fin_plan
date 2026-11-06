import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { TwoPanelLayout } from "@/components/layout/TwoPanelLayout";
import { GiftsLeftAside, type GiftsMode } from "@/components/gifts/GiftsLeftAside";
import { GiftsModePanel } from "@/components/gifts/GiftsModePanel";
import { UpcomingModePanel } from "@/components/gifts/UpcomingModePanel";
import { ConfigModePanel, type ConfigDrill } from "@/components/gifts/ConfigModePanel";
import { YearRolloverBanner } from "@/components/gifts/YearRolloverBanner";
import { SkeletonLoader } from "@/components/common/SkeletonLoader";
import { PanelError } from "@/components/common/PanelError";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useGiftsState } from "@/hooks/useGifts";
import { MobileUnsupportedNotice } from "@/components/common/MobileUnsupportedNotice";
import { useIsMobile } from "@/hooks/useIsMobile";

export default function GiftsPage() {
  const isMobile = useIsMobile();
  if (isMobile) return <MobileUnsupportedNotice pageName="Gifts" />;
  return <GiftsPageBody />;
}

type DeepLink = { personId: string | null; drill: ConfigDrill | undefined; adding: boolean };

/**
 * Search deep links (see features/search/destinations.ts and actions.ts):
 *   ?person=<id>          → Gifts view, that person's detail open
 *   ?view=events&focus=<id> → Config → Events, the event row focused
 *   ?add=person | ?add=event → Config → People/Events with the add form open
 */
function readDeepLink(params: URLSearchParams): DeepLink {
  const add = params.get("add");
  const view = params.get("view");
  if (add === "person") return { personId: null, drill: "people", adding: true };
  if (add === "event") return { personId: null, drill: "events", adding: true };
  if (view === "events") return { personId: null, drill: "events", adding: false };
  return { personId: params.get("person"), drill: undefined, adding: false };
}

function GiftsPageBody() {
  const year = new Date().getFullYear();
  const [params, setParams] = useSearchParams();
  // Captured once: the page opens where the link points, then behaves normally.
  const [deepLink] = useState(() => readDeepLink(params));
  const [mode, setMode] = useState<GiftsMode>(deepLink.drill ? "config" : "gifts");

  // Clear the one-shot params so refresh/back don't re-open them. `focus` is
  // left for ConfigEventsPanel, which consumes it once the event rows load.
  useEffect(() => {
    if (!["person", "view", "add"].some((k) => params.has(k))) return;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        ["person", "view", "add"].forEach((k) => next.delete(k));
        return next;
      },
      { replace: true }
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- run once on arrival
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

  const stateQuery = useGiftsState(year);

  if (stateQuery.isError) {
    return (
      <div data-page="gifts" data-testid="gifts-page" className="relative h-full">
        <TwoPanelLayout
          left={<SkeletonLoader variant="left-panel" />}
          right={
            <PanelError
              variant="right"
              onRetry={() => void stateQuery.refetch()}
              message="Couldn't load your gift plan."
            />
          }
        />
      </div>
    );
  }

  if (stateQuery.isLoading || !stateQuery.data) {
    return (
      <div data-page="gifts" data-testid="gifts-page" className="relative h-full">
        <TwoPanelLayout
          left={<SkeletonLoader variant="left-panel" />}
          right={<SkeletonLoader variant="right-panel" />}
        />
      </div>
    );
  }

  const state = stateQuery.data;

  return (
    <div data-page="gifts" data-testid="gifts-page" className="relative h-full">
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
              <GiftsModePanel
                people={state.people}
                year={year}
                readOnly={state.isReadOnly}
                initialPersonId={deepLink.personId}
              />
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
                initialDrill={deepLink.drill}
                initialAdding={deepLink.adding}
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
