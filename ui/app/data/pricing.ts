/**
 * Model pricing + context window lookup table.
 * Prices in USD per 1M tokens. Values are list prices as of early 2026 and
 * should be reviewed before being used for chargeback. Unknown models fall
 * back to the `UNKNOWN_PRICE` placeholder so cost math degrades gracefully.
 */

export interface ModelPricing {
  /** USD per 1M input tokens. */
  inputPerMTok: number;
  /** USD per 1M output tokens. */
  outputPerMTok: number;
  /** Maximum context window size in tokens. Null when unknown. */
  contextWindow: number | null;
  /** Provider as normalized by detection layer. */
  provider: string;
  /** Quality tier, used by FinOps scoring. */
  tier: "low" | "mid" | "high" | "frontier";
}

export const UNKNOWN_PRICE: ModelPricing = {
  inputPerMTok: 0,
  outputPerMTok: 0,
  contextWindow: null,
  provider: "Unknown",
  tier: "mid",
};

export const PRICING: Record<string, ModelPricing> = {
  // Anthropic
  "claude-opus-4-5": {
    inputPerMTok: 15,
    outputPerMTok: 75,
    contextWindow: 200_000,
    provider: "Anthropic",
    tier: "frontier",
  },
  "claude-sonnet-4-6": {
    inputPerMTok: 3,
    outputPerMTok: 15,
    contextWindow: 200_000,
    provider: "Anthropic",
    tier: "high",
  },
  "claude-sonnet-4-5": {
    inputPerMTok: 3,
    outputPerMTok: 15,
    contextWindow: 200_000,
    provider: "Anthropic",
    tier: "high",
  },
  "claude-haiku-4-5": {
    inputPerMTok: 1,
    outputPerMTok: 5,
    contextWindow: 200_000,
    provider: "Anthropic",
    tier: "mid",
  },

  // OpenAI
  "gpt-4.1": {
    inputPerMTok: 2,
    outputPerMTok: 8,
    contextWindow: 128_000,
    provider: "OpenAI",
    tier: "high",
  },
  "gpt-4o": {
    inputPerMTok: 2.5,
    outputPerMTok: 10,
    contextWindow: 128_000,
    provider: "OpenAI",
    tier: "high",
  },
  "gpt-4o-mini": {
    inputPerMTok: 0.15,
    outputPerMTok: 0.6,
    contextWindow: 128_000,
    provider: "OpenAI",
    tier: "mid",
  },

  // Google
  "gemini-2.5-pro": {
    inputPerMTok: 1.25,
    outputPerMTok: 10,
    contextWindow: 1_048_576,
    provider: "Google",
    tier: "high",
  },
  "gemini-2.5-flash": {
    inputPerMTok: 0.075,
    outputPerMTok: 0.3,
    contextWindow: 1_048_576,
    provider: "Google",
    tier: "mid",
  },

  // Embeddings
  "text-embedding-3-large": {
    inputPerMTok: 0.13,
    outputPerMTok: 0,
    contextWindow: 8_191,
    provider: "OpenAI",
    tier: "low",
  },
  "text-embedding-3-small": {
    inputPerMTok: 0.02,
    outputPerMTok: 0,
    contextWindow: 8_191,
    provider: "OpenAI",
    tier: "low",
  },
};

/** Normalize a model name to its lookup key. Trims version suffixes like `-20250114`. */
export const normalizeModelKey = (model: string): string =>
  model.trim().toLowerCase().replace(/-\d{8}$/, "");

export const getPricing = (model: string | undefined | null): ModelPricing => {
  if (!model) return UNKNOWN_PRICE;
  return PRICING[normalizeModelKey(model)] ?? UNKNOWN_PRICE;
};

/** Estimated USD cost given token counts and a pricing record. */
export const estimateCost = (
  inputTok: number,
  outputTok: number,
  pricing: ModelPricing,
): number =>
  (inputTok * pricing.inputPerMTok + outputTok * pricing.outputPerMTok) /
  1_000_000;
