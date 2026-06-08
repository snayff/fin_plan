import { useState } from "react";
import { formatCurrency } from "@/utils/format";
import { useSettings } from "@/hooks/useSettings";

interface WaterfallSankeyProps {
  income: number;
  committed: number;
  discretionary: number;
  surplus: number;
}

const TIER_COLOURS = {
  income: "#0ea5e9",
  committed: "#6366f1",
  discretionary: "#a855f7",
  surplus: "#4adcd0",
} as const;

type BandKey = "committed" | "discretionary" | "surplus";

const TIER_LABELS: Record<BandKey, string> = {
  committed: "Committed",
  discretionary: "Discretionary",
  surplus: "Surplus",
};

const WIDTH = 320;
const HEIGHT = 200;
const COL_LEFT = 40;
const COL_MID = WIDTH / 2;
const COL_RIGHT = WIDTH - 40;
const BAND_TOP = 30;
const BAND_BOTTOM = HEIGHT - 20;
const BAND_HEIGHT = BAND_BOTTOM - BAND_TOP;

interface Band {
  key: BandKey;
  colour: string;
  fraction: number;
  yStartLeft: number;
  heightLeft: number;
  yStartRight: number;
  heightRight: number;
}

function buildBands(
  income: number,
  committed: number,
  discretionary: number,
  surplus: number
): Band[] {
  if (income <= 0) return [];

  const cFrac = committed / income;
  const dFrac = discretionary / income;
  const sFrac = surplus / income;

  const cHeight = cFrac * BAND_HEIGHT;
  const dHeight = dFrac * BAND_HEIGHT;
  const sHeight = sFrac * BAND_HEIGHT;

  let yMid = BAND_TOP;
  const bands: Band[] = [];

  // Committed: flows from income (top portion) to middle top
  bands.push({
    key: "committed",
    colour: TIER_COLOURS.committed,
    fraction: cFrac,
    yStartLeft: BAND_TOP,
    heightLeft: cHeight,
    yStartRight: yMid,
    heightRight: cHeight,
  });
  yMid += cHeight;

  // Discretionary: flows from income (middle portion) to middle bottom
  bands.push({
    key: "discretionary",
    colour: TIER_COLOURS.discretionary,
    fraction: dFrac,
    yStartLeft: BAND_TOP + cHeight,
    heightLeft: dHeight,
    yStartRight: yMid,
    heightRight: dHeight,
  });

  // Surplus: flows from remaining income through to right
  bands.push({
    key: "surplus",
    colour: TIER_COLOURS.surplus,
    fraction: sFrac,
    yStartLeft: BAND_TOP + cHeight + dHeight,
    heightLeft: sHeight,
    yStartRight: BAND_TOP,
    heightRight: sHeight,
  });

  return bands.filter((b) => b.fraction > 0);
}

function bandPath(
  x0: number,
  x1: number,
  y0Top: number,
  h0: number,
  y1Top: number,
  h1: number
): string {
  const cx = (x0 + x1) / 2;
  return [
    `M ${x0} ${y0Top}`,
    `C ${cx} ${y0Top}, ${cx} ${y1Top}, ${x1} ${y1Top}`,
    `L ${x1} ${y1Top + h1}`,
    `C ${cx} ${y1Top + h1}, ${cx} ${y0Top + h0}, ${x0} ${y0Top + h0}`,
    `Z`,
  ].join(" ");
}

