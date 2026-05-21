import React, { useEffect, useId, useRef, useState } from "react";
import { useTweaks } from "../../tweaks/TweaksContext";

export interface AreaSeries {
  /**
   * Per-bucket value. Use `null` for positions where the series should not
   * render (e.g. historical-only series padded into forecast positions).
   * Nulls break the line and area paths and are skipped in the tooltip and
   * y-axis scaling.
   */
  values: (number | null)[];
  color: string;
  label: string;
  dashed?: boolean;
  /** Right-axis series share x grid with left-axis. Used for the cost overlay. */
  axis?: "left" | "right";
}

/** One labelled x-axis tick. `index` is the bucket position in the series. */
export interface AxisTick {
  index: number;
  label: string;
}

export interface ForecastBand {
  /**
   * Forecast point series, aligned to the same index space as the chart's
   * primary series. Leading historical positions should be `null` so the
   * forecast renders only on the right edge.
   */
  values: (number | null)[];
  /** Lower confidence-band values (null-padded same as `values`). */
  lower: (number | null)[];
  /** Upper confidence-band values (null-padded same as `values`). */
  upper: (number | null)[];
  /** Index where forecast begins — used to draw the "now" divider. */
  startIdx: number;
  color: string;
  label?: string;
  axis?: "left" | "right";
}

/**
 * Time domain for brush-zoom. Caller provides the timestamps (in ms) that
 * correspond to series index 0 and `length - 1`; the chart interpolates
 * intermediate positions and emits ISO ranges on brush release.
 */
export interface ChartTimeDomain {
  startMs: number;
  endMs: number;
}

export interface BrushRange {
  /** ISO datetime string (or DQL `now()-Nh` expression) for the brush start. */
  from: string;
  /** ISO datetime string for the brush end. */
  to: string;
}

export interface AreaChartProps {
  series: AreaSeries[];
  height?: number;
  yTickCount?: number;
  formatLeft?: (n: number) => string;
  formatRight?: (n: number) => string;
  /** Per-bucket x-axis labels — shown in the cursor tooltip when present. */
  xLabels?: string[];
  /**
   * Sparse axis ticks rendered along the bottom edge of the chart.
   * Indices reference positions in the series. Typically 4–8 ticks.
   */
  axisTicks?: AxisTick[];
  /**
   * Optional forecast overlays rendered to the right of the historical data.
   * Multiple bands are supported so a single chart can show, e.g., a token
   * forecast on the left axis AND a derived cost forecast on the right axis.
   * The dashed "now" divider draws once at the smallest `startIdx`.
   */
  forecasts?: ForecastBand[];
  /** Time domain mapped onto the series. Required for brush-zoom to work. */
  xDomain?: ChartTimeDomain;
  /**
   * Fires on mouse-up after a click-and-drag brush. Receives ISO timestamps
   * for the selected range. The chart enforces a minimum drag distance so
   * accidental clicks don't trigger a zoom.
   */
  onBrushSelect?: (range: BrushRange) => void;
}

