import React, { useRef, useState } from "react";

export interface AreaSeries {
  values: number[];
  color: string;
  label: string;
  dashed?: boolean;
  /** Right-axis series share x grid with left-axis. Used for the cost overlay. */
  axis?: "left" | "right";
}

export interface AreaChartProps {
  series: AreaSeries[];
  height?: number;
  yTickCount?: number;
  formatLeft?: (n: number) => string;
  formatRight?: (n: number) => string;
  /** Per-bucket x-axis labels — shown in the cursor tooltip when present. */
  xLabels?: string[];
}

const VIEW_W = 600;
const PAD_L = 44;
const PAD_R = 44;
const PAD_T = 12;
const PAD_B = 22;

const niceMax = (max: number): number => {
  if (max <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(max)));
  const f = max / exp;
  let nf = 1;
  if (f <= 1) nf = 1;
  else if (f <= 2) nf = 2;
  else if (f <= 5) nf = 5;
  else nf = 10;
  return nf * exp;
};

/**
 * Dual-axis area chart (left axis = primary, right axis = optional secondary)
 * with a cursor-tracking hover tooltip that surfaces every series value at
 * the cursor's x position.
 */
export const AreaChart = ({
  series,
  height = 220,
  yTickCount = 4,
  formatLeft,
  formatRight,
  xLabels,
}: AreaChartProps) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [tipPx, setTipPx] = useState<number>(0);

  const leftSeries = series.filter((s) => (s.axis ?? "left") === "left");
  const rightSeries = series.filter((s) => s.axis === "right");
  const length =
    Math.max(0, ...series.map((s) => s.values.length)) || 1;

  const leftMax = niceMax(
    leftSeries.reduce(
      (acc, s) => Math.max(acc, ...s.values, 0),
      0,
    ),
  );
  const rightMax = niceMax(
    rightSeries.reduce(
      (acc, s) => Math.max(acc, ...s.values, 0),
      0,
    ),
  );

  const innerW = VIEW_W - PAD_L - PAD_R;
  const innerH = height - PAD_T - PAD_B;
  const step = length > 1 ? innerW / (length - 1) : 0;

  const mkPath = (values: number[], max: number) => {
    if (values.length === 0 || max <= 0) return "";
    return values
      .map((v, i) => {
        const x = PAD_L + i * step;
        const y = PAD_T + innerH - (v / max) * innerH;
        return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  };

  const mkArea = (values: number[], max: number) => {
    if (values.length === 0 || max <= 0) return "";
    const path = mkPath(values, max);
    const last = `L${(PAD_L + (values.length - 1) * step).toFixed(2)},${PAD_T + innerH} L${PAD_L},${PAD_T + innerH} Z`;
    return `${path} ${last}`;
  };

  const yTicks = Array.from({ length: yTickCount + 1 }, (_, i) => i / yTickCount);
  const yPos = (frac: number) => PAD_T + innerH - frac * innerH;

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    if (rect.width <= 0 || length <= 1) return;
    // Plot area maps from PAD_L px to VIEW_W - PAD_R px in viewBox coords;
    // since preserveAspectRatio="none", x scales linearly with container width.
    const containerL = (PAD_L / VIEW_W) * rect.width;
    const containerR = ((VIEW_W - PAD_R) / VIEW_W) * rect.width;
    const cursor = e.clientX - rect.left;
    const clamped = Math.max(containerL, Math.min(containerR, cursor));
    const innerWPx = containerR - containerL;
    const idx = Math.round(((clamped - containerL) / innerWPx) * (length - 1));
    setHoverIdx(idx);
    setTipPx(clamped);
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
        aria-label="Token consumption over time"
      >
        {yTicks.map((t) => (
          <line
            key={t}
            x1={PAD_L}
            x2={VIEW_W - PAD_R}
            y1={yPos(t)}
            y2={yPos(t)}
            stroke="var(--border)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {yTicks.map((t) => (
          <text
            key={`l${t}`}
            x={PAD_L - 6}
            y={yPos(t) + 3}
            fontSize={9}
            textAnchor="end"
            fill="var(--text-3)"
            fontFamily="var(--mono, monospace)"
          >
            {formatLeft ? formatLeft(leftMax * t) : Math.round(leftMax * t)}
          </text>
        ))}

        {rightSeries.length > 0 &&
          yTicks.map((t) => (
            <text
              key={`r${t}`}
              x={VIEW_W - PAD_R + 6}
              y={yPos(t) + 3}
              fontSize={9}
              textAnchor="start"
              fill="var(--text-3)"
              fontFamily="var(--mono, monospace)"
            >
              {formatRight ? formatRight(rightMax * t) : Math.round(rightMax * t)}
            </text>
          ))}

        {leftSeries.map((s, i) => (
          <path
            key={`a${i}`}
            d={mkArea(s.values, leftMax)}
            fill={s.color}
            opacity={0.15}
          />
        ))}

        {leftSeries.map((s, i) => (
          <path
            key={`l${i}`}
            d={mkPath(s.values, leftMax)}
            fill="none"
            stroke={s.color}
            strokeWidth={1.5}
            strokeDasharray={s.dashed ? "4 3" : undefined}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {rightSeries.map((s, i) => (
          <path
            key={`r${i}`}
            d={mkPath(s.values, rightMax)}
            fill="none"
            stroke={s.color}
            strokeWidth={1.5}
            strokeDasharray={s.dashed ? "4 3" : undefined}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {hoverIdx != null && (
          <>
            <line
              x1={PAD_L + hoverIdx * step}
              x2={PAD_L + hoverIdx * step}
              y1={PAD_T}
              y2={PAD_T + innerH}
              stroke="var(--text-3)"
              strokeWidth={1}
              strokeDasharray="2 2"
              vectorEffect="non-scaling-stroke"
            />
            {leftSeries.map((s, i) => {
              const v = s.values[hoverIdx];
              if (v == null) return null;
              const y = PAD_T + innerH - (v / leftMax) * innerH;
              return (
                <circle
                  key={`lh${i}`}
                  cx={PAD_L + hoverIdx * step}
                  cy={y}
                  r={3}
                  fill={s.color}
                  stroke="var(--surface)"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
            {rightSeries.map((s, i) => {
              const v = s.values[hoverIdx];
              if (v == null) return null;
              const y = PAD_T + innerH - (v / rightMax) * innerH;
              return (
                <circle
                  key={`rh${i}`}
                  cx={PAD_L + hoverIdx * step}
                  cy={y}
                  r={3}
                  fill={s.color}
                  stroke="var(--surface)"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </>
        )}
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
            padding: "6px 8px",
            fontSize: 11,
            color: "var(--text)",
            fontVariantNumeric: "tabular-nums",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            boxShadow: "var(--shadow, 0 2px 8px rgba(0,0,0,0.06))",
            zIndex: 2,
            display: "flex",
            flexDirection: "column",
            gap: 3,
          }}
        >
          {xLabels?.[hoverIdx] && (
            <div style={{ color: "var(--text-3)", fontSize: 10 }}>
              {xLabels[hoverIdx]}
            </div>
          )}
          {series.map((s, i) => {
            const v = s.values[hoverIdx];
            if (v == null) return null;
            const fmt =
              (s.axis === "right" ? formatRight : formatLeft) ??
              ((n: number) => String(Math.round(n)));
            return (
              <div
                key={i}
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: s.color,
                    flex: "0 0 auto",
                  }}
                />
                <span style={{ color: "var(--text-3)" }}>{s.label}</span>
                <span style={{ fontWeight: 600, marginLeft: "auto" }}>
                  {fmt(v)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
