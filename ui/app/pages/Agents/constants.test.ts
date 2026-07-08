import { describe, expect, it } from "vitest";
import {
  isHighFrequency,
  HIGH_FREQUENCY_TOOL_THRESHOLD,
  SLOW_P90_MS,
  RUNAWAY_P90_MS,
} from "./constants";

describe("latency thresholds", () => {
  it("keeps the slow threshold strictly below the runaway threshold", () => {
    expect(SLOW_P90_MS).toBeLessThan(RUNAWAY_P90_MS);
  });

  it("uses the documented 2s / 10min defaults", () => {
    expect(SLOW_P90_MS).toBe(2000);
    expect(RUNAWAY_P90_MS).toBe(600_000);
  });
});

describe("isHighFrequency (high-frequency tool / N+1 predicate)", () => {
  const T = HIGH_FREQUENCY_TOOL_THRESHOLD;

  it("fires strictly ABOVE the threshold", () => {
    expect(isHighFrequency(T + 1)).toBe(true);
    expect(isHighFrequency(T * 5)).toBe(true);
  });

  it("does NOT fire AT the threshold", () => {
    expect(isHighFrequency(T)).toBe(false);
  });

  it("does NOT fire below the threshold", () => {
    expect(isHighFrequency(T - 1)).toBe(false);
    expect(isHighFrequency(0)).toBe(false);
  });

  it("respects a custom (SLA-overridable) threshold", () => {
    expect(isHighFrequency(6, 5)).toBe(true);
    expect(isHighFrequency(5, 5)).toBe(false);
    expect(isHighFrequency(4, 5)).toBe(false);
  });
});
