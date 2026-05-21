import React, { useEffect, useRef, useState } from "react";
import type { BrushRange, ChartTimeDomain } from "./AreaChart";

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
  /** Time domain mapped onto the bars — required for brush-zoom. */
  xDomain?: ChartTimeDomain;
  /** Fires on mouse-up after a click-and-drag brush. */
  onBrushSelect?: (range: BrushRange) => void;
}

// Fallback width used before the ResizeObserver fires; real rendering uses
// the observed container width so SVG text isn't aspect-stretched.
const FALLBACK_VIEW_W = 600;
const PAD_L = 28;
const PAD_R = 8;
const PAD_T = 8;
// Just enough room for the 9px hour labels.
const PAD_B = 14;

export const Histogram = ({
  bars,
  height = 180,
  color = "var(--blue)",
  highlightColor = "var(--purple-2)",
  xLabels = 6,
  valueFormatter = (n) => String(Math.round(n)),
  xDomain,
  onBrushSelect,
}: HistogramProps) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [tipPx, setTipPx] = useState<number>(0);
  const [containerWidth, setContainerWidth] = useState<number>(FALLBACK_VIEW_W);
  const [brush, setBrush] = useState<{ startPx: number; endPx: number } | null>(
    null,
  );

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
  const innerW = VIEW_W - PAD_L - PAD_R;
  const innerH = height - PAD_T - PAD_B;
  const max = Math.max(1, ...bars.map((b) => b.value));
  const slot = bars.length > 0 ? innerW / bars.length : innerW;
  const barW = Math.max(2, slot * 0.7);
  const labelEvery = bars.length > 0 ? Math.max(1, Math.ceil(bars.length / xLabels)) : 1;
  const brushable = Boolean(xDomain && onBrushSelect);

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
    if (clamped == null || bars.length === 0) return;
    if (brush) {
      setBrush({ ...brush, endPx: clamped });
      setHoverIdx(null);
      return;
    }
    const innerWPx = VIEW_W - PAD_L - PAD_R;
    const idx = Math.min(
      bars.length - 1,
      Math.max(0, Math.floor(((clamped - PAD_L) / innerWPx) * bars.length)),
    );
    setHoverIdx(idx);
    setTipPx(clamped);
  };
  const handleLeave = () => {
    setHoverIdx(null);
    setBrush(null);
  };

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
    if (hi - lo < 12) {
      setBrush(null);
      return;
    }
    const from = pixelToTime(lo);
    const to = pixelToTime(hi);
    setBrush(null);
    if (from && to && from !== to) onBrushSelect({ from, to });
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
