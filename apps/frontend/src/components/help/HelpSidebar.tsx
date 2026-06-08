import { useState, useEffect, useMemo } from "react";
import { HelpSearchInput } from "./HelpSearchInput";
import { GLOSSARY_ENTRIES } from "@/data/glossary";
import { CONCEPT_ENTRIES } from "@/data/concepts";
import { cn } from "@/lib/utils";

interface Props {
  selectedId: string;
  onSelect: (id: string) => void;
}

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function HelpSidebar({ selectedId, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 150);

  const filteredGlossary = useMemo(() => {
    if (!debouncedQuery) return GLOSSARY_ENTRIES;
    const q = debouncedQuery.toLowerCase();
    return GLOSSARY_ENTRIES.filter(
      (e) =>
        e.term.toLowerCase().includes(q) ||
        e.definition.toLowerCase().includes(q) ||
        e.tag.toLowerCase().includes(q)
    );
  }, [debouncedQuery]);

  const filteredConcepts = useMemo(() => {
    if (!debouncedQuery) return CONCEPT_ENTRIES;
    const q = debouncedQuery.toLowerCase();
    return CONCEPT_ENTRIES.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.summary.toLowerCase().includes(q) ||
        e.whyItMatters.toLowerCase().includes(q)
    );
  }, [debouncedQuery]);

  const hasNoResults =
    debouncedQuery && filteredGlossary.length === 0 && filteredConcepts.length === 0;

  const itemClass = (id: string) =>
    cn(
      "w-full text-left text-sm px-3 py-1.5 rounded-sm transition-colors cursor-pointer",
      "text-foreground/70 hover:text-foreground hover:bg-page-accent/10",
      selectedId === id &&
        "text-foreground bg-page-accent/[0.14] border-l-2 border-page-accent pl-[10px]"
    );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-3 shrink-0">
        <HelpSearchInput value={query} onChange={setQuery} />
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {hasNoResults ? (
          <p className="text-xs text-muted-foreground text-center mt-8 px-4">
            No results for &ldquo;{debouncedQuery}&rdquo;
          </p>
        ) : (
          <>
            <nav aria-label="Help topics">
              {filteredGlossary.length > 0 && (
                <section aria-label="Glossary">
                  <p className="px-3 py-1.5 label-section">Glossary</p>
                  {filteredGlossary.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className={itemClass(entry.id)}
                      aria-current={selectedId === entry.id ? "true" : undefined}
                      onClick={() => onSelect(entry.id)}
                    >
                      {entry.term}
                    </button>
                  ))}
                </section>
              )}

              {filteredGlossary.length > 0 && filteredConcepts.length > 0 && (
                <hr className="my-2 border-border" />
              )}

              {filteredConcepts.length > 0 && (
                <section aria-label="Concepts">
                  <p className="px-3 py-1.5 label-section">Concepts</p>
                  {filteredConcepts.map((concept) => (
                    <button
                      key={concept.id}
                      type="button"
                      className={itemClass(concept.id)}
                      aria-current={selectedId === concept.id ? "true" : undefined}
                      onClick={() => onSelect(concept.id)}
                    >
                      {concept.title}
                    </button>
                  ))}
                </section>
              )}
            </nav>

            <hr className="my-2 border-border" />

            <section aria-disabled="true">
              <div className="px-3 py-1.5 flex items-center gap-2">
                <span className="label-section">User Manual</span>
                <span className="text-[10px] text-muted-foreground/30 border border-border rounded px-1">
                  Coming soon
                </span>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
