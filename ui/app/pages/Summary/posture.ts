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

/** Keys of the pillars that carry a finite score (in weight order). */
export const scoredPillars = (
  pillars: PillarScores,
): (keyof PillarScores)[] =>
  (Object.keys(PILLAR_WEIGHTS) as (keyof PillarScores)[]).filter((k) => {
    const v = pillars[k];
    return v != null && Number.isFinite(v);
  });

/**
 * True when a HIGH-WEIGHT pillar is unmeasured, so the grade — while honestly
 * renormalized — represents less than the full trust picture and should be
 * badged as partial. Threshold defaults to 0.3, so a missing quality pillar
 * (weight 0.35) flags the grade but a missing cost pillar (0.20) does not.
 */
export const isGradeIncomplete = (
  pillars: PillarScores,
  minMissingWeight = 0.3,
): boolean =>
  (Object.keys(PILLAR_WEIGHTS) as (keyof PillarScores)[]).some((k) => {
    const v = pillars[k];
    const missing = v == null || !Number.isFinite(v);
    return missing && PILLAR_WEIGHTS[k] >= minMissingWeight;
  });

/** Oxford-comma join: ["a"] → "a"; ["a","b"] → "a and b"; ["a","b","c"] → "a, b, and c". */
const joinList = (items: string[]): string => {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
};

const capitalize = (s: string): string =>
  s ? s[0].toUpperCase() + s.slice(1) : s;

/**
 * Build the hero headline so it never claims a dimension it didn't measure.
 * `worstLabel` (lowercased) names the pillar needing attention, if any;
 * `scoredLabels` are the pillars that actually contributed to the grade and
 * `missingLabels` the unmeasured ones — both lowercased. When a pillar is
 * unmeasured the headline lists only what was scored and appends "<X> unmeasured".
 */
export const buildPostureHeadline = (
  status: string,
  worstLabel: string | null,
  scoredLabels: string[],
  missingLabels: string[],
  hasIndex: boolean,
): string => {
  if (worstLabel) return `${status} — ${worstLabel} needs attention.`;
  if (!hasIndex) return status;
  const across = scoredLabels.length
    ? `${status} across ${joinList(scoredLabels)}.`
    : status;
  if (missingLabels.length) {
    return `${across} ${capitalize(joinList(missingLabels))} unmeasured.`;
  }
  return across;
};

export type DeltaTone = "flat" | "good" | "warn" | "severe";

/**
 * Classify a KPI delta into a severity tone. `invert` marks metrics where a
 * rise is bad (spend, latency, error, cost). A bad movement whose magnitude
 * reaches `severeAt` (percent, default 50) escalates from "warn" to "severe" so
 * a regression worth paging on reads red instead of the same mild amber as a
 * 3% wobble. Good movements are always "good"; exactly zero is "flat".
 */
export const deltaTone = (
  pct: number,
  opts?: { invert?: boolean; severeAt?: number },
): DeltaTone => {
  if (!Number.isFinite(pct) || pct === 0) return "flat";
  const up = pct > 0;
  const good = opts?.invert ? !up : up;
  if (good) return "good";
  const severeAt = opts?.severeAt ?? 50;
  return Math.abs(pct) >= severeAt ? "severe" : "warn";
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
