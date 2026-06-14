import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";

interface StaleDataBannerProps {
  erroredAt: Date | null;
  onRetry: () => void;
}

export function StaleDataBanner({ erroredAt, onRetry }: StaleDataBannerProps) {
  const [, forceRender] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => forceRender((n) => n + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  const timeAgo = erroredAt ? formatDistanceToNow(erroredAt, { addSuffix: true }) : "unknown";

  return (
    <div
      role="alert"
      aria-live="polite"
      className="w-full px-4 py-1.5 text-xs flex items-center gap-2 bg-attention/4 border-b border-attention/8 text-attention"
    >
      <span>
        Couldn't sync — showing last saved data · {timeAgo} ·{" "}
        <button
          onClick={onRetry}
          className="underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
          type="button"
        >
          Retry
        </button>
      </span>
    </div>
  );
}
