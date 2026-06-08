import { useRef, useEffect, useState, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useGlossaryPopover } from "./GlossaryPopoverContext";
import { getGlossaryEntry } from "@/data/glossary";
import { getConceptEntry } from "@/data/concepts";
import { usePrefersReducedMotion } from "@/utils/motion";
import { cn } from "@/lib/utils";

interface Props {
  entryId: string;
  children: ReactNode;
}

export function GlossaryTermMarker({ entryId, children }: Props) {
  const { openId, openPopover, closePopover } = useGlossaryPopover();
  const isOpen = openId === entryId;
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const entry = getGlossaryEntry(entryId);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const POPOVER_WIDTH = 288; // w-72 = 18rem = 288px
    const POPOVER_EST_HEIGHT = 160; // conservative estimate
    const OFFSET = 4;
    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;

    const spaceBelow = viewportH - rect.bottom - OFFSET;
    const top =
      spaceBelow >= POPOVER_EST_HEIGHT
        ? rect.bottom + OFFSET
        : rect.top - POPOVER_EST_HEIGHT - OFFSET;

    const left = Math.min(rect.left, viewportW - POPOVER_WIDTH - 8);

    setPopoverStyle({
      position: "fixed",
      left,
      top,
    });
  }, []);

  const scheduleOpen = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    openTimerRef.current = setTimeout(() => openPopover(entryId), 150);
  };

  const scheduleClose = () => {
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
    closeTimerRef.current = setTimeout(closePopover, 300);
  };

  const cancelClose = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  };

  // Position the popover when it opens
  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
  }, [isOpen, updatePosition]);

  // Keyboard: Escape closes
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePopover();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, closePopover]);

  if (!entry) return <>{children}</>;

  return (
    <span className="relative inline-block">
      <span
        ref={triggerRef}
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className="border-b border-dotted border-current cursor-help"
        onMouseEnter={scheduleOpen}
        onMouseLeave={scheduleClose}
        onFocus={() => openPopover(entryId)}
        onBlur={scheduleClose}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (isOpen) {
              closePopover();
            } else {
              openPopover(entryId);
            }
          }
        }}
      >
        {children}
      </span>

      {isOpen &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Definition: ${entry.term}`}
            style={popoverStyle}
            className={cn(
              "z-[70] w-72 rounded-lg border bg-card p-3 shadow-lg font-body font-normal normal-case tracking-normal leading-normal",
              reduced ? "" : "animate-in fade-in duration-150"
            )}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="label-detail mb-1 text-foreground">{entry.term}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{entry.definition}</p>

            {entry.relatedConceptIds.filter((id) => id !== entryId).length > 0 && (
              <div className="mt-2 pt-2 border-t">
                <p className="text-[11px] text-muted-foreground/70 mb-1">Related Concepts</p>
                <div className="flex flex-wrap gap-1">
                  {entry.relatedConceptIds
                    .filter((id) => id !== entryId)
                    .map((conceptId) => {
                      const concept = getConceptEntry(conceptId);
                      if (!concept) return null;
                      return (
                        <Link
                          key={conceptId}
                          to={`/help?entry=${conceptId}`}
                          className="text-[11px] text-foreground/60 hover:text-foreground underline transition-colors"
                          onClick={closePopover}
                        >
                          {concept.title}
                        </Link>
                      );
                    })}
                </div>
              </div>
            )}
          </div>,
          document.body
        )}
    </span>
  );
}
