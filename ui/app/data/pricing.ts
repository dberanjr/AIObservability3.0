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
  "claude-opus-4-7": {
    inputPerMTok: 15,
    outputPerMTok: 75,
    contextWindow: 200_000,
    provider: "Anthropic",
    tier: "frontier",
  },
  "claude-opus-4-8": {
    inputPerMTok: 15,
    outputPerMTok: 75,
    contextWindow: 200_000,
    provider: "Anthropic",
    tier: "frontier",
  },
  "claude-sonnet-4": {
    inputPerMTok: 3,
    outputPerMTok: 15,
    contextWindow: 200_000,
    provider: "Anthropic",
    tier: "high",
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

  // Bedrock embeddings & rerank
  "titan-embed-text": {
    inputPerMTok: 0.02,
    outputPerMTok: 0,
    contextWindow: 8_192,
    provider: "AWS Bedrock",
    tier: "low",
  },
  "rerank-v3-5": {
    inputPerMTok: 2,
    outputPerMTok: 0,
    contextWindow: 4_096,
    provider: "Cohere",
    tier: "low",
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
  // Canonical labels use spaces ("Claude Sonnet 4.5") — fold them to hyphens so
  // a display label resolves to the same key as the raw id ("claude-sonnet-4-5").
  s = s.replace(/\s+/g, "-");
  s = s.replace(/-+/g, "-");
  return s;
};

/**
 * Mutable runtime override registry, populated by ModelPricingContext when
 * a user edits prices in the Model Pricing panel. Saved org-wide via
 * state:app-states so the same numbers apply to every viewer.
 *
 * Kept as a module-level Map (not React state) so existing call sites of
 * `getPricing()` outside of React (hooks, derived numbers, query helpers)
 * pick up edits without each one needing to be retrofitted to a context.
 */
const PRICING_OVERRIDES = new Map<string, ModelPricing>();
const PRICING_OVERRIDE_LISTENERS = new Set<() => void>();

/**
 * Replace the entire override set. Called from ModelPricingContext on
 * load and after every save.
 */
export const setPricingOverrides = (
  next: Record<string, ModelPricing> | null | undefined,
): void => {
  PRICING_OVERRIDES.clear();
  if (next) {
    for (const [key, val] of Object.entries(next)) {
      PRICING_OVERRIDES.set(normalizeModelKey(key), val);
    }
  }
  for (const listener of PRICING_OVERRIDE_LISTENERS) listener();
};

/** Subscribe to override changes — used by tests / debug surfaces. */
export const subscribePricingOverrides = (cb: () => void): (() => void) => {
  PRICING_OVERRIDE_LISTENERS.add(cb);
  return () => PRICING_OVERRIDE_LISTENERS.delete(cb);
};

export const getPricing = (model: string | undefined | null): ModelPricing => {
  if (!model) return UNKNOWN_PRICE;
  const key = normalizeModelKey(model);
  return PRICING_OVERRIDES.get(key) ?? PRICING[key] ?? UNKNOWN_PRICE;
};

/**
 * Snapshot of the merged pricing table (built-ins + overrides). Used by
 * the config panel to display the current effective rates.
 */
export const getEffectivePricing = (): Record<string, ModelPricing> => {
  const merged: Record<string, ModelPricing> = { ...PRICING };
  for (const [key, val] of PRICING_OVERRIDES.entries()) {
    merged[key] = val;
  }
  return merged;
};

/** Estimated USD cost given token counts and a pricing record. */
export const estimateCost = (
  inputTok: number,
  outputTok: number,
  pricing: ModelPricing,
): number =>
  (inputTok * pricing.inputPerMTok + outputTok * pricing.outputPerMTok) /
  1_000_000;
