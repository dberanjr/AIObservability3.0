import { describe, expect, it } from "vitest";
import { isHighFrequency, HIGH_FREQUENCY_TOOL_THRESHOLD } from "./constants";

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
