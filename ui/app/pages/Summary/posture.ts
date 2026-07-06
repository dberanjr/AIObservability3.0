/**
 * Pure fleet-posture math for the Summary hero band.
 *
 * The "trust index" is a single 0–100 composite of the three Pulse health
 * pillars (operational / quality / cost, from `usePulseHealth`). Because a
 * tenant that emits no evaluation scores has a null `quality` pillar, the blend
 * renormalizes over whichever pillars actually carry data — never fabricating a
 * quality reading. The composite then maps to a letter grade for the hero glyph.
 */

export interface PillarScores {
  operational: number | null;
  quality: number | null;
  cost: number | null;
}

/** Relative weights of each pillar in the composite (renormalized over the
 *  pillars present). Operational health leads, then quality, then cost. */
const PILLAR_WEIGHTS: Record<keyof PillarScores, number> = {
  operational: 0.45,
  quality: 0.35,
  cost: 0.2,
};

/**
 * Weighted-mean composite of the available pillars, 0–100 (rounded). Pillars
 * with `null` scores are dropped and the remaining weights renormalized, so the
 * blend is honest about missing signals. Returns `null` when no pillar has data.
 */
export const compositeTrust = (pillars: PillarScores): number | null => {
  let weighted = 0;
  let weight = 0;
  (Object.keys(PILLAR_WEIGHTS) as (keyof PillarScores)[]).forEach((key) => {
    const score = pillars[key];
    if (score == null || !Number.isFinite(score)) return;
    weighted += score * PILLAR_WEIGHTS[key];
    weight += PILLAR_WEIGHTS[key];
  });
  if (weight === 0) return null;
  return Math.round(weighted / weight);
};

const clamp = (n: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, n));

/** Grade bands (inclusive lower bound → letter). Standard academic cut points. */
const GRADE_BANDS: Array<{ min: number; grade: string }> = [
  { min: 97, grade: "A+" },
  { min: 93, grade: "A" },
  { min: 90, grade: "A-" },
  { min: 87, grade: "B+" },
  { min: 83, grade: "B" },
  { min: 80, grade: "B-" },
  { min: 77, grade: "C+" },
  { min: 73, grade: "C" },
  { min: 70, grade: "C-" },
  { min: 67, grade: "D+" },
  { min: 63, grade: "D" },
  { min: 60, grade: "D-" },
  { min: 0, grade: "F" },
];

/** Map a 0–100 score to a letter grade (input clamped to the range). */
export const scoreToGrade = (score: number): string => {
  const s = clamp(score, 0, 100);
  for (const band of GRADE_BANDS) {
    if (s >= band.min) return band.grade;
  }
  return "F";
};

/**
 * Percent change from the first half of a series to the second half — a simple,
 * noise-tolerant trend cue for the KPI sparklines (avg of the older half vs the
 * newer half). Returns `null` when there's too little data or the baseline half
 * is zero (no meaningful ratio), so the tile can omit the delta rather than show
 * a fabricated one.
 */
export const trendPct = (values: number[]): number | null => {
  if (!Array.isArray(values) || values.length < 2) return null;
  const mid = Math.floor(values.length / 2);
  const first = values.slice(0, mid);
  const second = values.slice(mid);
  const mean = (arr: number[]): number =>
    arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const base = mean(first);
  if (base === 0) return null;
  return Math.round(((mean(second) - base) / base) * 100);
};