export function WaterfallSankey({
  income,
  committed,
  discretionary,
  surplus,
}: WaterfallSankeyProps) {
  const { data: settings } = useSettings();
  const showPence = settings?.showPence ?? false;
  const [hoveredBand, setHoveredBand] = useState<BandKey | null>(null);

  const amounts: Record<BandKey, number> = { committed, discretionary, surplus };
  const leftBands = buildBands(income, committed, discretionary, surplus);

  return (
    <div className="relative">
      <svg
        width={WIDTH}
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        aria-label="Waterfall flow diagram"
      >
        {/* Column labels */}
        <text
          x={COL_LEFT}
          y={16}
          textAnchor="middle"
          fill="rgba(238,242,255,0.5)"
          fontSize="11"
          fontFamily="var(--font-heading, 'Outfit', sans-serif)"
          fontWeight={600}
          letterSpacing="0.05em"
        >
          Income
        </text>
        <text
          x={COL_RIGHT}
          y={16}
          textAnchor="middle"
          fill="rgba(238,242,255,0.5)"
          fontSize="11"
          fontFamily="var(--font-heading, 'Outfit', sans-serif)"
          fontWeight={600}
          letterSpacing="0.05em"
        >
          Surplus
        </text>

        {/* Income bar (left column) */}
        {income > 0 && (
          <rect
            x={COL_LEFT - 8}
            y={BAND_TOP}
            width={16}
            height={BAND_HEIGHT}
            rx={4}
            fill={TIER_COLOURS.income}
            opacity={0.8}
          />
        )}

        {/* Bands from left to mid */}
        {leftBands
          .filter((b) => b.key !== "surplus")
          .map((band) => (
            <path
              key={band.key}
              role="img"
              aria-label={`${TIER_LABELS[band.key]}: ${formatCurrency(amounts[band.key], showPence)}`}
              d={bandPath(
                COL_LEFT + 8,
                COL_MID - 8,
                band.yStartLeft,
                band.heightLeft,
                band.yStartRight,
                band.heightRight
              )}
              fill={band.colour}
              opacity={hoveredBand === band.key ? 0.9 : 0.5}
              style={{ transition: "opacity 150ms ease-out", cursor: "default" }}
              onMouseEnter={() => setHoveredBand(band.key)}
              onMouseLeave={() => setHoveredBand(null)}
            />
          ))}

        {/* Mid column bars */}
        {leftBands
          .filter((b) => b.key !== "surplus")
          .map((band) => (
            <rect
              key={`mid-${band.key}`}
              x={COL_MID - 8}
              y={band.yStartRight}
              width={16}
              height={band.heightRight}
              fill={band.colour}
              opacity={0.8}
            />
          ))}

        {/* Surplus band: mid to right */}
        {leftBands
          .filter((b) => b.key === "surplus")
          .map((band) => {
            const midYStart = band.yStartLeft;
            return (
              <path
                key={band.key}
                role="img"
                aria-label={`${TIER_LABELS[band.key]}: ${formatCurrency(amounts[band.key], showPence)}`}
                d={bandPath(
                  COL_MID + 8,
                  COL_RIGHT - 8,
                  midYStart,
                  band.heightLeft,
                  band.yStartRight,
                  band.heightRight
                )}
                fill={band.colour}
                opacity={hoveredBand === band.key ? 0.9 : 0.5}
                style={{ transition: "opacity 150ms ease-out", cursor: "default" }}
                onMouseEnter={() => setHoveredBand(band.key)}
                onMouseLeave={() => setHoveredBand(null)}
              />
            );
          })}

        {/* Surplus bar (right column) */}
        {surplus > 0 && (
          <rect
            x={COL_RIGHT - 8}
            y={BAND_TOP}
            width={16}
            height={leftBands.find((b) => b.key === "surplus")?.heightRight ?? 0}
            rx={4}
            fill={TIER_COLOURS.surplus}
            opacity={0.8}
          />
        )}
      </svg>

      {/* Tooltip */}
      {hoveredBand && (
        <div
          role="tooltip"
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none px-3 py-1.5 rounded-lg"
          style={{
            background: "rgba(13,17,32,0.95)",
            border: "1px solid rgba(238,242,255,0.12)",
            backdropFilter: "blur(8px)",
          }}
        >
          <span
            className="text-xs font-medium"
            style={{
              color: TIER_COLOURS[hoveredBand],
              fontFamily: "var(--font-heading, 'Outfit', sans-serif)",
            }}
          >
            {TIER_LABELS[hoveredBand]}
          </span>
          <span
            className="text-xs ml-2 tabular-nums"
            style={{
              color: "rgba(238,242,255,0.85)",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {formatCurrency(amounts[hoveredBand], showPence)}/mo
          </span>
        </div>
      )}
    </div>
  );
}
