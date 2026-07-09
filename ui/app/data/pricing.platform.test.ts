import { describe, expect, it } from "vitest";
import { platformKey, PLATFORM_PRICING, resolveModelPricing, computeCost, costOf } from "./pricing";

describe("platformKey", () => {
  it("returns the bare model key for direct (backward compatible)", () => {
    expect(platformKey("direct", "claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
  });
  it("namespaces non-direct platforms", () => {
    expect(platformKey("aws_bedrock", "nova-lite")).toBe("aws_bedrock::nova-lite");
  });
});

describe("PLATFORM_PRICING", () => {
  it("has a table for every platform", () => {
    expect(Object.keys(PLATFORM_PRICING).sort()).toEqual(
      ["aws_bedrock", "azure", "direct", "gcp_vertex"],
    );
  });
  it("prices Bedrock-only Amazon models (Titan/Nova)", () => {
    expect(PLATFORM_PRICING.aws_bedrock["nova-micro"]).toBeDefined();
    expect(PLATFORM_PRICING.aws_bedrock["nova-lite"]).toBeDefined();
    expect(PLATFORM_PRICING.aws_bedrock["nova-lite"].outputPerMTok).toBeGreaterThan(0);
  });
});

describe("platform-aware lookup", () => {
  it("Claude on Bedrock falls back to the Direct Claude price (parity today)", () => {
    const direct = resolveModelPricing("claude-sonnet-4-6", "direct");
    const bedrock = resolveModelPricing("us.anthropic.claude-sonnet-4-6", "aws_bedrock");
    expect(bedrock.inputPerMTok).toBe(direct.inputPerMTok);
    expect(bedrock.outputPerMTok).toBe(direct.outputPerMTok);
    expect(bedrock.blended).toBeFalsy();
  });
  it("Amazon Nova is priced from the Bedrock table, not blended", () => {
    const p = resolveModelPricing("us.amazon.nova-2-lite-v1:0", "aws_bedrock");
    expect(p.blended).toBeFalsy();
    expect(p.outputPerMTok).toBeCloseTo(0.24);
  });
  it("computeCost accepts a platform and matches Direct for a Bedrock Claude call", () => {
    const tokens = { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
    const b = computeCost(tokens, "us.anthropic.claude-sonnet-4-6", "aws_bedrock");
    expect(b.effectiveCost).toBeCloseTo(3); // $3 / 1M input for Sonnet
  });
  it("costOf default platform stays 'direct' (backward compatible)", () => {
    expect(costOf(1_000_000, 0, "claude-sonnet-4-6")).toBeCloseTo(3);
  });
  it("dedupe: titan-embed-text resolves via Direct fallback, not duplicated in Bedrock table", () => {
    const p = resolveModelPricing("amazon.titan-embed-text-v1", "aws_bedrock");
    expect(p.blended).toBeFalsy();
    expect(p.inputPerMTok).toBeCloseTo(0.02);
  });
});
