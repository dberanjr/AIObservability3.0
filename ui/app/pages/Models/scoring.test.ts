import { describe, expect, it } from "vitest";
import { getPricing } from "../../data/pricing";
import {
  USE_CASE_PROFILES,
  compareModels,
  findProfile,
  scoreCostPerRequest,
  scoreLatency,
  scoreQuality,
  scoreReliability,
  scoreThroughput,
  scoreModelFor,
  verdictStrengthFor,
} from "./scoring";

describe("scoreLatency", () => {
  it("saturates at 100 below the floor (200 ms)", () => {
    expect(scoreLatency(50)).toBe(100);
    expect(scoreLatency(200)).toBe(100);
  });

  it("hits 0 at the ceiling (6000 ms)", () => {
    expect(scoreLatency(6000)).toBe(0);
    expect(scoreLatency(10_000)).toBe(0);
  });

  it("is monotonically non-increasing", () => {
    expect(scoreLatency(500)).toBeGreaterThan(scoreLatency(2000));
    expect(scoreLatency(2000)).toBeGreaterThan(scoreLatency(5000));
  });
});

describe("scoreCostPerRequest", () => {
  it("saturates at 100 below the floor ($0.0005)", () => {
    expect(scoreCostPerRequest(0.0001)).toBe(100);
    expect(scoreCostPerRequest(0.0005)).toBe(100);
  });

  it("hits 0 at the ceiling ($0.05)", () => {
    expect(scoreCostPerRequest(0.05)).toBe(0);
    expect(scoreCostPerRequest(0.5)).toBe(0);
  });

  it("is monotonically non-increasing", () => {
    expect(scoreCostPerRequest(0.001)).toBeGreaterThan(
      scoreCostPerRequest(0.01),
    );
    expect(scoreCostPerRequest(0.01)).toBeGreaterThan(
      scoreCostPerRequest(0.04),
    );
  });
});

describe("scoreQuality", () => {
  it("returns tier-proxy scores when no eval present", () => {
    expect(scoreQuality("low", null)).toBe(70);
    expect(scoreQuality("mid", null)).toBe(78);
    expect(scoreQuality("high", null)).toBe(90);
    expect(scoreQuality("frontier", null)).toBe(97);
  });

  it("swaps in real eval score when present", () => {
    expect(scoreQuality("low", 88)).toBe(88);
  });

  it("clamps real eval scores to [0, 100]", () => {
    expect(scoreQuality("mid", -10)).toBe(0);
    expect(scoreQuality("mid", 250)).toBe(100);
  });
});

describe("scoreThroughput", () => {
  it("starts at 30 for the floor (0 requests)", () => {
    expect(scoreThroughput(0)).toBeCloseTo(30, 0);
  });

  it("rises through the log-scale band", () => {
    expect(scoreThroughput(100)).toBeGreaterThan(scoreThroughput(10));
    expect(scoreThroughput(10_000)).toBeGreaterThan(scoreThroughput(1_000));
  });

  it("clamps at 100 above the saturation point", () => {
    expect(scoreThroughput(100_000)).toBe(100);
    expect(scoreThroughput(1_000_000)).toBe(100);
  });
});

describe("scoreReliability", () => {
  it("returns 100 for zero errors", () => {
    expect(scoreReliability(0)).toBe(100);
  });

  it("returns 0 for 5% errors or higher", () => {
    expect(scoreReliability(5)).toBe(0);
    expect(scoreReliability(10)).toBe(0);
  });

  it("is linear in between", () => {
    expect(scoreReliability(1)).toBe(80);
    expect(scoreReliability(2.5)).toBe(50);
  });
});

describe("verdictStrengthFor", () => {
  it("> 12 → strong", () => {
    expect(verdictStrengthFor(13)).toBe("strong");
    expect(verdictStrengthFor(50)).toBe("strong");
  });

  it("> 5 → moderate", () => {
    expect(verdictStrengthFor(5.5)).toBe("moderate");
    expect(verdictStrengthFor(12)).toBe("moderate");
  });

  it("≤ 5 → narrow", () => {
    expect(verdictStrengthFor(5)).toBe("narrow");
    expect(verdictStrengthFor(0)).toBe("narrow");
  });
});