// VIEW_W is the fallback width used before the ResizeObserver has measured
// the container. Real rendering uses the observed container width so the
// viewBox matches the actual pixel space — that way text stays at native
// font size instead of getting horizontally stretched by preserveAspectRatio="none".
const FALLBACK_VIEW_W = 600;
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
  axisTicks,
  forecasts,
  xDomain,
  onBrushSelect,
}: AreaChartProps) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [tipPx, setTipPx] = useState<number>(0);
  const [containerWidth, setContainerWidth] = useState<number>(FALLBACK_VIEW_W);
  const [brush, setBrush] = useState<{ startPx: number; endPx: number } | null>(
    null,
  );
  const { chartStyle } = useTweaks();
  const gradientId = useId();
  const brushable = Boolean(xDomain && onBrushSelect);

  // Track the container's actual pixel width so the SVG viewBox matches
  // 1:1 and text doesn't get stretched by aspect-ratio scaling.
  useEffect(() => {
    if (!wrapRef.current || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.max(200, Math.floor(entry.contentRect.width));
      setContainerWidth(w);
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const VIEW_W = containerWidth;

  const leftSeries = series.filter((s) => (s.axis ?? "left") === "left");
  const rightSeries = series.filter((s) => s.axis === "right");
  const fcList = forecasts ?? [];
  const leftForecasts = fcList.filter((f) => (f.axis ?? "left") === "left");
  const rightForecasts = fcList.filter((f) => f.axis === "right");
  const length =
    Math.max(
      0,
      ...series.map((s) => s.values.length),
      ...fcList.map((f) => f.values.length),
    ) || 1;

  // Skip nulls when scanning series/forecast for the y-axis max so a
  // null-padded series doesn't NaN-poison the scale.
  const finiteMax = (arr: (number | null)[]): number =>
    arr.reduce<number>((acc, v) => (v != null && v > acc ? v : acc), 0);

  const forecastMax = (forecast: ForecastBand): number =>
    Math.max(finiteMax(forecast.upper), finiteMax(forecast.values));

  const leftMax = niceMax(
    Math.max(
      leftSeries.reduce((acc, s) => Math.max(acc, finiteMax(s.values)), 0),
      leftForecasts.reduce((acc, f) => Math.max(acc, forecastMax(f)), 0),
    ),
  );
  const rightMax = niceMax(
    Math.max(
      rightSeries.reduce((acc, s) => Math.max(acc, finiteMax(s.values)), 0),
      rightForecasts.reduce((acc, f) => Math.max(acc, forecastMax(f)), 0),
    ),
  );

  const innerW = VIEW_W - PAD_L - PAD_R;
  const innerH = height - PAD_T - PAD_B;
  const step = length > 1 ? innerW / (length - 1) : 0;

  // Build an SVG path that breaks across null gaps so a null-padded series
  // doesn't draw a connecting line through the empty region.
  const mkPath = (values: (number | null)[], max: number) => {
    if (values.length === 0 || max <= 0) return "";
    const segments: string[] = [];
    let inSegment = false;
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v == null || !Number.isFinite(v)) {
        inSegment = false;
        continue;
      }
      const x = PAD_L + i * step;
      const y = PAD_T + innerH - (v / max) * innerH;
      segments.push(`${inSegment ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`);
      inSegment = true;
    }
    return segments.join(" ");
  };

  // Area fills one polygon per contiguous non-null segment so the gradient
  // doesn't bleed across nulls.
  const mkArea = (values: (number | null)[], max: number) => {
    if (values.length === 0 || max <= 0) return "";
    const polys: string[] = [];
    let segStart = -1;
    const flush = (endIdx: number) => {
      if (segStart < 0) return;
      const pts: string[] = [];
      for (let i = segStart; i <= endIdx; i++) {
        const v = values[i] as number;
        const x = PAD_L + i * step;
        const y = PAD_T + innerH - (v / max) * innerH;
        pts.push(`${i === segStart ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`);
      }
      const baseY = PAD_T + innerH;
      const xEnd = PAD_L + endIdx * step;
      const xStart = PAD_L + segStart * step;
      polys.push(
        `${pts.join(" ")} L${xEnd.toFixed(2)},${baseY} L${xStart.toFixed(2)},${baseY} Z`,
      );
      segStart = -1;
    };
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v == null || !Number.isFinite(v)) {
        if (segStart >= 0) flush(i - 1);
        continue;
      }
      if (segStart < 0) segStart = i;
    }
    if (segStart >= 0) flush(values.length - 1);
    return polys.join(" ");
  };

  const yTicks = Array.from({ length: yTickCount + 1 }, (_, i) => i / yTickCount);
  const yPos = (frac: number) => PAD_T + innerH - frac * innerH;

  const cursorPx = (clientX: number): number | null => {
    const wrap = wrapRef.current;
    if (!wrap) return null;
    const rect = wrap.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const cursor = clientX - rect.left;
    return Math.max(PAD_L, Math.min(VIEW_W - PAD_R, cursor));
  };

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const clamped = cursorPx(e.clientX);
    if (clamped == null || length <= 1) return;
    if (brush) {
      setBrush({ ...brush, endPx: clamped });
      // Suppress the hover tooltip while brushing so the selection rect is
      // the only thing the user is reading.
      setHoverIdx(null);
      return;
    }
    const innerWPx = VIEW_W - PAD_L - PAD_R;
    const idx = Math.round(((clamped - PAD_L) / innerWPx) * (length - 1));
    setHoverIdx(idx);
    setTipPx(clamped);
  };
  const handleLeave = () => {
    setHoverIdx(null);
    // Cancel an in-progress brush if the cursor leaves the chart entirely.
    setBrush(null);
  };

  /** Map a container pixel position to an ISO timestamp using xDomain. */
  const pixelToTime = (px: number): string | null => {
    if (!xDomain) return null;
    const innerWPx = VIEW_W - PAD_L - PAD_R;
    const frac = Math.max(0, Math.min(1, (px - PAD_L) / innerWPx));
    const ms = xDomain.startMs + frac * (xDomain.endMs - xDomain.startMs);
    return new Date(ms).toISOString();
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!brushable || e.button !== 0) return;
    const px = cursorPx(e.clientX);
    if (px == null) return;
    setBrush({ startPx: px, endPx: px });
    setHoverIdx(null);
    e.preventDefault();
  };

  const handleMouseUp = () => {
    if (!brush || !brushable || !onBrushSelect || !xDomain) {
      setBrush(null);
      return;
    }
    const lo = Math.min(brush.startPx, brush.endPx);
    const hi = Math.max(brush.startPx, brush.endPx);
    // Require ~12px drag to count as a brush — anything smaller is treated
    // as an accidental click and ignored.
    if (hi - lo < 12) {
      setBrush(null);
      return;
    }
    const from = pixelToTime(lo);
    const to = pixelToTime(hi);
    setBrush(null);
    if (from && to && from !== to) {
      onBrushSelect({ from, to });
    }
  };

  return (
    <div
      ref={wrapRef}
      style={{
        position: "relative",
        width: "100%",
        height,
        cursor: brushable ? (brush ? "ew-resize" : "crosshair") : "default",
        userSelect: brush ? "none" : undefined,
      }}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      <svg
        width={VIEW_W}
        height={height}
        viewBox={`0 0 ${VIEW_W} ${height}`}
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

        {axisTicks?.map((tick) => {
          const x = PAD_L + tick.index * step;
          if (x < PAD_L || x > VIEW_W - PAD_R) return null;
          // Edge-anchor the first and last labels so they don't get clipped
          // by the chart frame.
          const anchor: "start" | "middle" | "end" =
            tick.index === 0
              ? "start"
              : tick.index === length - 1
                ? "end"
                : "middle";
          return (
            <g key={`xt-${tick.index}`}>
              <line
                x1={x}
                x2={x}
                y1={PAD_T + innerH}
                y2={PAD_T + innerH + 3}
                stroke="var(--text-3)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={x}
                y={PAD_T + innerH + 14}
                fontSize={9}
                textAnchor={anchor}
                fill="var(--text-3)"
                fontFamily="var(--mono, monospace)"
              >
                {tick.label}
              </text>
            </g>
          );
        })}

        {/* Per-series gradient defs only used when the Tweaks chart-style
            is set to "gradient" — opacity fades from ~25% at the line to 0%
            at the baseline. */}
        {chartStyle === "gradient" && (
          <defs>
            {leftSeries.map((s, i) => (
              <linearGradient
                key={`g${i}`}
                id={`${gradientId}-l-${i}`}
                x1={0}
                x2={0}
                y1={0}
                y2={1}
              >
                <stop offset="0%" stopColor={s.color} stopOpacity={0.5} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.1} />
              </linearGradient>
            ))}
          </defs>
        )}

        {chartStyle !== "line" &&
          leftSeries.map((s, i) => (
            <path
              key={`a${i}`}
              d={mkArea(s.values, leftMax)}
              fill={
                chartStyle === "gradient"
                  ? `url(#${gradientId}-l-${i})`
                  : s.color
              }
              opacity={chartStyle === "gradient" ? 1 : 0.15}
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

        {fcList.length > 0 &&
          (() => {
            // Render each forecast band (paths + line). The "now" divider
            // draws once at the smallest startIdx across all forecasts.
            const earliestStart = fcList.reduce(
              (acc, f) => Math.min(acc, f.startIdx),
              Number.POSITIVE_INFINITY,
            );
            const dividerX =
              Number.isFinite(earliestStart) && earliestStart >= 0
                ? PAD_L + earliestStart * step
                : null;

            const bandsAndLines = fcList.map((f, idx) => {
              const maxForAxis =
                (f.axis ?? "left") === "right" ? rightMax : leftMax;
              if (maxForAxis <= 0) return null;

              const upperPts: string[] = [];
              const lowerPts: string[] = [];
              for (let i = 0; i < f.values.length; i++) {
                const u = f.upper[i];
                const l = f.lower[i];
                if (u == null || l == null) continue;
                const x = PAD_L + i * step;
                upperPts.push(
                  `${x.toFixed(2)},${(PAD_T + innerH - (u / maxForAxis) * innerH).toFixed(2)}`,
                );
                lowerPts.push(
                  `${x.toFixed(2)},${(PAD_T + innerH - (l / maxForAxis) * innerH).toFixed(2)}`,
                );
              }
              const bandPath =
                upperPts.length > 0 && lowerPts.length > 0
                  ? `M${upperPts.join(" L")} L${lowerPts.reverse().join(" L")} Z`
                  : "";

              const forecastPath = f.values
                .map((v, i) => {
                  if (v == null) return null;
                  const x = PAD_L + i * step;
                  const y = PAD_T + innerH - (v / maxForAxis) * innerH;
                  return `${x.toFixed(2)},${y.toFixed(2)}`;
                })
                .filter((p): p is string => p !== null);
              const linePath =
                forecastPath.length > 0 ? `M${forecastPath.join(" L")}` : "";

              return (
                <g key={`fc-${idx}`}>
                  {bandPath && (
                    <path d={bandPath} fill={f.color} opacity={0.18} />
                  )}
                  {linePath && (
                    <path
                      d={linePath}
                      fill="none"
                      stroke={f.color}
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                </g>
              );
            });

            return (
              <g>
                {bandsAndLines}
                {dividerX != null && (
                  <>
                    <line
                      x1={dividerX}
                      x2={dividerX}
                      y1={PAD_T}
                      y2={PAD_T + innerH}
                      stroke="var(--text-3)"
                      strokeWidth={1}
                      strokeDasharray="3 2"
                      vectorEffect="non-scaling-stroke"
                      opacity={0.6}
                    />
                    <text
                      x={dividerX + 4}
                      y={PAD_T + 10}
                      fontSize={9}
                      fill="var(--text-3)"
                      fontFamily="var(--mono, monospace)"
                    >
                      now
                    </text>
                  </>
                )}
              </g>
            );
          })()}

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

        {brush &&
          (() => {
            const lo = Math.min(brush.startPx, brush.endPx);
            const hi = Math.max(brush.startPx, brush.endPx);
            return (
              <g>
                <rect
                  x={lo}
                  y={PAD_T}
                  width={Math.max(0, hi - lo)}
                  height={innerH}
                  fill="var(--blue)"
                  opacity={0.12}
                />
                <line
                  x1={lo}
                  x2={lo}
                  y1={PAD_T}
                  y2={PAD_T + innerH}
                  stroke="var(--blue)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
                <line
                  x1={hi}
                  x2={hi}
                  y1={PAD_T}
                  y2={PAD_T + innerH}
                  stroke="var(--blue)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })()}
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
          {fcList.map((f, idx) => {
            const v = f.values[hoverIdx];
            if (v == null) return null;
            const fmt =
              ((f.axis ?? "left") === "right" ? formatRight : formatLeft) ??
              ((n: number) => String(Math.round(n)));
            const lo = f.lower[hoverIdx];
            const hi = f.upper[hoverIdx];
            return (
              <React.Fragment key={`fc-tt-${idx}`}>
                <div
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      background: f.color,
                      flex: "0 0 auto",
                    }}
                  />
                  <span style={{ color: "var(--text-3)" }}>
                    {f.label ?? "Forecast"}
                  </span>
                  <span style={{ fontWeight: 600, marginLeft: "auto" }}>
                    {fmt(v)}
                  </span>
                </div>
                {lo != null && hi != null && (
                  <div
                    style={{
                      color: "var(--text-3)",
                      fontSize: 10,
                      textAlign: "right",
                    }}
                  >
                    band {fmt(lo)} – {fmt(hi)}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
};
