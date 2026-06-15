/**
 * Provider cache-accounting normalization (cost-model section G.5).
 *
 * Providers disagree on how cached tokens are reported:
 *   - INCLUSIVE (OpenAI, Azure): `prompt_tokens` already INCLUDES cached tokens,
 *     and `cached_tokens` is a subset of it. Uncached input = prompt − cached.
 *   - EXCLUSIVE (Anthropic, Bedrock-Anthropic, most OTel GenAI): `input_tokens`
 *     EXCLUDES cache; `cache_read.input_tokens` and
 *     `cache_creation_input_tokens` are reported separately and add on top.
 *
 * To make fleet cost numbers comparable we normalize BOTH conventions to a
 * single definition (uncached input + separate cache-read + cache-write) before
 * costing. This lives alongside the existing provider normalization in
 * detection/ and is the only cache-aware step upstream of the cost model.
 *
 * Note: both current validation tenants emit zero cache tokens, so in practice
 * this collapses to (input, output) today — but it must be correct for tenants
 * that do enable prompt caching.
 */
import type { NormalizedTokens } from "../data/pricing";

/** Providers that report prompt tokens INCLUSIVE of cached tokens. */
const INCLUSIVE_PROVIDER_RE = /openai|azure/i;

export interface RawTokenUsage {
  /** Normalized provider id/label (from detection/attributes normalizeProvider). */
  provider?: string | null;
  /** gen_ai.usage.input_tokens or gen_ai.usage.prompt_tokens. */
  inputTokens?: number | null;
  /** gen_ai.usage.output_tokens or gen_ai.usage.completion_tokens. */
  outputTokens?: number | null;
  /** gen_ai.usage.cached_tokens or gen_ai.usage.cache_read.input_tokens. */
  cachedTokens?: number | null;
  /** gen_ai.usage.cache_creation_input_tokens. */
  cacheCreationTokens?: number | null;
}

const n = (v: number | null | undefined): number =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;

/**
 * Fold a provider's raw usage counters into the canonical NormalizedTokens
 * where `inputTokens` is strictly UNCACHED input.
 */
export const normalizeTokenAccounting = (
  raw: RawTokenUsage,
): NormalizedTokens => {
  const rawInput = n(raw.inputTokens);
  const output = n(raw.outputTokens);
  const cacheRead = n(raw.cachedTokens);
  const cacheWrite = n(raw.cacheCreationTokens);
  const inclusive = INCLUSIVE_PROVIDER_RE.test(raw.provider ?? "");
  // Inclusive providers fold cached tokens into the prompt total; subtract them
  // back out so input is uncached-only. Clamp at 0 in case of inconsistent
  // provider counts.
  const inputTokens = inclusive ? Math.max(0, rawInput - cacheRead) : rawInput;
  return {
    inputTokens,
    outputTokens: output,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
  };
};