describe("USE_CASE_PROFILES", () => {
  it("contains all 6 named profiles from the spec", () => {
    const ids = USE_CASE_PROFILES.map((p) => p.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "rag-qna",
        "interactive",
        "classification",
        "batch-analysis",
        "internal-tool",
        "critical-policy",
      ]),
    );
  });

  it("every profile carries a non-empty BOS upstream service name", () => {
    for (const p of USE_CASE_PROFILES) {
      expect(p.upstreamService).toMatch(/^bos-/);
    }
  });

  it("weights sum to 100 in every profile", () => {
    for (const p of USE_CASE_PROFILES) {
      const sum =
        p.weights.latency +
        p.weights.cost +
        p.weights.quality +
        p.weights.throughput +
        p.weights.reliability;
      expect(sum).toBe(100);
    }
  });
});

describe("findProfile", () => {
  it("returns the named profile when known", () => {
    expect(findProfile("rag-qna").id).toBe("rag-qna");
  });

  it("falls back to the first profile for unknown ids", () => {
    expect(findProfile("not-a-real-profile-id").id).toBe(
      USE_CASE_PROFILES[0].id,
    );
  });
});

describe("scoreModelFor disqualification", () => {
  const profile = findProfile("critical-policy"); // minQuality = frontier
  const mid = {
    model: "gpt-4o-mini",
    avgMs: 400,
    costPerRequest: 0.001,
    requests: 1000,
    errorRatePct: 0.2,
    pricing: getPricing("gpt-4o-mini"), // tier mid
  };

  it("disqualifies a mid-tier model for a frontier-floor profile", () => {
    const scored = scoreModelFor(mid, profile);
    expect(scored.disqualified).toBe(true);
    expect(scored.disqualifiedReason).toMatch(/quality floor/);
  });

  it("does NOT disqualify when tier meets or exceeds the floor", () => {
    const frontier = {
      ...mid,
      model: "claude-opus-4-5",
      pricing: getPricing("claude-opus-4-5"),
    };
    const scored = scoreModelFor(frontier, profile);
    expect(scored.disqualified).toBe(false);
  });
});

describe("compareModels", () => {
  const profile = findProfile("classification"); // cost-heavy
  const cheap = {
    model: "gpt-4o-mini",
    avgMs: 400,
    costPerRequest: 0.0008,
    requests: 5000,
    errorRatePct: 0.2,
    pricing: getPricing("gpt-4o-mini"),
  };
  const expensive = {
    model: "claude-sonnet-4-6",
    avgMs: 700,
    costPerRequest: 0.012,
    requests: 5000,
    errorRatePct: 0.3,
    pricing: getPricing("claude-sonnet-4-6"),
  };

  it("picks the cheaper qualified model when the profile is cost-heavy", () => {
    const result = compareModels(profile, cheap, expensive, 100_000);
    expect(result.winner).toBe("a");
    expect(result.margin).toBeGreaterThan(0);
  });

  it("projects positive monthly savings when winner is cheaper per request", () => {
    const result = compareModels(profile, cheap, expensive, 100_000);
    expect(result.estimatedMonthlySavings).toBeGreaterThan(0);
  });

  it("clamps projected savings to ≥ 0 when winner is more expensive (e.g. quality-led wins)", () => {
    const qualityProfile = findProfile("critical-policy");
    const frontier = {
      ...expensive,
      model: "claude-opus-4-5",
      costPerRequest: 0.05,
      pricing: getPricing("claude-opus-4-5"),
    };
    // Frontier wins on quality floor but costs more per request.
    const result = compareModels(qualityProfile, frontier, cheap, 100_000);
    expect(result.winner).toBe("a");
    expect(result.estimatedMonthlySavings).toBe(0);
  });

  it("verdict strength maps from the margin", () => {
    const big = compareModels(profile, cheap, expensive, 100_000);
    expect(["strong", "moderate", "narrow"]).toContain(big.verdict);
  });
});
