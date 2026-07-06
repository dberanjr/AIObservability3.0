import { describe, expect, it } from "vitest";
import { compositeTrust, scoreToGrade, trendPct } from "./posture";

/**
 * Fleet-posture math for the Summary hero. The composite "trust index" blends
 * the three Pulse health pillars (operational / quality / cost) — renormalizing
 * over whichever pillars actually have data — and maps to a letter grade. These
 * are pure functions so they're unit-locked here.
 */
describe("compositeTrust", () => {
  it("blends all three pillars by weight (operational .45 / quality .35 / cost .20)", () => {
    // 0.45*100 + 0.35*100 + 0.20*100 = 100
    expect(compositeTrust({ operational: 100, quality: 100, cost: 100 })).toBe(
      100,
    );
  });

  it("weights operational the most", () => {
    // operational drives the blend more than quality, which drives more than cost
    const opHigh = compositeTrust({ operational: 90, quality: 60, cost: 60 })!;
    const qualHigh = compositeTrust({ operational: 60, quality: 90, cost: 60 })!;
    const costHigh = compositeTrust({ operational: 60, quality: 60, cost: 90 })!;
    expect(opHigh).toBeGreaterThan(qualHigh);
    expect(qualHigh).toBeGreaterThan(costHigh);
  });

  it("renormalizes over available pillars when quality is null (no eval data)", () => {
    // Only operational (.45) + cost (.20) present → weights renormalize to
    // .45/.65 and .20/.65. Both 80 → composite is exactly 80.
    expect(compositeTrust({ operational: 80, quality: null, cost: 80 })).toBe(
      80,
    );
  });

  it("returns a single pillar's score when it is the only one present", () => {
    expect(compositeTrust({ operational: 72, quality: null, cost: null })).toBe(
      72,
    );
  });

  it("returns null when no pillar has data", () => {
    expect(
      compositeTrust({ operational: null, quality: null, cost: null }),
    ).toBeNull();
  });

  it("rounds to a whole number", () => {
    const v = compositeTrust({ operational: 83, quality: 84, cost: 86 })!;
    expect(Number.isInteger(v)).toBe(true);
  });
});

describe("scoreToGrade", () => {
  it("maps top scores to A+", () => {
    expect(scoreToGrade(100)).toBe("A+");
    expect(scoreToGrade(97)).toBe("A+");
  });

  it("maps the A band", () => {
    expect(scoreToGrade(95)).toBe("A");
    expect(scoreToGrade(91)).toBe("A-");
  });

  it("maps the B band", () => {
    expect(scoreToGrade(88)).toBe("B+");
    expect(scoreToGrade(84)).toBe("B");
    expect(scoreToGrade(81)).toBe("B-");
  });

  it("maps the C band", () => {
    expect(scoreToGrade(78)).toBe("C+");
    expect(scoreToGrade(74)).toBe("C");
    expect(scoreToGrade(71)).toBe("C-");
  });

  it("maps low scores to D and F", () => {
    expect(scoreToGrade(65)).toBe("D");
    expect(scoreToGrade(40)).toBe("F");
  });

  it("clamps out-of-range input", () => {
    expect(scoreToGrade(120)).toBe("A+");
    expect(scoreToGrade(-5)).toBe("F");
  });
});

describe("trendPct", () => {
  it("returns a positive percent when the series trends up", () => {
    // first half avg 10, second half avg 20 → +100%
    expect(trendPct([10, 10, 20, 20])).toBe(100);
  });

  it("returns a negative percent when the series trends down", () => {
    expect(trendPct([20, 20, 10, 10])).toBe(-50);
  });

  it("returns 0 for a flat series", () => {
    expect(trendPct([5, 5, 5, 5])).toBe(0);
  });

  it("returns null when there is too little data", () => {
    expect(trendPct([])).toBeNull();
    expect(trendPct([1])).toBeNull();
  });

  it("returns null when the baseline half is zero (no meaningful ratio)", () => {
    expect(trendPct([0, 0, 5, 5])).toBeNull();
  });
});
