/**
 * Canonical chart granularity (bucket interval) vs. timeframe selection.
 *
 * This is the logic the Pulse token/cost chart uses, lifted here so every
 * timeseries chart in the app (Pulse, MCP & Tool Health, the tool detail
 * popup, …) snaps to the SAME bucket size for a given window. The bucket is
 * the smallest snapped value ≥ the ideal interval (window / TARGET_BUCKETS),
 * so a 24h window → 5m buckets, 7d → 1h, 30d → 6h, etc.
 */

export interface ChartBucket {
  sec: number;
  label: string;
}

const SNAPPED_BUCKETS_SEC: ReadonlyArray<ChartBucket> = [
  { sec: 60, label: "1m" },
  { sec: 300, label: "5m" },
  { sec: 900, label: "15m" },
  { sec: 1800, label: "30m" },
  { sec: 3600, label: "1h" },
  { sec: 21600, label: "6h" },
  { sec: 86400, label: "1d" },
];

const TARGET_BUCKETS = 240;

/**
 * Window length in ms from a scope `from` expression (`now()-24h`, `now()-7d`,
 * …). Matches the Pulse parser: relative `now()-N(m|h|d)` only; anything else
 * defaults to 24h.
 */
export const parseScopeMs = (from: string): number => {
  const m = /now\(\)\s*-\s*(\d+)([mhd])/i.exec(from);
  if (!m) return 24 * 60 * 60 * 1000;
  const n = Number(m[1]);
  switch (m[2].toLowerCase()) {
    case "m":
      return n * 60 * 1000;
    case "h":
      return n * 60 * 60 * 1000;
    case "d":
      return n * 24 * 60 * 60 * 1000;
    default:
      return 24 * 60 * 60 * 1000;
  }
};

/** Snapped bucket (sec + label) for a window length in ms. */
export const pickChartBucket = (totalMs: number): ChartBucket => {
  const ideal = Math.max(60, Math.floor(totalMs / TARGET_BUCKETS / 1000));
  for (const b of SNAPPED_BUCKETS_SEC) {
    if (b.sec >= ideal) return b;
  }
  return SNAPPED_BUCKETS_SEC[SNAPPED_BUCKETS_SEC.length - 1];
};

/** Convenience: snapped bucket for a scope `from` expression. */
export const pickChartIntervalFor = (from: string): ChartBucket =>
  pickChartBucket(parseScopeMs(from));

/** Convenience: just the interval seconds for a scope `from` expression. */
export const pickChartIntervalSec = (from: string): number =>
  pickChartIntervalFor(from).sec;

/**
 * Human-readable time phrase for an interval in seconds — e.g. "5 min",
 * "1 hour", "6 hours", "1 day". Use this (NOT "buckets") wherever a chart's
 * granularity is shown to the user.
 */
export const intervalPhrase = (sec: number): string => {
  if (sec >= 86400 && sec % 86400 === 0) {
    const d = sec / 86400;
    return `${d} day${d > 1 ? "s" : ""}`;
  }
  if (sec >= 3600 && sec % 3600 === 0) {
    const h = sec / 3600;
    return `${h} hour${h > 1 ? "s" : ""}`;
  }
  const m = Math.max(1, Math.round(sec / 60));
  return `${m} min`;
};

/** Same as {@link intervalPhrase} but from a millisecond interval. */
export const intervalPhraseFromMs = (ms: number): string =>
  intervalPhrase(Math.round(ms / 1000));
