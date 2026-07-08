import React from "react";
import { CATEGORICAL } from "../../theme/palette";

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
  /** Per-slice label (used in hover tooltip and legends). */
  labels?: string[];
  /** Format the value shown on hover. Defaults to integer + " %". */
  valueFormatter?: (n: number) => string;
  /** Per-slice color. Cycled if fewer colors than values. */
  colors?: string[];
  /** Big number rendered in the center. Accepts a node so callers can style
   * parts of it (e.g. a smaller "%" suffix). */
  centerValue?: React.ReactNode;
  centerLabel?: string;
}

// Shared, perceptually-spaced categorical ramp (theme/palette.ts). Fixed hexes
// so the accent Tweak can't collapse two slices onto one hue (UX report
// Chart-3/4). Spread to a mutable array for the default-prop signature.
const DEFAULT_PALETTE = [...CATEGORICAL];

/**
 * Compact donut for the summary tiles. Renders slices proportional to
 * `values`, with an optional integer + label in the center.
 */
export const MiniDonut = ({
  size = 56,
  thickness = 10,
  values,
  labels,
  valueFormatter,
  colors = DEFAULT_PALETTE,
  centerValue,
  centerLabel,
}: MiniDonutProps) => {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 1;
  const rInner = Math.max(0, r - thickness);
  const total = values.reduce((a, b) => a + b, 0);
  const [hoverIdx, setHoverIdx] = React.useState<number | null>(null);

  // -90° to start at 12 o'clock. The arc record keeps both the original
  // index and the slice value so the hover tooltip can show meaningful
  // labels / proportions.
  let angle = -Math.PI / 2;
  const arcs =
    total > 0
      ? values
          .map((v, originalIdx) => ({ v, originalIdx }))
          .filter((p) => p.v > 0)
          .map((p) => {
            const frac = p.v / total;
            const start = angle;
            const end = angle + Math.min(frac * Math.PI * 2, Math.PI * 2 - 0.0001);
            angle = end;
            return {
              d: arcPath(cx, cy, r, rInner, start, end),
              color: colors[p.originalIdx % colors.length],
              value: p.v,
              originalIdx: p.originalIdx,
              percent: frac * 100,
            };
          })
      : [];

  const fmt = valueFormatter ?? ((n: number) => String(Math.round(n)));

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
          arcs.map((a, i) => (
            <path
              key={i}
              d={a.d}
              fill={a.color}
              opacity={hoverIdx == null || hoverIdx === i ? 1 : 0.45}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              style={{ cursor: "pointer", transition: "opacity 100ms" }}
            />
          ))
        ) : (
          <circle cx={cx} cy={cy} r={r} fill="var(--text-4)" opacity={0.25} />
        )}
        <circle cx={cx} cy={cy} r={rInner} fill="var(--surface)" pointerEvents="none" />
      </svg>
      {(centerValue || centerLabel) && hoverIdx == null && (
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
                fontSize: Math.max(14, Math.round(size * 0.28)),
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
            <span
              style={{
                fontSize: Math.max(9, Math.round(size * 0.13)),
                color: "var(--text-3)",
                marginTop: 2,
              }}
            >
              {centerLabel}
            </span>
          )}
        </div>
      )}
      {/* When the user hovers a slice, the center swaps to the slice's
          % + raw value, with the label appearing below in the same
          pop-out style as the donut chart tooltip pattern. */}
      {hoverIdx != null && arcs[hoverIdx] && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            padding: 4,
            textAlign: "center",
          }}
        >
          <span
            style={{
              fontSize: Math.max(13, Math.round(size * 0.22)),
              fontWeight: 700,
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
              color: "var(--text)",
            }}
          >
            {arcs[hoverIdx].percent.toFixed(1)}%
          </span>
          <span
            style={{
              fontSize: Math.max(8, Math.round(size * 0.11)),
              color: "var(--text-3)",
              marginTop: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: size - 12,
            }}
            title={labels?.[arcs[hoverIdx].originalIdx]}
          >
            {labels?.[arcs[hoverIdx].originalIdx] ?? `slice ${arcs[hoverIdx].originalIdx + 1}`}
          </span>
          <span
            style={{
              fontSize: Math.max(8, Math.round(size * 0.11)),
              color: "var(--text-3)",
            }}
          >
            {fmt(arcs[hoverIdx].value)}
          </span>
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
  /** Small second line under the center value (e.g. the numeric score). */
  centerSub?: string;
  /** Draw a faint full-ring track behind the arc (reads as "out of 100"). */
  track?: boolean;
  /** Accessible label describing the value AND its meaning; when set, the gauge
   *  is exposed as role="img" so a screen reader announces both together
   *  (e.g. "Fleet trust index 92 of 100, grade A"). */
  ariaLabel?: string;
}

/**
 * Single-arc donut used for percentage-style tiles (e.g. Token efficiency) and
 * the fleet-posture gauge. With `track`, a faint full ring shows the 0–100
 * scale; `centerSub` stacks a small score under the big center value.
 */
export const MiniPartialDonut = ({
  size = 56,
  thickness = 10,
  percent,
  color = "var(--blue)",
  centerValue,
  centerSub,
  track = false,
  ariaLabel,
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
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      style={{
        position: "relative",
        width: size,
        height: size,
        flex: "0 0 auto",
      }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        {track && (
          <circle
            cx={cx}
            cy={cy}
            r={(r + rInner) / 2}
            fill="none"
            stroke="var(--border)"
            strokeWidth={thickness}
            opacity={0.5}
          />
        )}
        {clamped > 0 && (
          <path d={arcPath(cx, cy, r, rInner, start, end)} fill={color} />
        )}
      </svg>
      {(centerValue || centerSub) && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            color: "var(--text)",
          }}
        >
          {centerValue && (
            <span
              style={{
                fontSize: Math.max(13, Math.round(size * 0.3)),
                fontWeight: 800,
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {centerValue}
            </span>
          )}
          {centerSub && (
            <span
              style={{
                fontSize: Math.max(9, Math.round(size * 0.13)),
                fontWeight: 600,
                lineHeight: 1.1,
                color: "var(--text-3)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {centerSub}
            </span>
          )}
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
  /** Color gradient. Defaults to a colorblind-safe single-hue light→dark
   *  --blue sequential ramp (magnitude, not a red/green good-vs-bad judgment). */
  gradient?: string;
  height?: number;
  /** Pre-formatted value (with unit) surfaced as a native `title` on hover, so
   *  the marker's underlying number is reachable by hovering the scale. */
  valueLabel?: string;
}

/**
 * Thin horizontal gradient bar with a marker dot — used for the Cost /
 * request tile so it has its own visual idiom distinct from donuts and
 * sparklines. The dot's horizontal position encodes where the value falls
 * between `min` and `max`. The track is a single-hue light→dark --blue
 * sequential ramp (colorblind-safe magnitude) rather than the old
 * green→amber→red good/bad gradient (UX report Chart-7); it follows the active
 * accent since it is single-accent UI.
 */
export const MiniScale = ({
  value,
  min = 0,
  max,
  ticks,
  gradient = "linear-gradient(90deg, color-mix(in oklab, var(--blue) 12%, transparent), var(--blue))",
  height = 8,
  valueLabel,
}: MiniScaleProps) => {
  const span = Math.max(1e-9, max - min);
  const frac = Math.max(0, Math.min(1, (value - min) / span));
  const dotSize = 10;

  return (
    <div
      title={valueLabel}
      style={{ position: "relative", width: "100%", paddingTop: dotSize / 2 }}
    >
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
