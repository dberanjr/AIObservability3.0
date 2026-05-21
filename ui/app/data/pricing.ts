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
  "claude-opus-4-6": {
    inputPerMTok: 15,
    outputPerMTok: 75,
    contextWindow: 200_000,
    provider: "Anthropic",
    tier: "frontier",
  },
  "claude-3-7-sonnet": {
    inputPerMTok: 3,
    outputPerMTok: 15,
    contextWindow: 200_000,
    provider: "Anthropic",
    tier: "high",
  },
  "claude-3-5-sonnet": {
    inputPerMTok: 3,
    outputPerMTok: 15,
    contextWindow: 200_000,
    provider: "Anthropic",
    tier: "high",
  },
  "claude-3-5-haiku": {
    inputPerMTok: 0.8,
    outputPerMTok: 4,
    contextWindow: 200_000,
    provider: "Anthropic",
    tier: "mid",
  },
  "claude-3-haiku": {
    inputPerMTok: 0.25,
    outputPerMTok: 1.25,
    contextWindow: 200_000,
    provider: "Anthropic",
    tier: "low",
  },
  "claude-3-opus": {
    inputPerMTok: 15,
    outputPerMTok: 75,
    contextWindow: 200_000,
    provider: "Anthropic",
    tier: "frontier",
  },

  // OpenAI
  "gpt-4-1": {
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
  "gemini-2-5-pro": {
    inputPerMTok: 1.25,
    outputPerMTok: 10,
    contextWindow: 1_048_576,
    provider: "Google",
    tier: "high",
  },
  "gemini-2-5-flash": {
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

/**
 * Normalize a model name to its lookup key. Handles the variants seen in
 * the wild on Bedrock-fronted deployments:
 *   us.anthropic.claude-sonnet-4-5-20250114-v1:0  → claude-sonnet-4-5
 *   anthropic.claude-3-7-sonnet-20250219-v1:0     → claude-3-7-sonnet
 *   global.anthropic.claude-haiku-4-5             → claude-haiku-4-5
 *   gpt-4o-2024-08-06                             → gpt-4o
 *   Claude-Sonnet-4.5                             → claude-sonnet-4-5
 */
export const normalizeModelKey = (model: string): string => {
  let s = model.trim().toLowerCase();
  // Strip Bedrock region prefix (us., eu., apac., ap., sa., global.)
  s = s.replace(/^(us|eu|apac|ap|sa|global)\./, "");
  // Strip vendor prefix
  s = s.replace(
    /^(anthropic|amazon|meta|cohere|mistral|ai21|openai|google)\./,
    "",
  );
  // Strip trailing Bedrock revision `:N`
  s = s.replace(/:\d+$/, "");
  // Strip trailing version segment `-v1` or `:v1`
  s = s.replace(/[-:]v\d+$/, "");
  // Strip trailing dates: `-YYYYMMDD` (Anthropic style) and
  // `-YYYY-MM-DD` (OpenAI style).
  s = s.replace(/-\d{8}$/, "");
  s = s.replace(/-\d{4}-\d{2}-\d{2}$/, "");
  // Normalize friendly periods to canonical hyphens (4.5 → 4-5).
  s = s.replace(/\./g, "-");
  return s;
};

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
