import { describe, expect, it } from "vitest";
import { normalizeBedrockModelId, bedrockProviderOf, shortModelName } from "./model";

describe("normalizeBedrockModelId", () => {
  it("maps both short and ARN forms to one rate-card key", () => {
    expect(normalizeBedrockModelId("us.anthropic.claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
    expect(
      normalizeBedrockModelId(
        "arn:aws:bedrock:us-east-1:516035591078:inference-profile/us.anthropic.claude-sonnet-4-6",
      ),
    ).toBe("claude-sonnet-4-6");
  });
});
describe("bedrockProviderOf", () => {
  it("reads the provider from the modelId prefix", () => {
    expect(bedrockProviderOf("us.anthropic.claude-opus-4-8")).toBe("Anthropic");
    expect(bedrockProviderOf("amazon.titan-embed-text-v1")).toBe("Amazon");
    expect(bedrockProviderOf("us.amazon.nova-2-lite-v1:0")).toBe("Amazon");
  });
});
describe("shortModelName", () => {
  it("drops region/vendor prefixes and the ARN path for display", () => {
    expect(shortModelName("us.anthropic.claude-opus-4-8")).toBe("claude-opus-4-8");
  });
});
