/**
 * Pure geometry for the cache-savings "ghost" chart: converts daily cost
 * points into px-scaled stacked-bar segments plus a ghost cap representing
 * `savedByCache` — the counterfactual spend avoided by cache hits.
 *
 * All days share ONE scale, derived from the tallest (actual + savedByCache)
 * counterfactual across the whole series — not each day's own total — so bar
 * heights are comparable across the chart (the same contract `niceMax`/scale
 * patterns use elsewhere, e.g. Models/DailyCostStackedBar).
 */

import type { BedrockDailyCostPoint } from "../../bedrock/series";

export interface GhostBar {
  day: string;
  /** Stacked per-model cost segments, in `byModel`'s key order, scaled to px. */
  segments: { key: string; px: number }[];
  /** The cache-savings "ghost" cap on top of the solid stack, scaled to px. */
  ghostPx: number;
}

/**
 * Scale every day's per-model segments and its `savedByCache` ghost to px
 * against `max over points of (actual + savedByCache)` — so the tallest
 * counterfactual bar (solid + ghost) exactly fills `maxPx`.
 *
 * `includeGhost` (default `true`) gates whether the ghost participates at
 * all — when the caller has turned the cache-savings overlay off, the scale
 * should key off `max over points of actual` instead (so the solid bars
 * alone use the full chart height) and every `ghostPx` collapses to 0 rather
 * than a nonzero value the caller would otherwise have to remember to
 * suppress at render time.
 *
 * Guards: an empty `points` array returns `[]`. A non-positive max (no spend
 * anywhere in scope, or a non-positive `maxPx` budget) returns every px as 0
 * rather than NaN/Infinity from a division by zero.
 */
export const toGhostBars = (
  points: BedrockDailyCostPoint[],
  maxPx: number,
  includeGhost = true,
): GhostBar[] => {
  if (points.length === 0) return [];

  const max = includeGhost
    ? Math.max(0, ...points.map((p) => p.actual + p.savedByCache))
    : Math.max(0, ...points.map((p) => p.actual));
  const scale = max > 0 && maxPx > 0 ? maxPx / max : 0;

  return points.map((p) => ({
    day: p.day,
    segments: Object.entries(p.byModel).map(([key, value]) => ({
      key,
      px: Math.max(0, value) * scale,
    })),
    ghostPx: includeGhost ? Math.max(0, p.savedByCache) * scale : 0,
  }));
};
