/**
 * Pure fold logic for the daily-cost `makeTimeseries` result. Kept out of the
 * hook so it's independently testable without renderHook: `makeTimeseries`
 * returns one record per modelId with parallel token arrays (one slot per
 * bucket) plus a shared `timeframe` + `interval` (bucket width, in ns) that
 * we use to derive real calendar-day labels instead of index placeholders.
 */

import { bedrockCostOfTokens, bedrockCostSummary, type BedrockCostSummary, type DailyModelTokens } from "./cost";
import { shortModelName } from "./model";
import { toNum } from "../data/format";

export interface BedrockDailyCostPoint {
  day: string;
  byModel: Record<string, number>;
  actual: number;
  savedByCache: number;
}

interface TimeframeLike {
  start?: string;
  end?: string;
}

/** Value at bucket `i` of an array field; missing array / null slot / non-finite → 0. */
const numAt = (v: unknown, i: number): number => {
  const arr = Array.isArray(v) ? (v as unknown[]) : [];
  const x = arr[i];
  if (x == null) return 0;
  const n = toNum(x);
  return Number.isFinite(n) ? n : 0;
};

const lenOf = (v: unknown): number => (Array.isArray(v) ? v.length : 0);

/** Longest token array on a record — a record's four series should be the
 *  same length, but take the max defensively in case one is short/missing. */
const recordBucketCount = (r: Record<string, unknown>): number =>
  Math.max(lenOf(r.inTok), lenOf(r.outTok), lenOf(r.cacheRead), lenOf(r.cacheWrite));

export const foldDailyCost = (
  records: Record<string, unknown>[],
): { daily: BedrockDailyCostPoint[]; summary: BedrockCostSummary } => {
  const bucketCount = Math.max(0, ...records.map(recordBucketCount));

  const first = records[0];
  const tf = first?.timeframe as TimeframeLike | undefined;
  const startMs = tf?.start != null ? Date.parse(String(tf.start)) : NaN;
  const intervalMs = first?.interval != null ? Number(first.interval) / 1e6 : NaN;
  const hasAxis = Number.isFinite(startMs) && Number.isFinite(intervalMs);

  const daily: BedrockDailyCostPoint[] = [];
  const flat: DailyModelTokens[] = [];

  for (let i = 0; i < bucketCount; i++) {
    const byModel: Record<string, number> = {};
    let actual = 0;
    let savedByCache = 0;
    for (const r of records) {
      const t: DailyModelTokens = {
        modelId: String(r.modelId ?? ""),
        inTok: numAt(r.inTok, i),
        outTok: numAt(r.outTok, i),
        cacheRead: numAt(r.cacheRead, i),
        cacheWrite: numAt(r.cacheWrite, i),
      };
      const { cost, noCacheCost } = bedrockCostOfTokens(t);
      const key = shortModelName(t.modelId);
      byModel[key] = (byModel[key] ?? 0) + cost;
      actual += cost;
      savedByCache += Math.max(0, noCacheCost - cost);
      flat.push(t);
    }
    const day = hasAxis ? new Date(startMs + i * intervalMs).toISOString().slice(0, 10) : String(i);
    daily.push({ day, byModel, actual, savedByCache });
  }

  return { daily, summary: bedrockCostSummary(flat) };
};
