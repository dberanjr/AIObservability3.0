import { describe, expect, it } from "vitest";
import { bedrockCostOfTokens, bedrockCostSummary } from "./cost";

// Sonnet-4-6 = $3/1M in, $15/1M out; cache-read defaults to 10% of input for non-OpenAI.
const sonnet = { modelId: "us.anthropic.claude-sonnet-4-6", inTok: 1_000_000, outTok: 0, cacheRead: 1_000_000, cacheWrite: 0 };

describe("bedrockCostOfTokens", () => {
  it("prices cache-read tokens at the discounted rate and reports the no-cache counterfactual", () => {
    const r = bedrockCostOfTokens(sonnet);
    // actual: 1M input @ $3 + 1M cacheRead @ $0.30 = 3 + 0.30 = $3.30
    expect(r.cost).toBeCloseTo(3.3);
    // no-cache: cacheRead billed at full input rate → 1M @ $3 = +$3 → $6 total
    expect(r.noCacheCost).toBeCloseTo(6);
    expect(r.blended).toBe(false);
  });
});

describe("bedrockCostSummary", () => {
  it("splits priced vs estimated and totals cache savings", () => {
    const rows = [
      sonnet,
      { modelId: "us.anthropic.claude-opus-4-6-v1", inTok: 1_000_000, outTok: 0, cacheRead: 0, cacheWrite: 0 }, // unpriced → blended/estimated
    ];
    const s = bedrockCostSummary(rows);
    expect(s.estimatedModels).toContain("claude-opus-4-6");
    expect(s.savedByCache).toBeCloseTo(2.7); // 6 - 3.3 from the sonnet row
    expect(s.total).toBeCloseTo(s.priced + s.estimated);
  });
});
