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
  /**
   * USD per 1M cache-READ tokens (re-using an already-cached prefix). Deeply
   * discounted vs base input. Optional: when absent, a provider-aware default
   * is applied (see `cacheRates`) so a flat input rate is never used for cache.
   */
  cacheReadPerMTok?: number;
  /**
   * USD per 1M cache-WRITE tokens (creating a cache entry). Carries a premium
   * over base input. Optional: defaulted when absent.
   */
  cacheWritePerMTok?: number;
  /** Maximum context window size in tokens. Null when unknown. */
  contextWindow: number | null;
  /** Provider as normalized by detection layer. */
  provider: string;
  /** Quality tier, used by FinOps scoring. */
  tier: "low" | "mid" | "high" | "frontier";
  /**
   * True when these rates are a BLENDED fallback — the model was not found in
   * the pricing table, so the average rate across all priced generation models
   * is used instead of $0. Consumers should surface this subtly (e.g. a small
   * "≈ blended rate" hint) and invite the user to add the model to the table
   * for an accurate figure. Real table entries leave this undefined.
   */
  blended?: boolean;
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
  // Claude 5 family (added 2026-08). Sonnet 5 priced at parity with the
  // established Sonnet-tier rate this table already uses (3/15 has held
  // across the 4.x generations) rather than a tenant-specific figure. Fable 5
  // is a newer, less-documented top-tier model — priced at the same frontier
  // rate as Opus as a reasonable placeholder pending an official published
  // rate card; correct via the Model Pricing panel if it's off.
  "claude-sonnet-5": {
    inputPerMTok: 3,
    outputPerMTok: 15,
    contextWindow: 200_000,
    provider: "Anthropic",
    tier: "high",
  },
  "fable-5": {
    inputPerMTok: 15,
    outputPerMTok: 75,
    contextWindow: null,
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
  "claude-opus-4-1": {
    inputPerMTok: 15,
    outputPerMTok: 75,
    contextWindow: 200_000,
    provider: "Anthropic",
    tier: "frontier",
  },
  "claude-2-1": {
    inputPerMTok: 8,
    outputPerMTok: 24,
    contextWindow: 200_000,
    provider: "Anthropic",
    tier: "mid",
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
  "gpt-3-5-turbo": {
    inputPerMTok: 0.5,
    outputPerMTok: 1.5,
    contextWindow: 16_385,
    provider: "OpenAI",
    tier: "low",
  },
  // OpenAI open-weight model, served via Bedrock as `gpt-oss-20b-1:0`.
  // Both the dated key and the bare alias are present so either form resolves.
  "gpt-oss-20b-1": {
    inputPerMTok: 0.1,
    outputPerMTok: 0.4,
    contextWindow: 131_072,
    provider: "OpenAI",
    tier: "mid",
  },
  "gpt-oss-20b": {
    inputPerMTok: 0.1,
    outputPerMTok: 0.4,
    contextWindow: 131_072,
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
  "gemini-2-0-flash": {
    inputPerMTok: 0.1,
    outputPerMTok: 0.4,
    contextWindow: 1_048_576,
    provider: "Google",
    tier: "mid",
  },
  "gemini-1-5-pro": {
    inputPerMTok: 1.25,
    outputPerMTok: 5,
    contextWindow: 2_097_152,
    provider: "Google",
    tier: "high",
  },
  "gemini-1-5-flash": {
    inputPerMTok: 0.075,
    outputPerMTok: 0.3,
    contextWindow: 1_048_576,
    provider: "Google",
    tier: "mid",
  },

  // Meta Llama (served via Bedrock / Ollama)
  "llama3-1-8b": {
    inputPerMTok: 0.22,
    outputPerMTok: 0.22,
    contextWindow: 131_072,
    provider: "Meta",
    tier: "mid",
  },
  "llama3-1-405b": {
    inputPerMTok: 5.32,
    outputPerMTok: 16,
    contextWindow: 131_072,
    provider: "Meta",
    tier: "frontier",
  },

  // Mistral
  "mistral-small-22b": {
    inputPerMTok: 0.2,
    outputPerMTok: 0.6,
    contextWindow: 32_768,
    provider: "Mistral",
    tier: "mid",
  },

  // DeepSeek
  "deepseek-llm-r1-7b": {
    inputPerMTok: 0.1,
    outputPerMTok: 0.4,
    contextWindow: 65_536,
    provider: "DeepSeek",
    tier: "mid",
  },

  // Small / local demo model (Ollama). Representative hosted-equivalent rates.
  "orca-mini-3b": {
    inputPerMTok: 0.1,
    outputPerMTok: 0.2,
    contextWindow: 4_096,
    provider: "Ollama",
    tier: "low",
  },

  // Amazon Titan text generation
  "titan-text-lite": {
    inputPerMTok: 0.15,
    outputPerMTok: 0.2,
    contextWindow: 4_096,
    provider: "AWS Bedrock",
    tier: "low",
  },
  // Added 2026-08 — public AWS Bedrock list rate.
  "titan-text-express": {
    inputPerMTok: 0.2,
    outputPerMTok: 0.6,
    contextWindow: 8_000,
    provider: "AWS Bedrock",
    tier: "low",
  },
  "titan-text-premier": {
    inputPerMTok: 0.5,
    outputPerMTok: 1.5,
    contextWindow: 32_000,
    provider: "AWS Bedrock",
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
  "titan-embed-image": {
    inputPerMTok: 0.08,
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
  "text-embedding-ada": {
    inputPerMTok: 0.1,
    outputPerMTok: 0,
    contextWindow: 8_191,
    provider: "OpenAI",
    tier: "low",
  },
  // Google Vertex AI text embeddings (`textembedding-gecko@001`).
  "textembedding-gecko": {
    inputPerMTok: 0.025,
    outputPerMTok: 0,
    contextWindow: 3_072,
    provider: "Google",
    tier: "low",
  },

  // NOTE: demolive also emits synthetic placeholder model names ("genai-demo",
  // "genai-model") that are not real billable models. They are intentionally
  // omitted — they fall through to UNKNOWN_PRICE (0 cost) rather than being
  // given a fabricated rate.
};

/** LLM hosting platform. Same model can be priced differently per platform. */
export type PricingPlatform = "direct" | "aws_bedrock" | "azure" | "gcp_vertex";

/** Composite override/registry key. `direct` stays bare for backward compat with
 *  every existing lookup and saved override; other platforms are namespaced. */
export const platformKey = (platform: PricingPlatform, modelKey: string): string =>
  platform === "direct" ? modelKey : `${platform}::${modelKey}`;

/** Bedrock-native models (Amazon Titan/Nova) — priced only on Bedrock. Claude on
 *  Bedrock is intentionally ABSENT here so it falls back to the Direct Claude
 *  rate (at parity today). Keys are normalizeModelKey() outputs. */
export const PRICING_BEDROCK: Record<string, ModelPricing> = {
  "nova-lite": {
    inputPerMTok: 0.06, outputPerMTok: 0.24, contextWindow: 300_000,
    provider: "Amazon", tier: "low",
  },
  "nova-2-lite": {
    inputPerMTok: 0.06, outputPerMTok: 0.24, contextWindow: 300_000,
    provider: "Amazon", tier: "low",
  },
  "nova-micro": {
    inputPerMTok: 0.035, outputPerMTok: 0.14, contextWindow: 128_000,
    provider: "Amazon", tier: "low",
  },
  "nova-pro": {
    inputPerMTok: 0.8, outputPerMTok: 3.2, contextWindow: 300_000,
    provider: "Amazon", tier: "mid",
  },
  // Added 2026-08 — public AWS Bedrock list rate; 1M-token context is Nova
  // Premier's distinguishing feature over Nova Pro's 300K.
  "nova-premier": {
    inputPerMTok: 2.5, outputPerMTok: 12.5, contextWindow: 1_000_000,
    provider: "Amazon", tier: "high",
  },
};

/** Per-platform built-in rate tables. `direct` is the existing PRICING table. */
export const PLATFORM_PRICING: Record<PricingPlatform, Record<string, ModelPricing>> = {
  direct: PRICING,
  aws_bedrock: PRICING_BEDROCK,
  azure: {},
  gcp_vertex: {},
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
  // Strip an ARN / inference-profile path, keeping only the trailing model id
  // (arn:aws:bedrock:…:inference-profile/us.anthropic.claude-… → us.anthropic.claude-…).
  // No canonical model key contains a "/", so this never removes real content.
  s = s.replace(/^.*\//, "");
  // Strip Bedrock region prefix (us., eu., apac., ap., sa., global.)
  s = s.replace(/^(us|eu|apac|ap|sa|global)\./, "");
  // Strip vendor prefix
  s = s.replace(
    /^(anthropic|amazon|meta|cohere|mistral|ai21|openai|google|deepseek)\./,
    "",
  );
  // Azure spells GPT-3.5 without the dot (`gpt-35-turbo`); fold it back so it
  // resolves to the same key as the canonical `gpt-3.5-turbo`.
  s = s.replace(/^gpt-35(?=-|$)/, "gpt-3-5");
  // Fold an Ollama-style size tag into the key, keeping the size (it drives
  // price/tier): `llama3.1:8b` → `llama3.1-8b`, `mistral-small:22b` → `…-22b`.
  // Runs before the bare `:N` revision strip so the trailing `b` is preserved.
  s = s.replace(/:(\d+(?:\.\d+)?b)$/, "-$1");
  // Strip a Vertex AI publisher revision suffix (`@001`).
  s = s.replace(/@\d+$/, "");
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
  // Strip Google-style trailing partial dates and preview/experimental tags
  // (`gemini-2-5-pro-preview-03-25` → `gemini-2-5-pro`).
  s = s.replace(/-\d{2}-\d{2}$/, "");
  s = s.replace(/-(preview|exp|latest)$/, "");
  // Strip a trailing 3-digit stable-revision suffix (`gemini-1-5-flash-002` →
  // `gemini-1-5-flash`). No canonical key ends in exactly three digits, so this
  // never collides with a real model name.
  s = s.replace(/-\d{3}$/, "");
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
    for (const [rawKey, val] of Object.entries(next)) {
      const sep = rawKey.indexOf("::");
      const stored =
        sep === -1
          ? normalizeModelKey(rawKey)
          : `${rawKey.slice(0, sep)}::${normalizeModelKey(rawKey.slice(sep + 2))}`;
      PRICING_OVERRIDES.set(stored, val);
    }
  }
  for (const listener of PRICING_OVERRIDE_LISTENERS) listener();
};

/** Subscribe to override changes — used by tests / debug surfaces. */
export const subscribePricingOverrides = (cb: () => void): (() => void) => {
  PRICING_OVERRIDE_LISTENERS.add(cb);
  return () => PRICING_OVERRIDE_LISTENERS.delete(cb);
};

export const getPricing = (
  model: string | undefined | null,
  platform: PricingPlatform = "direct",
): ModelPricing => {
  if (!model) return UNKNOWN_PRICE;
  const key = normalizeModelKey(model);
  return (
    PRICING_OVERRIDES.get(platformKey(platform, key)) ??
    PLATFORM_PRICING[platform]?.[key] ??
    (platform !== "direct"
      ? (PRICING_OVERRIDES.get(key) ?? PRICING[key])
      : undefined) ??
    UNKNOWN_PRICE
  );
};

/**
 * Snapshot of the merged pricing table (built-ins + overrides). Used by
 * the config panel to display the current effective rates.
 */
export const getEffectivePricing = (
  platform: PricingPlatform = "direct",
): Record<string, ModelPricing> => {
  const merged: Record<string, ModelPricing> = { ...(PLATFORM_PRICING[platform] ?? {}) };
  const prefix = platform === "direct" ? "" : `${platform}::`;
  for (const [key, val] of PRICING_OVERRIDES.entries()) {
    if (platform === "direct" && key.includes("::")) continue;
    if (platform !== "direct" && !key.startsWith(prefix)) continue;
    merged[key.slice(prefix.length)] = val;
  }
  return merged;
};

/**
 * True for embedding / rerank (retrieval) models rather than generation models.
 * Retrieval calls produce zero output tokens, so including them in
 * generation-quality ratios (token efficiency, completion rate, output-per-
 * dollar) silently drags those metrics toward zero. Callers that compute such
 * ratios should exclude these. Detected by name because this tenant labels
 * embeddings with gen_ai.operation.name "text_completion" (not "embeddings"),
 * making the model name the only reliable discriminator.
 */
export const isRetrievalModel = (model: string | null | undefined): boolean => {
  if (!model) return false;
  const s = model.toLowerCase();
  return s.includes("embed") || s.includes("rerank");
};

/** Estimated USD cost given token counts and a pricing record. */
export const estimateCost = (
  inputTok: number,
  outputTok: number,
  pricing: ModelPricing,
): number =>
  (inputTok * pricing.inputPerMTok + outputTok * pricing.outputPerMTok) /
  1_000_000;

/**
 * Blended fallback rate: the mean input/output price across every priced
 * *generation* model in the effective table (built-ins + user overrides).
 * Retrieval models (embeddings/rerank) are excluded — their 0 output price
 * would drag the blend down and they aren't comparable to generation calls.
 *
 * Used so a model that is missing from the table costs a representative
 * estimate rather than $0 (which reads as "free" and is misleading). The
 * returned record is flagged `blended: true` so callers can subtly indicate
 * the number is an estimate and prompt the user to add the model.
 */
export const getBlendedPricing = (): ModelPricing => {
  const gen = Object.entries(getEffectivePricing()).filter(
    ([key, p]) => !p.blended && !isRetrievalModel(key),
  );
  const n = gen.length;
  if (n === 0) return { ...UNKNOWN_PRICE, blended: true };
  const inAvg = gen.reduce((s, [, p]) => s + p.inputPerMTok, 0) / n;
  const outAvg = gen.reduce((s, [, p]) => s + p.outputPerMTok, 0) / n;
  return {
    inputPerMTok: inAvg,
    outputPerMTok: outAvg,
    contextWindow: null,
    provider: "Blended",
    tier: "mid",
    blended: true,
  };
};

/**
 * Cost-calculation resolver. Unlike `getPricing` (which returns the inert
 * `UNKNOWN_PRICE` / $0 for unknowns), this returns the blended fallback for any
 * model — including a missing or unreported one — so cost math is never
 * silently $0. The `blended` flag on the result tells the UI to show the
 * "estimated, add the model for accuracy" hint. Prefer this in every cost
 * computation; keep `getPricing` for places that must distinguish "known" from
 * "unknown" explicitly.
 */
export const resolveModelPricing = (
  model: string | null | undefined,
  platform: PricingPlatform = "direct",
): ModelPricing => {
  if (model) {
    const key = normalizeModelKey(model);
    // 1. platform-specific override, then platform-specific built-in
    const platHit =
      PRICING_OVERRIDES.get(platformKey(platform, key)) ??
      PLATFORM_PRICING[platform]?.[key];
    if (platHit) return platHit;
    // 2. fall back to Direct (override then built-in) — Claude-on-Bedrock path
    if (platform !== "direct") {
      const directHit = PRICING_OVERRIDES.get(key) ?? PRICING[key];
      if (directHit) return directHit;
    }
  }
  return getBlendedPricing();
};

// ── Cache-aware cost model (single source of truth for cost & billable tokens) ─

/**
 * Default cache-tier multipliers, applied when a model omits explicit cache
 * rates. Cache reads are deeply discounted; cache writes carry a premium.
 * OpenAI/Azure discount cache reads ~50%; Anthropic and most others ~90%.
 */
export const CACHE_WRITE_MULTIPLIER = 1.25;
const cacheRates = (p: ModelPricing): { read: number; write: number } => ({
  read:
    p.cacheReadPerMTok ??
    p.inputPerMTok * (/openai|azure/i.test(p.provider) ? 0.5 : 0.1),
  write: p.cacheWritePerMTok ?? p.inputPerMTok * CACHE_WRITE_MULTIPLIER,
});

/**
 * Per-tier token counts AFTER provider cache-accounting normalization
 * (see detection/cacheAccounting.ts). `inputTokens` is UNCACHED input only;
 * cache-read and cache-write are separate. When a tenant emits no cache
 * attributes these collapse to (inputTokens, outputTokens) and behaviour is
 * identical to the old flat model.
 */
export interface NormalizedTokens {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface CostBreakdown {
  /** USD, priced per tier from the (overrideable) rate table. */
  effectiveCost: number;
  /**
   * Tokens the workload is genuinely billed "fresh" for: uncached input +
   * cache writes + output. EXCLUDES cache reads, so a loop that re-sends a
   * cached prefix reads as cheap rather than as runaway growth (I.1 depends
   * on this).
   */
  billableTokens: number;
  /** True when the blended fallback rate was used (model not in the table). */
  blended: boolean;
}

/** Zeroed token record — convenience for callers building a NormalizedTokens. */
export const emptyTokens = (): NormalizedTokens => ({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
});

/**
 * THE cost function. Every cost figure and every token-volume detector in the
 * app must flow through this — never price from raw input_tokens/prompt_tokens
 * directly. Decomposes a call into its four token tiers and prices each from
 * the effective rate table, returning both effectiveCost and billableTokens.
 */
export const computeCost = (
  tokens: NormalizedTokens,
  model: string | null | undefined,
  platform: PricingPlatform = "direct",
): CostBreakdown => {
  const pricing = resolveModelPricing(model, platform);
  const { read, write } = cacheRates(pricing);
  const effectiveCost =
    (tokens.inputTokens * pricing.inputPerMTok +
      tokens.cacheReadTokens * read +
      tokens.cacheWriteTokens * write +
      tokens.outputTokens * pricing.outputPerMTok) /
    1_000_000;
  const billableTokens =
    tokens.inputTokens + tokens.cacheWriteTokens + tokens.outputTokens;
  return {
    effectiveCost,
    billableTokens,
    blended: pricing.blended === true,
  };
};

/**
 * Convenience: effective USD for a simple (input, output[, cache]) call, routed
 * through the cache-aware cost model and the blended fallback (so an unknown
 * model estimates rather than charging $0). Pass `model: null` to price a
 * fleet-aggregate token bucket at the blended rate. Prefer `computeCost` when
 * you also need billableTokens or the `blended` flag.
 */
export const costOf = (
  inputTokens: number,
  outputTokens: number,
  model: string | null | undefined,
  cache?: { read?: number; write?: number },
  platform: PricingPlatform = "direct",
): number =>
  computeCost(
    {
      inputTokens,
      outputTokens,
      cacheReadTokens: cache?.read ?? 0,
      cacheWriteTokens: cache?.write ?? 0,
    },
    model,
    platform,
  ).effectiveCost;
