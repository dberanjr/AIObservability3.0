import { describe, expect, it } from "vitest";
import {
  PRICING,
  UNKNOWN_PRICE,
  estimateCost,
  getPricing,
  normalizeModelKey,
} from "./pricing";

describe("normalizeModelKey", () => {
  it("lowercases and strips an 8-digit date suffix", () => {
    expect(normalizeModelKey("Claude-Sonnet-4-6-20250114")).toBe(
      "claude-sonnet-4-6",
    );
  });

  it("leaves keys without a date suffix alone (apart from case)", () => {
    expect(normalizeModelKey("GPT-4o")).toBe("gpt-4o");
    expect(normalizeModelKey("gemini-2.5-pro")).toBe("gemini-2.5-pro");
  });

  it("trims whitespace", () => {
    expect(normalizeModelKey("  claude-haiku-4-5  ")).toBe("claude-haiku-4-5");
  });
});

describe("getPricing", () => {
  it("returns the UNKNOWN_PRICE record for nullish input", () => {
    expect(getPricing(null)).toEqual(UNKNOWN_PRICE);
    expect(getPricing(undefined)).toEqual(UNKNOWN_PRICE);
    expect(getPricing("")).toEqual(UNKNOWN_PRICE);
  });

  it("returns the canonical record for known models", () => {
    expect(getPricing("claude-sonnet-4-6").provider).toBe("Anthropic");
    expect(getPricing("gpt-4o").provider).toBe("OpenAI");
    expect(getPricing("gemini-2.5-pro").provider).toBe("Google");
  });

  it("normalizes the lookup so dated suffixes still resolve", () => {
    expect(getPricing("Claude-Sonnet-4-6-20250114")).toEqual(
      PRICING["claude-sonnet-4-6"],
    );
  });

  it("returns UNKNOWN for never-heard-of-it models", () => {
    expect(getPricing("homemade-llm-v1")).toEqual(UNKNOWN_PRICE);
  });

  it("encodes context windows that the Models tab depends on", () => {
    expect(getPricing("claude-sonnet-4-6").contextWindow).toBe(200_000);
    expect(getPricing("gpt-4o").contextWindow).toBe(128_000);
    expect(getPricing("gemini-2.5-pro").contextWindow).toBe(1_048_576);
    expect(getPricing("text-embedding-3-large").contextWindow).toBe(8_191);
  });
});

describe("estimateCost", () => {
  it("returns 0 for zero tokens", () => {
    expect(
      estimateCost(0, 0, getPricing("claude-sonnet-4-6")),
    ).toBe(0);
  });

  it("computes input cost = inputTok × input$/MTok / 1M", () => {
    const pricing = getPricing("claude-sonnet-4-6"); // $3 input / $15 output
    // 1_000_000 input tokens × $3 / 1M = $3
    expect(estimateCost(1_000_000, 0, pricing)).toBeCloseTo(3);
  });

  it("computes output cost = outputTok × output$/MTok / 1M", () => {
    const pricing = getPricing("claude-sonnet-4-6");
    expect(estimateCost(0, 1_000_000, pricing)).toBeCloseTo(15);
  });

  it("sums input + output costs", () => {
    const pricing = getPricing("gpt-4o-mini"); // $0.15 / $0.6
    const cost = estimateCost(1_000_000, 500_000, pricing);
    expect(cost).toBeCloseTo(0.15 + 0.6 * 0.5);
  });

  it("returns 0 for unknown pricing", () => {
    expect(estimateCost(1_000_000, 1_000_000, UNKNOWN_PRICE)).toBe(0);
  });

  it("handles non-integer token counts without NaN", () => {
    const pricing = getPricing("gpt-4o");
    const cost = estimateCost(1234.5, 56.7, pricing);
    expect(Number.isFinite(cost)).toBe(true);
    expect(cost).toBeGreaterThan(0);
  });
});

describe("PRICING table sanity", () => {
  it("every entry has positive prices (except embeddings which have 0 output)", () => {
    for (const [key, entry] of Object.entries(PRICING)) {
      expect(entry.inputPerMTok).toBeGreaterThanOrEqual(0);
      expect(entry.outputPerMTok).toBeGreaterThanOrEqual(0);
      if (!/embed/i.test(key)) {
        expect(entry.outputPerMTok).toBeGreaterThan(0);
      }
    }
  });

  it("every entry has a valid tier", () => {
    for (const entry of Object.values(PRICING)) {
      expect(["low", "mid", "high", "frontier"]).toContain(entry.tier);
    }
  });
});
