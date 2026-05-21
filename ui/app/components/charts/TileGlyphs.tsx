import React from "react";

/**
 * Small inline SVG primitives used inside the Pulse summary tiles. They're
 * 100% self-contained (no Strato deps) so each tile stays inexpensive to
 * render even when several mount at once.
 */

const polarToCartesian = (
  cx: number,
  cy: number,
  r: number,
  angleRad: number,
) => ({
  x: cx + Math.cos(angleRad) * r,
  y: cy + Math.sin(angleRad) * r,
});

const arcPath = (
  cx: number,
  cy: number,
  r: number,
  rInner: number,
  startAngle: number,
  endAngle: number,
): string => {
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  const a = polarToCartesian(cx, cy, r, startAngle);
  const b = polarToCartesian(cx, cy, r, endAngle);
  const c = polarToCartesian(cx, cy, rInner, endAngle);
  const d = polarToCartesian(cx, cy, rInner, startAngle);
  return [
    `M ${a.x} ${a.y}`,
    `A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y}`,
    `L ${c.x} ${c.y}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${d.x} ${d.y}`,
    "Z",
  ].join(" ");
};

export interface MiniDonutProps {
  size?: number;
  thickness?: number;
  /** Slices are taken as fractions of the sum. */
  values: number[];
  /** Per-slice color. Cycled if fewer colors than values. */
  colors?: string[];
  /** Big number rendered in the center. */
  centerValue?: string;
  centerLabel?: string;
}

const DEFAULT_PALETTE = [
  "var(--blue)",
  "var(--purple-2)",
  "var(--cyan)",
  "var(--green-2)",
  "var(--pink)",
  "var(--amber)",
  "var(--blue-purple)",
  "var(--purple-dark)",
  "var(--red)",
  "var(--green-lime)",
];

/**
 * Compact donut for the summary tiles. Renders slices proportional to
 * `values`, with an optional integer + label in the center.
 */
export const MiniDonut = ({
  size = 56,
  thickness = 10,
  values,
  colors = DEFAULT_PALETTE,
  centerValue,
  centerLabel,
}: MiniDonutProps) => {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 1;
  const rInner = Math.max(0, r - thickness);
  const total = values.reduce((a, b) => a + b, 0);

  // -90° to start at 12 o'clock.
  let angle = -Math.PI / 2;
  const arcs =
    total > 0
      ? values
          .filter((v) => v > 0)
          .map((v, i) => {
            const frac = v / total;
            const start = angle;
            // Small numerical guard so a single-slice donut still renders.
            const end = angle + Math.min(frac * Math.PI * 2, Math.PI * 2 - 0.0001);
            angle = end;
            return {
              d: arcPath(cx, cy, r, rInner, start, end),
              color: colors[i % colors.length],
            };
          })
      : [];

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        flex: "0 0 auto",
      }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        {total > 0 ? (
          arcs.map((a, i) => <path key={i} d={a.d} fill={a.color} />)
        ) : (
          <circle cx={cx} cy={cy} r={r} fill="var(--text-4)" opacity={0.25} />
        )}
        <circle cx={cx} cy={cy} r={rInner} fill="var(--surface)" />
      </svg>
      {(centerValue || centerLabel) && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          {centerValue && (
            <span
              style={{
                fontSize: 16,
                fontWeight: 700,
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
                color: "var(--text)",
              }}
            >
              {centerValue}
            </span>
          )}
          {centerLabel && (
            <span style={{ fontSize: 8, color: "var(--text-3)", marginTop: 1 }}>
              {centerLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export interface MiniPartialDonutProps {
  size?: number;
  thickness?: number;
  /** 0–100; the arc fills proportionally clockwise from 12 o'clock. */
  percent: number;
  color?: string;
  /** Optional center text (already formatted by the caller). */
  centerValue?: string;
}

/**
 * Single-arc donut used for percentage-style tiles (e.g. Token efficiency).
 * Background track is a faint full ring; the filled arc spans `percent`%.
 */
export const MiniPartialDonut = ({
  size = 56,
  thickness = 10,
  percent,
  color = "var(--blue)",
  centerValue,
}: MiniPartialDonutProps) => {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 1;
  const rInner = Math.max(0, r - thickness);
  const clamped = Math.max(0, Math.min(100, percent));
  // Full ring is 2π; render the filled portion as one arc from 12 o'clock.
  const start = -Math.PI / 2;
  const sweep = (clamped / 100) * Math.PI * 2;
  // Guard against full-circle arc which can render incorrectly with the
  // standard arcPath (use ε reduction).
  const end = start + Math.min(sweep, Math.PI * 2 - 0.0001);

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        flex: "0 0 auto",
      }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={cx} cy={cy} r={r} fill="var(--text-4)" opacity={0.15} />
        {clamped > 0 && (
          <path d={arcPath(cx, cy, r, rInner, start, end)} fill={color} />
        )}
        <circle cx={cx} cy={cy} r={rInner} fill="var(--surface)" />
      </svg>
      {centerValue && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            fontSize: 13,
            fontWeight: 700,
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
            color: "var(--text)",
          }}
        >
          {centerValue}
        </div>
      )}
    </div>
  );
};

export interface MiniScaleProps {
  /** Current value plotted along the scale. */
  value: number;
  /** Left-end value (typically 0). */
  min?: number;
  /** Right-end value. Values >= max are clamped to the right edge. */
  max: number;
  /** Optional tick markers (in the same units as value) for quick context. */
  ticks?: number[];
  /** Color gradient. Defaults to a green→amber→red "intensity" gradient. */
  gradient?: string;
  height?: number;
}

/**
 * Thin horizontal gradient bar with a marker dot — used for the Cost /
 * request tile so it has its own visual idiom distinct from donuts and
 * sparklines. The dot's horizontal position encodes where the value falls
 * between `min` and `max`.
 */
export const MiniScale = ({
  value,
  min = 0,
  max,
  ticks,
  gradient = "linear-gradient(90deg, var(--green-2), var(--amber), var(--red))",
  height = 8,
}: MiniScaleProps) => {
  const span = Math.max(1e-9, max - min);
  const frac = Math.max(0, Math.min(1, (value - min) / span));
  const dotSize = 10;

  return (
    <div style={{ position: "relative", width: "100%", paddingTop: dotSize / 2 }}>
      <div
        style={{
          height,
          borderRadius: height,
          background: gradient,
          opacity: 0.85,
        }}
      />
      {ticks?.map((t) => {
        const tf = Math.max(0, Math.min(1, (t - min) / span));
        return (
          <span
            key={t}
            aria-hidden
            style={{
              position: "absolute",
              top: dotSize / 2,
              left: `calc(${tf * 100}% - 1px)`,
              width: 2,
              height,
              background: "var(--surface)",
              opacity: 0.5,
            }}
          />
        );
      })}
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          left: `calc(${frac * 100}% - ${dotSize / 2}px)`,
          width: dotSize,
          height: dotSize,
          borderRadius: "50%",
          background: "var(--surface)",
          border: "2px solid var(--text)",
          boxShadow: "0 1px 2px rgba(0,0,0,0.18)",
        }}
      />
    </div>
  );
};
