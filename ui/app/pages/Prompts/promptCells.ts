// Pure presentational helpers for the Prompts table + quality panel cells.
// Kept out of the .tsx components so the colour / formatting logic is unit
// testable without pulling in Strato UI.

import type { SemanticStatus } from "../../theme/statusColor";
import { fmtUSDCents } from "../../data/format";

/**
 * Quality-score colour ramp (percent scale). Shared by the aggregate quality
 * panel and the per-row Evaluations table so both read the same thresholds.
 * `inverted` metrics (hallucination) are bad when HIGH; the rest are bad when
 * LOW. Reserves saturated red strictly for genuine failure (Prompts-3).
 */
export const qualityColor = (pct: number | null, inverted?: boolean): string => {
  if (pct == null) return "var(--text-4)";
  if (inverted) {
    if (pct > 10) return "var(--red)";
    if (pct > 3) return "var(--amber)";
    return "var(--green-2)";
  }
  if (pct < 60) return "var(--red)";
  if (pct < 80) return "var(--amber)";
  return "var(--green-2)";
};

/**
 * Temperature colour band — a cold→hot ramp that deliberately AVOIDS the
 * red/amber/green failure palette (Prompts-3): a benign high temperature should
 * not read like an error. Blue (deterministic) → violet (creative), with a hot
 * magenta at the very top that never touches pure red.
 */
export const tempColor = (t: number): string => {
  if (t <= 0.3) return "var(--blue)";
  if (t <= 0.6) return "color-mix(in oklab, var(--blue) 55%, var(--purple))";
  if (t <= 0.85) return "var(--purple)";
  return "color-mix(in oklab, var(--purple) 60%, var(--red) 40%)";
};

export type AnomalyLevel = "none" | "elevated" | "outlier";

export interface Thr {
  p90: number;
  p98: number;
}

/**
 * Classify a value against its column thresholds. Returns a LEVEL (not a
 * colour): the row renderer turns "elevated" into bold weight and "outlier"
 * into bold + a ▲ marker, so anomalies are cued WITHOUT stealing the red/amber
 * that now means failure only (Prompts-3).
 */
export const anomalyLevel = (value: number, t: Thr | null): AnomalyLevel => {
  if (!t || value <= 0) return "none";
  if (value >= t.p98) return "outlier";
  if (value >= t.p90) return "elevated";
  return "none";
};

/**
 * Format an estimated per-row cost (cents) so sub-cent micro-values stay
 * comparable at a glance (Prompts-8). Costs here are typically a fraction of a
 * cent, where `$0.00042` is unreadable — show fractional cents instead, and
 * only fall back to dollars once a row crosses $1.
 *
 * Delegates to the shared {@link fmtUSDCents} so the cents-formatting logic
 * lives in exactly one place (data/format.ts) — CONS-3. The export name is kept
 * so the PromptsTable / TraceTopology imports need no change.
 */
export const fmtCentsCost = (cents: number): string => fmtUSDCents(cents);

export interface CoverageLabel {
  text: string;
  /** True when the sampled coverage is a tiny share of the population. */
  low: boolean;
}

/**
 * Render eval coverage as a fraction of the LLM-span population, not a bare
 * count (Prompts-6): "18 of 50,000 LLM spans scored (0.04%)". Flags coverage
 * below 1% as `low` so the UI can warn against over-trusting the average.
 */
export const coverageLabel = (coverage: number, total: number): CoverageLabel => {
  if (!Number.isFinite(total) || total <= 0) {
    return {
      text: `${coverage.toLocaleString()} spans with this attribute`,
      low: false,
    };
  }
  const pct = (coverage / total) * 100;
  const pctText = pct >= 10 ? `${Math.round(pct)}%` : `${pct.toFixed(pct < 1 ? 2 : 1)}%`;
  return {
    text: `${coverage.toLocaleString()} of ${total.toLocaleString()} LLM spans scored (${pctText})`,
    low: pct < 1,
  };
};

/**
 * Map a non-negative KPI count to a semantic status so a tile's severity is
 * routed through the shared statusColor / STATUS_CUE vocabulary instead of a
 * local amber/red ternary — and can therefore carry a non-color glyph cue too
 * (cross-cutting CONSISTENCY / A11Y). Zero (or invalid) is "neutral"; any
 * positive count is "warning"; a count strictly greater than `severeAt` (when
 * given) escalates to "critical". This preserves the existing thresholds:
 * errors use severeAt=5 (>5 red, 1–5 amber); PII / warnings / truncated warn on
 * any positive count.
 */
export const countSeverity = (n: number, severeAt?: number): SemanticStatus => {
  if (!Number.isFinite(n) || n <= 0) return "neutral";
  if (severeAt != null && n > severeAt) return "critical";
  return "warning";
};
