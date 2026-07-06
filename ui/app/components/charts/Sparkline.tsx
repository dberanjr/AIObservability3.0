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
  /** "line" (default) for rates/values, "bars" for count-like series. */
  variant?: "line" | "bars";
  /**
   * Optional horizontal reference line (e.g. the series average or an SLO
   * target). Drawn dashed; the y-domain always expands to include it so it
   * never clips off-chart.
   */
  reference?: number;
  /** Short label rendered at the right end of the reference line. */
  referenceLabel?: string;
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
  variant = "line",
  reference,
  referenceLabel,
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

  const refVal =
    typeof reference === "number" && Number.isFinite(reference) ? reference : null;
  const hasRef = refVal !== null;
  // Bars sit on a zero baseline; lines float in their own range. The domain
  // always widens to include the reference line so it can't clip off-chart.
  const domainVals = refVal !== null ? [...values, refVal] : values;
  const max = Math.max(...domainVals, 1);
  const min = variant === "bars" ? 0 : Math.min(...domainVals, 0);
  const range = max - min || 1;
  const yOf = (v: number) => height - ((v - min) / range) * height;
  const step = VIEW_W / (values.length - 1);
  const points = values
    .map((v, i) => `${(i * step).toFixed(2)},${yOf(v).toFixed(2)}`)
    .join(" ");
  const areaPoints = `0,${height} ${points} ${VIEW_W},${height}`;
  const refY = refVal !== null ? yOf(refVal) : 0;
  const barSlot = VIEW_W / values.length;
  const barW = Math.max(0.5, barSlot * 0.72);

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
      ? (labels?.[hoverIdx] ?? `Point ${hoverIdx + 1} / ${values.length}`)
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
        {variant === "bars" ? (
          values.map((v, i) => {
            const y = yOf(v);
            const x = i * barSlot + (barSlot - barW) / 2;
            return (
              <rect
                key={i}
                x={x}
                y={Math.min(y, height - 0.5)}
                width={barW}
                height={Math.max(0.5, height - y)}
                fill={color}
                opacity={hoverIdx === i ? 1 : 0.8}
                vectorEffect="non-scaling-stroke"
              />
            );
          })
        ) : (
          <>
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
          </>
        )}
        {hasRef && (
          <line
            x1={0}
            x2={VIEW_W}
            y1={refY}
            y2={refY}
            stroke="var(--text-3)"
            strokeWidth={1}
            strokeDasharray="3 2"
            opacity={0.7}
            vectorEffect="non-scaling-stroke"
          />
        )}
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
      {hasRef && referenceLabel && (
        <span
          style={{
            position: "absolute",
            right: 1,
            top: Math.max(0, Math.min(height - 9, refY - 5)),
            fontSize: 8,
            lineHeight: 1,
            color: "var(--text-3)",
            fontVariantNumeric: "tabular-nums",
            pointerEvents: "none",
            background: "var(--surface)",
            padding: "0 1px",
          }}
        >
          {referenceLabel}
        </span>
      )}
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
