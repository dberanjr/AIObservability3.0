import { describe, expect, it } from "vitest";
import { latencySeverity, percentile, winsorizedMax } from "./latency";
import { SLOW_P90_MS, RUNAWAY_P90_MS } from "./constants";

describe("latencySeverity", () => {
  it("returns ok at or below the slow threshold", () => {
    expect(latencySeverity(0)).toBe("ok");
    expect(latencySeverity(SLOW_P90_MS)).toBe("ok");
  });

  it("returns slow between the slow and runaway thresholds", () => {
    expect(latencySeverity(SLOW_P90_MS + 1)).toBe("slow");
    expect(latencySeverity(RUNAWAY_P90_MS)).toBe("slow");
  });

  it("returns runaway above the runaway threshold", () => {
    expect(latencySeverity(RUNAWAY_P90_MS + 1)).toBe("runaway");
  });
});

describe("percentile", () => {
  it("returns the single value for a one-element array", () => {
    expect(percentile([10], 95)).toBe(10);
  });

  it("returns the min at p0 and the max at p100", () => {
    expect(percentile([1, 2, 3, 4, 5], 0)).toBe(1);
    expect(percentile([1, 2, 3, 4, 5], 100)).toBe(5);
  });

  it("returns the median at p50", () => {
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
  });
});

describe("winsorizedMax", () => {
  it("falls back to 1 for an empty list", () => {
    expect(winsorizedMax([])).toBe(1);
  });

  it("ignores non-positive / non-finite values", () => {
    expect(winsorizedMax([0, -5, NaN, Infinity])).toBe(1);
  });

  it("clamps a lone runaway outlier so normal agents stay visible", () => {
    // 24 normal agents (~1-2s) plus one 10-minute runaway. The P95 scale max
    // must land near the normal band, not the outlier, so the runaway saturates
    // instead of crushing everyone to invisible slivers.
    const normal = Array.from({ length: 24 }, (_, i) => 1000 + i * 40);
    const values = [...normal, 600_000];
    const max = winsorizedMax(values, 95);
    expect(max).toBeLessThan(10_000);
    expect(max).toBeGreaterThan(0);
  });

  it("is unchanged when there is no outlier (p95 ~= max)", () => {
    const values = [1000, 1100, 1200, 1300];
    expect(winsorizedMax(values, 95)).toBeGreaterThanOrEqual(1200);
    expect(winsorizedMax(values, 95)).toBeLessThanOrEqual(1300);
  });
});
