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

/** Derives a real timestamp-based bucket label ("YYYY-MM-DD" for day+ buckets,
 *  "YYYY-MM-DD HH:MM" for sub-day buckets) from a `makeTimeseries` result's
 *  `timeframe.start` + `interval`, falling back to a bare index when the axis
 *  fields are missing. Shared by every fold function in this file. */
const labelAt = (startMs: number, intervalMs: number, hasAxis: boolean, i: number): string =>
  !hasAxis
    ? String(i)
    : intervalMs >= 86_400_000
      ? new Date(startMs + i * intervalMs).toISOString().slice(0, 10)
      : new Date(startMs + i * intervalMs).toISOString().slice(0, 16).replace("T", " ");

/** Extracts the `{ startMs, intervalMs, hasAxis }` time axis shared by every
 *  fold function below from a single `makeTimeseries` result row's
 *  `timeframe` + `interval` fields. */
const timeAxisOf = (r: Record<string, unknown> | undefined): { startMs: number; intervalMs: number; hasAxis: boolean } => {
  const tf = r?.timeframe as TimeframeLike | undefined;
  const startMs = tf?.start != null ? Date.parse(String(tf.start)) : NaN;
  const intervalMs = r?.interval != null ? Number(r.interval) / 1e6 : NaN;
  return { startMs, intervalMs, hasAxis: Number.isFinite(startMs) && Number.isFinite(intervalMs) };
};

/** Safe string coercion — mirrors parse.ts's `str()`. Avoids
 *  `@typescript-eslint/no-base-to-string` on a `modelId` field that's typed
 *  `unknown` (a raw DQL result value can be an object, which `String()`
 *  would stringify as "[object Object]"). */
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Longest token array on a record — a record's four series should be the
 *  same length, but take the max defensively in case one is short/missing. */
const recordBucketCount = (r: Record<string, unknown>): number =>
  Math.max(lenOf(r.inTok), lenOf(r.outTok), lenOf(r.cacheRead), lenOf(r.cacheWrite));

export const foldDailyCost = (
  records: Record<string, unknown>[],
): { daily: BedrockDailyCostPoint[]; summary: BedrockCostSummary } => {
  const bucketCount = Math.max(0, ...records.map(recordBucketCount));
  const { startMs, intervalMs, hasAxis } = timeAxisOf(records[0]);

  const daily: BedrockDailyCostPoint[] = [];
  const flat: DailyModelTokens[] = [];

  for (let i = 0; i < bucketCount; i++) {
    const byModel: Record<string, number> = {};
    let actual = 0;
    let savedByCache = 0;
    for (const r of records) {
      const t: DailyModelTokens = {
        modelId: str(r.modelId),
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
    // Sub-day buckets need the time-of-day in the label, or every intraday
    // bucket collapses onto the same calendar-day string (e.g. three 1h
    // buckets all labeled "2026-07-01"). Day-or-longer buckets keep the
    // plain date so the label stays short when it doesn't need the time.
    daily.push({ day: labelAt(startMs, intervalMs, hasAxis, i), byModel, actual, savedByCache });
  }

  return { daily, summary: bedrockCostSummary(flat) };
};

export interface BedrockSparkFold {
  values: number[];
  labels: string[];
}

/** Folds the single-row bucketed result of `buildBedrockErrorRateSparkQuery`
 *  (parallel `invocations`/`errors` arrays) into a per-bucket error-rate (%)
 *  series. A ratio of two equally-extrapolated sums — like `errorRate` in
 *  `parseAgentSessions` (parse.ts) — so this needs no sampling-ratio scaling
 *  of its own. */
export const foldErrorRateSpark = (records: Record<string, unknown>[]): BedrockSparkFold => {
  const r = records[0];
  const bucketCount = Math.max(lenOf(r?.invocations), lenOf(r?.errors));
  const { startMs, intervalMs, hasAxis } = timeAxisOf(r);

  const values: number[] = [];
  const labels: string[] = [];
  for (let i = 0; i < bucketCount; i++) {
    const inv = numAt(r?.invocations, i);
    const err = numAt(r?.errors, i);
    values.push(inv > 0 ? (err / inv) * 100 : 0);
    labels.push(labelAt(startMs, intervalMs, hasAxis, i));
  }
  return { values, labels };
};

/** Folds the sessions-spark query's single-row bucketed `countDistinct(session)`
 *  result into a per-bucket session-count series. HyperLogLog-approximate (any
 *  `countDistinct` inside `makeTimeseries` is) and NEVER sampling-extrapolated
 *  — matches how the exact headline Sessions count is treated in
 *  `useBedrockOverview`. */
export const foldSessionsSpark = (records: Record<string, unknown>[]): BedrockSparkFold => {
  const r = records[0];
  const bucketCount = lenOf(r?.sessions);
  const { startMs, intervalMs, hasAxis } = timeAxisOf(r);

  const values: number[] = [];
  const labels: string[] = [];
  for (let i = 0; i < bucketCount; i++) {
    values.push(numAt(r?.sessions, i));
    labels.push(labelAt(startMs, intervalMs, hasAxis, i));
  }
  return { values, labels };
};
