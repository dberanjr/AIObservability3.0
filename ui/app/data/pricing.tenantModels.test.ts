import { describe, expect, it } from "vitest";
import {
  estimateCost,
  getBlendedPricing,
  getPricing,
  normalizeModelKey,
  resolveModelPricing,
  UNKNOWN_PRICE,
} from "./pricing";

/**
 * Drift guard for the model strings actually observed on the validation
 * tenants (united-nonprod / ualpre and demolive), captured 2026-06-13. Every
 * real model emitted by either tenant must resolve to a priced entry so cost
 * figures are not silently zero. Synthetic placeholders the demo tenant emits
 * ("genai-demo", "genai-model") are deliberately NOT priced and must stay
 * UNKNOWN rather than being given a fabricated rate.
 */

// Real models observed in the wild (raw, unnormalized as emitted on the span).
const REAL_MODELS = [
  // ualpre — Bedrock-fronted Anthropic + Titan
  "us.anthropic.claude-opus-4-7",
  "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
  "Claude-Haiku-4.5",
  "global.anthropic.claude-haiku-4-5-20251001-v1:0",
  "global.anthropic.claude-opus-4-6-v1",
  "us.anthropic.claude-sonnet-4-20250514-v1:0",
  "us.anthropic.claude-3-5-haiku-20241022-v1:0",
  "us.anthropic.claude-3-5-sonnet-20240620-v1:0",
  "us.anthropic.claude-3-7-sonnet-20250219-v1:0",
  "GPT-4o",
  "amazon.titan-embed-text-v2:0",
  "amazon.titan-embed-image-v1",
  // demolive — multi-provider
  "textembedding-gecko@001",
  "titan-embed-text-v1",
  "llama3.1:8b",
  "llama3.1:405b",
  "mistral-small:22b",
  "orca-mini:3b",
  "gemini-1.5-flash-002",
  "text-embedding-3-small",
  "gemini-2.5-pro-preview-03-25",
  "text-embedding-3-large",
  "gemini-2.0-flash-001",
  "text-embedding-ada-002",
  "gpt-4o",
  "gpt-35-turbo",
  "gpt-oss-20b-1:0",
  "claude-opus-4-1-20250805-v1",
  "titan-text-lite-v1",
  "amazon.titan-text-premier-v1:0",
  "deepseek-llm-r1:7b",
  "claude-2.1",
];

const SYNTHETIC_PLACEHOLDERS = ["genai-demo", "genai-model"];

describe("tenant model pricing coverage", () => {
  it.each(REAL_MODELS)("prices %s", (model) => {
    const p = getPricing(model);
    expect(p, `${model} → ${normalizeModelKey(model)} is unpriced`).not.toBe(
      UNKNOWN_PRICE,
    );
    // Generation models must have a positive output price; embeddings are 0.
    if (!/embed|gecko/i.test(normalizeModelKey(model))) {
      expect(p.outputPerMTok).toBeGreaterThan(0);
    }
  });

  it.each(SYNTHETIC_PLACEHOLDERS)(
    "leaves synthetic placeholder %s unpriced via getPricing",
    (model) => {
      expect(getPricing(model)).toBe(UNKNOWN_PRICE);
    },
  );
});

describe("blended fallback (no $0 for missing models)", () => {
  it("returns a flagged, positive blended rate", () => {
    const b = getBlendedPricing();
    expect(b.blended).toBe(true);
    expect(b.inputPerMTok).toBeGreaterThan(0);
    expect(b.outputPerMTok).toBeGreaterThan(0);
    expect(b.provider).toBe("Blended");
  });

  it.each([...SYNTHETIC_PLACEHOLDERS, "homemade-llm-v1", null, undefined])(
    "resolveModelPricing(%s) blends instead of returning $0",
    (model) => {
      const p = resolveModelPricing(model);
      expect(p.blended).toBe(true);
      // A real generation workload now costs a representative estimate, not 0.
      expect(estimateCost(1_000_000, 1_000_000, p)).toBeGreaterThan(0);
    },
  );

  it("resolves known models to their real (non-blended) rate", () => {
    const p = resolveModelPricing("gpt-4o");
    expect(p.blended).toBeUndefined();
    expect(p.inputPerMTok).toBe(2.5);
  });

  it("blends generation models only (embeddings excluded from the mean)", () => {
    // Output blend must be well above 0 — proof embeddings' 0-output rate
    // isn't dragging the average down.
    expect(getBlendedPricing().outputPerMTok).toBeGreaterThan(1);
  });
});
