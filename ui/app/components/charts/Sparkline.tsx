import React, { useRef, useState } from "react";

export interface SparklineProps {
  values: number[];
  color?: string;
  height?: number;
  /** When true, fills the area below the line. */
  filled?: boolean;
  /**
   * Optional per-bucket labels (e.g. "14:00", "Jan 2"). If absent the
   * tooltip falls back to "Bucket N / M".
   */
  labels?: string[];
  /** Format the value shown in the hover tooltip. Default = number.toString(). */
  valueFormatter?: (n: number) => string;
}

const VIEW_W = 100;

/**
 * Responsive single-series sparkline with cursor-tracking hover tooltip.
 * Uses preserveAspectRatio="none" + non-scaling-stroke so it fills any tile
 * width without distorting stroke thickness.
 */
export const Sparkline = ({
  values,
  color = "var(--blue)",
  height = 28,
  filled = true,
  labels,
  valueFormatter = (n) => String(Math.round(n)),
}: SparklineProps) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [tipX, setTipX] = useState<number>(0);

  if (values.length < 2) {
    return (
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${VIEW_W} ${height}`}
        preserveAspectRatio="none"
        aria-hidden
      />
    );
  }

  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step = VIEW_W / (values.length - 1);
  const points = values
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const areaPoints = `0,${height} ${points} ${VIEW_W},${height}`;

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    if (rect.width <= 0) return;
    const cursorX = e.clientX - rect.left;
    const clamped = Math.max(0, Math.min(rect.width, cursorX));
    const idx = Math.round((clamped / rect.width) * (values.length - 1));
    setHoverIdx(idx);
    setTipX(clamped);
  };
  const handleLeave = () => setHoverIdx(null);

  const cursorFracX = hoverIdx != null ? (hoverIdx * step) / VIEW_W : null;
  const hoverValue = hoverIdx != null ? values[hoverIdx] : null;
  const hoverLabel =
    hoverIdx != null
      ? (labels?.[hoverIdx] ?? `Bucket ${hoverIdx + 1} / ${values.length}`)
      : null;

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
        aria-hidden
      >
        {filled && (
          <polygon
            points={areaPoints}
            fill={color}
            opacity={0.15}
            vectorEffect="non-scaling-stroke"
          />
        )}
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {cursorFracX != null && hoverIdx != null && (
          <>
            <line
              x1={cursorFracX * VIEW_W}
              x2={cursorFracX * VIEW_W}
              y1={0}
              y2={height}
              stroke="var(--text-3)"
              strokeWidth={1}
              strokeDasharray="2 2"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={cursorFracX * VIEW_W}
              cy={
                height -
                ((values[hoverIdx] - min) / range) * height
              }
              r={2.5}
              fill={color}
              stroke="var(--surface)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
      </svg>
      {hoverValue != null && hoverLabel && (
        <div
          role="tooltip"
          style={{
            position: "absolute",
            left: tipX,
            bottom: "100%",
            transform: "translate(-50%, -4px)",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            padding: "3px 6px",
            fontSize: 10.5,
            color: "var(--text)",
            fontVariantNumeric: "tabular-nums",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            boxShadow: "var(--shadow, 0 2px 8px rgba(0,0,0,0.06))",
            zIndex: 2,
          }}
        >
          <span style={{ color: "var(--text-3)" }}>{hoverLabel}</span>
          {" · "}
          <span style={{ fontWeight: 600 }}>{valueFormatter(hoverValue)}</span>
        </div>
      )}
    </div>
  );
};
