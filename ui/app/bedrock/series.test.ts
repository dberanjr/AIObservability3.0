import { describe, expect, it } from "vitest";
import { foldDailyCost } from "./series";

// Synthetic makeTimeseries record shaped like the live tenant: one record per
// modelId, parallel token arrays (one slot per bucket, values null or number),
// a shared `timeframe` object and an `interval` in nanoseconds (1d = 86400000000000ns).
const sonnetSeries = {
  modelId: "us.anthropic.claude-sonnet-4-6",
  inTok: [1_000_000, null, 500_000],
  outTok: [0, 0, 0],
  cacheRead: [1_000_000, 0, 0],
  cacheWrite: [0, 0, 0],
  timeframe: { start: "2026-07-01T00:00:00.000Z", end: "2026-07-04T00:00:00.000Z" },
  interval: "86400000000000",
};

describe("foldDailyCost", () => {
  it("folds a per-modelId timeseries record into daily points with real ISO day labels", () => {
    const { daily, summary } = foldDailyCost([sonnetSeries]);

    expect(daily).toHaveLength(3);
    expect(daily.map((d) => d.day)).toEqual(["2026-07-01", "2026-07-02", "2026-07-03"]);

    // bucket 0: 1M input + 1M cache-read → $3 + $0.30 = $3.30; ghost saving vs.
    // no-cache counterfactual ($6) is $2.70 (mirrors cost.test.ts).
    expect(daily[0].actual).toBeCloseTo(3.3);
    expect(daily[0].savedByCache).toBeCloseTo(2.7);
    expect(daily[0].byModel["claude-sonnet-4-6"]).toBeCloseTo(3.3);

    // bucket 1: null token counts → guarded to 0, no cost, no ghost saving.
    expect(daily[1].actual).toBeCloseTo(0);
    expect(daily[1].savedByCache).toBeCloseTo(0);

    // bucket 2: 500k input, no cache → $1.50, no ghost saving.
    expect(daily[2].actual).toBeCloseTo(1.5);
    expect(daily[2].savedByCache).toBeCloseTo(0);

    // priced model (sonnet-4-6 is in the rate card) → fully priced, no estimate.
    expect(summary.priced).toBeCloseTo(4.8);
    expect(summary.estimated).toBeCloseTo(0);
    expect(summary.total).toBeCloseTo(summary.priced + summary.estimated);
    expect(summary.savedByCache).toBeCloseTo(2.7);
  });

  it("uses time-aware labels for sub-day intervals so intraday buckets stay distinct", () => {
    // 1h buckets (interval = 3600000000000ns) over a 3-hour window — a
    // date-only label would collapse all 3 buckets to the same "2026-07-01".
    const hourlySeries = {
      modelId: "us.anthropic.claude-sonnet-4-6",
      inTok: [100, 200, 300],
      outTok: [0, 0, 0],
      cacheRead: [0, 0, 0],
      cacheWrite: [0, 0, 0],
      timeframe: { start: "2026-07-01T00:00:00.000Z", end: "2026-07-01T03:00:00.000Z" },
      interval: "3600000000000",
    };
    const { daily } = foldDailyCost([hourlySeries]);

    expect(daily).toHaveLength(3);
    const labels = daily.map((d) => d.day);
    expect(new Set(labels).size).toBe(3);
    for (const label of labels) {
      expect(label).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    }
    expect(labels).toEqual(["2026-07-01 00:00", "2026-07-01 01:00", "2026-07-01 02:00"]);
  });

  it("falls back to index-based day labels when timeframe/interval are missing", () => {
    const { daily } = foldDailyCost([
      { modelId: "us.anthropic.claude-sonnet-4-6", inTok: [10], outTok: [0], cacheRead: [0], cacheWrite: [0] },
    ]);
    expect(daily.map((d) => d.day)).toEqual(["0"]);
  });

  it("returns no daily points and a zeroed summary for an empty result set", () => {
    const { daily, summary } = foldDailyCost([]);
    expect(daily).toEqual([]);
    expect(summary.total).toBe(0);
  });
});
