import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface AttentionStripProps {
  body: ReactNode;
  tooltip: ReactNode;
  ariaLabel?: string;
}

export function AttentionStrip({ body, tooltip, ariaLabel }: AttentionStripProps) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            role="status"
            aria-live="polite"
            aria-label={ariaLabel}
            aria-haspopup="true"
            tabIndex={0}
            className="flex items-center gap-2 px-4 py-2 text-xs text-attention bg-attention-bg border-t border-b border-attention-border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <span
              className="inline-block h-[5px] w-[5px] rounded-full shrink-0 bg-attention"
              aria-hidden
            />
            <span className="font-numeric">{body}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-80 p-0">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
