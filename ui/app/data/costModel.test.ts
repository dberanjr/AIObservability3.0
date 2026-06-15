import { describe, expect, it } from "vitest";
import {
  computeCost,
  emptyTokens,
  estimateCost,
  getPricing,
  type NormalizedTokens,
} from "./pricing";
import { normalizeTokenAccounting } from "../detection/cacheAccounting";

const tokens = (p: Partial<NormalizedTokens>): NormalizedTokens => ({
  ...emptyTokens(),
  ...p,
});

describe("computeCost — cache tiers", () => {
  it("prices cache reads BELOW base input and cache writes ABOVE it", () => {
    const model = "claude-sonnet-4-6"; // $3 input / $15 output, Anthropic
    const base = computeCost(tokens({ inputTokens: 1_000_000 }), model);
    const read = computeCost(tokens({ cacheReadTokens: 1_000_000 }), model);
    const write = computeCost(tokens({ cacheWriteTokens: 1_000_000 }), model);
    expect(read.effectiveCost).toBeLessThan(base.effectiveCost);
    expect(write.effectiveCost).toBeGreaterThan(base.effectiveCost);
  });

  it("collapses to the plain (input, output) computation when no cache tokens", () => {
    const model = "gpt-4o";
    const cm = computeCost(
      tokens({ inputTokens: 1_000_000, outputTokens: 500_000 }),
      model,
    );
    const flat = estimateCost(1_000_000, 500_000, getPricing(model));
    expect(cm.effectiveCost).toBeCloseTo(flat);
  });

  it("billableTokens EXCLUDES cache reads (cached-prefix loop reads cheap)", () => {
    const model = "claude-sonnet-4-6";
    const cm = computeCost(
      tokens({
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 1_000_000, // huge re-sent cached prefix
        cacheWriteTokens: 200,
      }),
      model,
    );
    // 100 + 200 (write) + 50 = 350, NOT 1,000,350.
    expect(cm.billableTokens).toBe(350);
  });

  it("flags blended when the model is unknown rather than charging $0", () => {
    const cm = computeCost(tokens({ inputTokens: 1_000_000 }), "who-knows-x");
    expect(cm.blended).toBe(true);
    expect(cm.effectiveCost).toBeGreaterThan(0);
  });
});

describe("normalizeTokenAccounting — provider differences", () => {
  it("OpenAI/Azure: subtracts cached tokens out of the inclusive prompt total", () => {
    const norm = normalizeTokenAccounting({
      provider: "OpenAI",
      inputTokens: 1000, // includes 300 cached
      cachedTokens: 300,
      outputTokens: 200,
    });
    expect(norm.inputTokens).toBe(700);
    expect(norm.cacheReadTokens).toBe(300);
    expect(norm.outputTokens).toBe(200);
  });

  it("Anthropic: input is already exclusive of cache — left intact", () => {
    const norm = normalizeTokenAccounting({
      provider: "Anthropic",
      inputTokens: 700,
      cachedTokens: 300,
      cacheCreationTokens: 50,
      outputTokens: 200,
    });
    expect(norm.inputTokens).toBe(700);
    expect(norm.cacheReadTokens).toBe(300);
    expect(norm.cacheWriteTokens).toBe(50);
  });

  it("normalized tokens cost the same across providers for equal real usage", () => {
    // 700 uncached + 300 cached read, same model family rates.
    const oai = normalizeTokenAccounting({
      provider: "openai",
      inputTokens: 1000,
      cachedTokens: 300,
    });
    const anth = normalizeTokenAccounting({
      provider: "anthropic",
      inputTokens: 700,
      cachedTokens: 300,
    });
    expect(oai.inputTokens).toBe(anth.inputTokens);
    expect(oai.cacheReadTokens).toBe(anth.cacheReadTokens);
  });
});
