import React from "react";
import { useSampling } from "../scope/SamplingContext";

/**
 * Human phrasing of an active sampling ratio: "1-in-100 sample (~1%)".
 * `samplingRatio` 1 means no sampling (every matching row is read); a value > 1
 * means Grail scans 1 in N rows, so count/sum aggregates under-report ~N× and
 * are extrapolated back up.
 */
export const describeSampling = (ratio: number): string => {
  const pct = 100 / ratio;
  const pctLabel = pct >= 1 ? `${Math.round(pct)}%` : `${pct.toPrecision(1)}%`;
  return `1-in-${ratio.toLocaleString()} sample (~${pctLabel})`;
};

const samplingTooltip = (ratio: number): string =>
  `Sampling is on: Grail scans 1 in ${ratio.toLocaleString()} matching rows. ` +
  `Count and spend totals on this page are extrapolated ×${ratio.toLocaleString()} ` +
  `from that sample, so they are estimates — not exact. Percentiles, rates and ` +
  `averages are unaffected. Set Sampling to "None" in the toolbar for exact counts.`;

// Tooltip for a per-tile sampling OVERRIDE (scan-6): this estimate forces its
// own, coarser ratio regardless of the toolbar, so the "set Sampling to None"
// advice above would be wrong — lowering the toolbar can't make this tile exact.
const overrideTooltip = (ratio: number): string =>
  `This estimate is always computed from a ${describeSampling(ratio)}, ` +
  `regardless of the toolbar Sampling setting, so its heavy scan can finish ` +
  `within the query time limit. The value is extrapolated ×${ratio.toLocaleString()} ` +
  `from that sample — an estimate, not exact.`;

/**
 * Always-visible disclosure that the page's count/spend numbers are
 * EXTRAPOLATED from a sample rather than counted exactly. Renders nothing when
 * sampling is off (effective ratio <= 1), so it's safe to drop anywhere.
 *
 * Reusable primitive (scan-3): the status line uses `variant="full"` for a
 * prominent chip; individual extrapolated numbers can wear `variant="compact"`
 * (a small "≈ est." badge) next to the value. Pass an explicit `ratio` to
 * disclose a per-tile sampling override that differs from the toolbar (scan-6);
 * omit it to follow the global toolbar ratio.
 *
 * Semantic amber treatment (the "not-exact / caveat" color already used by
 * EstimatedBadge), tokened so it works in both light and dark themes.
 */
export const SamplingBadge = ({
  ratio,
  variant = "compact",
}: {
  ratio?: number;
  variant?: "compact" | "full";
}) => {
  const { samplingRatio } = useSampling();
  const effective = ratio ?? samplingRatio;
  if (!(effective > 1)) return null;

  // A per-tile override discloses a ratio that DIFFERS from the toolbar (scan-6);
  // when it matches (or no explicit ratio is passed) it just mirrors the toolbar.
  const isOverride = ratio != null && ratio !== samplingRatio;
  const full = variant === "full";
  const style: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: full ? 10.5 : 10,
    fontWeight: 600,
    letterSpacing: "0.03em",
    color: "var(--amber)",
    border: "1px solid var(--amber)",
    background: "color-mix(in oklab, var(--amber) 12%, transparent)",
    borderRadius: full ? 999 : 4,
    padding: full ? "2px 8px" : "1px 5px",
    whiteSpace: "nowrap",
  };

  return (
    <span
      role="note"
      title={(isOverride ? overrideTooltip : samplingTooltip)(effective)}
      style={style}
    >
      <span aria-hidden>≈</span>
      {full ? ` Extrapolated from a ${describeSampling(effective)}` : " est."}
    </span>
  );
};
