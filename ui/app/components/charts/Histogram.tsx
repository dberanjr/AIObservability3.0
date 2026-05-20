import React, { useRef, useState } from "react";

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
  /** Format the value shown in the cursor tooltip. */
  valueFormatter?: (n: number) => string;
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
  valueFormatter = (n) => String(Math.round(n)),
}: HistogramProps) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [tipPx, setTipPx] = useState<number>(0);

  const innerW = VIEW_W - PAD_L - PAD_R;
  const innerH = height - PAD_T - PAD_B;
  const max = Math.max(1, ...bars.map((b) => b.value));
  const slot = bars.length > 0 ? innerW / bars.length : innerW;
  const barW = Math.max(2, slot * 0.7);
  const labelEvery = bars.length > 0 ? Math.max(1, Math.ceil(bars.length / xLabels)) : 1;

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const wrap = wrapRef.current;
    if (!wrap || bars.length === 0) return;
    const rect = wrap.getBoundingClientRect();
    if (rect.width <= 0) return;
    const containerL = (PAD_L / VIEW_W) * rect.width;
    const containerR = ((VIEW_W - PAD_R) / VIEW_W) * rect.width;
    const cursor = e.clientX - rect.left;
    if (cursor < containerL || cursor > containerR) {
      setHoverIdx(null);
      return;
    }
    const innerWPx = containerR - containerL;
    const idx = Math.min(
      bars.length - 1,
      Math.max(0, Math.floor(((cursor - containerL) / innerWPx) * bars.length)),
    );
    setHoverIdx(idx);
    setTipPx(cursor);
  };
  const handleLeave = () => setHoverIdx(null);

  return (
    <div
      ref={wrapRef}
      style={{ position: "relative", width: "100%", height }}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${VIEW_W} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="24h activity histogram"
      >
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
          const isHovered = hoverIdx === i;
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(h, 1)}
                fill={b.highlighted || isHovered ? highlightColor : color}
                opacity={b.highlighted || isHovered ? 1 : 0.85}
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

      {hoverIdx != null && (
        <div
          role="tooltip"
          style={{
            position: "absolute",
            left: tipPx,
            top: 4,
            transform: "translateX(-50%)",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "5px 8px",
            fontSize: 11,
            color: "var(--text)",
            fontVariantNumeric: "tabular-nums",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            boxShadow: "var(--shadow, 0 2px 8px rgba(0,0,0,0.06))",
            zIndex: 2,
          }}
        >
          <span style={{ color: "var(--text-3)" }}>{bars[hoverIdx].label}</span>
          {" · "}
          <span style={{ fontWeight: 600 }}>
            {valueFormatter(bars[hoverIdx].value)}
          </span>
        </div>
      )}
    </div>
  );
};
