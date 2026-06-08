import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { TwoPanelLayout } from "@/components/layout/TwoPanelLayout";
import { PageHeader } from "@/components/common/PageHeader";
import { HelpSidebar } from "@/components/help/HelpSidebar";
import { GlossaryDetailView } from "@/components/help/GlossaryDetailView";
import { ConceptDetailView } from "@/components/help/ConceptDetailView";
import { GlossaryPopoverProvider } from "@/components/help/GlossaryPopoverContext";
import { GLOSSARY_ENTRIES, getGlossaryEntry } from "@/data/glossary";
import { getConceptEntry } from "@/data/concepts";

const DEFAULT_ENTRY_ID = GLOSSARY_ENTRIES[0]!.id; // "amortised" (first alphabetically)

function isValidEntryId(id: string): boolean {
  return getGlossaryEntry(id) !== undefined || getConceptEntry(id) !== undefined;
}

export default function HelpPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawEntry = searchParams.get("entry") ?? "";
  const selectedId = isValidEntryId(rawEntry) ? rawEntry : DEFAULT_ENTRY_ID;

  const handleSelect = useCallback(
    (id: string) => {
      setSearchParams({ entry: id }, { replace: false });
    },
    [setSearchParams]
  );

  const isGlossaryEntry = getGlossaryEntry(selectedId) !== undefined;

  return (
    <GlossaryPopoverProvider>
      <div className="relative h-full">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(ellipse 60% 40% at 20% 20%, rgba(99,102,241,0.06) 0%, transparent 70%)",
          }}
        />
        <TwoPanelLayout
          left={
            <div className="flex flex-col h-full">
              <PageHeader title="Help" />
              <div className="flex-1 min-h-0 overflow-y-auto">
                <HelpSidebar selectedId={selectedId} onSelect={handleSelect} />
              </div>
            </div>
          }
          right={
            isGlossaryEntry ? (
              <GlossaryDetailView entryId={selectedId} onNavigate={handleSelect} />
            ) : (
              <ConceptDetailView conceptId={selectedId} onNavigate={handleSelect} />
            )
          }
        />
      </div>
    </GlossaryPopoverProvider>
  );
}
