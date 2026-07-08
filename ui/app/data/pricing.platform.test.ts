import { describe, expect, it } from "vitest";
import { platformKey, PLATFORM_PRICING } from "./pricing";

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
    expect(PLATFORM_PRICING.aws_bedrock["titan-embed-text"]).toBeDefined();
    expect(PLATFORM_PRICING.aws_bedrock["nova-lite"]).toBeDefined();
    expect(PLATFORM_PRICING.aws_bedrock["nova-lite"].outputPerMTok).toBeGreaterThan(0);
  });
});
