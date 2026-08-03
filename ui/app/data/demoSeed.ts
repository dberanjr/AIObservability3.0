/**
 * Small, generic helpers shared by every page's Demo Mode dataset (see
 * ui/app/bedrock/demoData.ts for the pattern this generalizes). Kept
 * side-effect-free and framework-agnostic so any `demoData.ts` can turn a
 * hand-tuned "total + variance shape" into a bucketed series without
 * duplicating the same arithmetic per domain.
 */

/** Sum of a number array. */
export const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

/**
 * Splits `total` across `weights.length` buckets proportionally to `weights`
 * (need not sum to 1), fixing integer-rounding drift onto the largest bucket
 * so the parts sum back to exactly `total`.
 */
export const distribute = (total: number, weights: number[]): number[] => {
  const wsum = sum(weights);
  const raw = weights.map((w) => (wsum > 0 ? (total * w) / wsum : 0));
  const floored = raw.map((x) => Math.round(x));
  const drift = total - sum(floored);
  const peakIdx = floored.indexOf(Math.max(...floored));
  if (peakIdx >= 0) floored[peakIdx] += drift;
  return floored;
};

/** Positive per-bucket weights from a signed variance shape (mean ≈ 0). */
export const weightsOf = (shape: number[]): number[] => shape.map((v) => 1 + v);

/** Bucketed series whose MAX equals `peak` (for `arrayMax`-folded metrics). */
export const seriesWithPeak = (peak: number, shape: number[]): number[] => {
  const maxV = Math.max(...shape);
  const k = peak / (1 + maxV);
  return shape.map((v) => Math.round(k * (1 + v)));
};

/** Bucketed series whose AVERAGE equals `avg` (for `arrayAvg`-folded metrics). */
export const seriesWithAvg = (avg: number, shape: number[]): number[] => {
  const mean = sum(shape) / shape.length;
  return shape.map((v) => Math.round(avg * (1 + (v - mean))));
};
