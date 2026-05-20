import React from "react";

export interface HistogramBar {
  label: string;
  value: number;
  highlighted?: boolean;
}

export interface HistogramProps {
  bars: HistogramBar[];
  height?: number;
  color?: string;
  highlightColor?: string;
  xLabels?: number;
}

const VIEW_W = 600;
const PAD_L = 28;
const PAD_R = 8;
const PAD_T = 8;
const PAD_B = 22;

export const Histogram = ({
  bars,
  height = 180,
  color = "var(--blue)",
  highlightColor = "var(--purple-2)",
  xLabels = 6,
}: HistogramProps) => {
  const innerW = VIEW_W - PAD_L - PAD_R;
  const innerH = height - PAD_T - PAD_B;
  const max = Math.max(1, ...bars.map((b) => b.value));
  const slot = bars.length > 0 ? innerW / bars.length : innerW;
  const barW = Math.max(2, slot * 0.7);
  const labelEvery = bars.length > 0 ? Math.max(1, Math.ceil(bars.length / xLabels)) : 1;

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${VIEW_W} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="24h activity histogram"
    >
      {/* Baseline */}
      <line
        x1={PAD_L}
        x2={VIEW_W - PAD_R}
        y1={PAD_T + innerH}
        y2={PAD_T + innerH}
        stroke="var(--border)"
        vectorEffect="non-scaling-stroke"
      />

      {bars.map((b, i) => {
        const h = (b.value / max) * innerH;
        const x = PAD_L + i * slot + (slot - barW) / 2;
        const y = PAD_T + innerH - h;
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={Math.max(h, 1)}
              fill={b.highlighted ? highlightColor : color}
              opacity={b.highlighted ? 1 : 0.85}
              rx={2}
            />
            {i % labelEvery === 0 && (
              <text
                x={x + barW / 2}
                y={PAD_T + innerH + 14}
                fontSize={9}
                textAnchor="middle"
                fill="var(--text-3)"
                fontFamily="var(--mono, monospace)"
              >
                {b.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};
