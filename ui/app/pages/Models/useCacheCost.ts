/**
 * Prompt-cache and SDK-reported-cost rollup for the FinOps cache panel.
 *
 * Surfaces attributes the rest of the app doesn't yet consume:
 *   - gen_ai.usage.cached_tokens / cache_read.input_tokens (cache reads)
 *   - gen_ai.usage.cache_creation_input_tokens (cache writes)
 *   - gen_ai.usage.cost (provider/SDK-reported USD, vs. our token estimate)
 *
 * Token sums are sampling-variant, so they're extrapolated by the active
 * sampling ratio (same convention as the other FinOps/Pulse rollups).
 */

import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useSampling } from "../../scope/SamplingContext";
import { dqlTimeArg } from "../../scope/queries";
import { toNum } from "../../data/format";
import { AI_SPAN_POPULATION, firstNonNull } from "../../detection/attributeFields";
import { DEMO_CACHE_COST_RECORD } from "./demoData";

export interface CacheRecord {
  cache_read?: number | string;
  cache_write?: number | string;
  input?: number | string;
  output?: number | string;
  sdk_cost?: number | string;
  spans?: number | string;
}

export interface UseCacheCostResult {
  cacheReadTokens: number;
  cacheWriteTokens: number;
  inputTokens: number;
  outputTokens: number;
  /** Share of billable input served from cache (0..1). */
  cacheHitRate: number;
  /** Provider/SDK-reported cost (USD), extrapolated. */
  sdkCost: number;
  spans: number;
  isLoading: boolean;
  error?: Error;
}

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

const buildQuery = (from: string, to: string): string =>
  `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(from)}, to: ${dqlTimeArg(to)}
| filter ${AI_SPAN_POPULATION}
| summarize {
    cache_read = sum(toLong(coalesce(${firstNonNull("gen_ai.usage.cached_tokens", "gen_ai.usage.cache_read.input_tokens")}, 0))),
    cache_write = sum(toLong(coalesce(${firstNonNull("gen_ai.usage.cache_creation_input_tokens")}, 0))),
    input = sum(toLong(coalesce(${firstNonNull("gen_ai.usage.input_tokens", "gen_ai.usage.prompt_tokens")}, 0))),
    output = sum(toLong(coalesce(${firstNonNull("gen_ai.usage.output_tokens", "gen_ai.usage.completion_tokens")}, 0))),
    sdk_cost = sum(toDouble(coalesce(${firstNonNull("gen_ai.usage.cost")}, 0.0))),
    spans = count()
  }
`.trim();

/**
 * `showExample` defaults to false so this hook's behaviour is unchanged for
 * any other caller. When true, the real query is skipped and the fold below
 * runs over the canned `DEMO_CACHE_COST_RECORD` instead — same shape, same
 * extrapolation math, with the sampling multiplier pinned to 1 (the canned
 * totals already represent full-population counts).
 */
export const useCacheCost = (showExample = false): UseCacheCostResult => {
  const { scope } = useScope();
  const { samplingRatio } = useSampling();
  const tf = scope.timeframe;
  const query = useMemo(
    () => buildQuery(tf.from, tf.to ?? "now()"),
    [tf.from, tf.to],
  );
  const { data, isLoading, error } = useScopedDql<CacheRecord>(query, {
    staleTime: 60_000,
    enabled: !showExample,
  });

  return useMemo<UseCacheCostResult>(() => {
    if (showExample) {
      const rec = DEMO_CACHE_COST_RECORD;
      const cacheReadTokens = num(rec.cache_read);
      const inputTokens = num(rec.input);
      const billableInput = cacheReadTokens + inputTokens;
      return {
        cacheReadTokens,
        cacheWriteTokens: num(rec.cache_write),
        inputTokens,
        outputTokens: num(rec.output),
        cacheHitRate: billableInput > 0 ? cacheReadTokens / billableInput : 0,
        sdkCost: num(rec.sdk_cost),
        spans: num(rec.spans),
        isLoading: false,
        error: undefined,
      };
    }
    const rec = data?.records?.[0];
    const ex = (v: unknown): number => num(v) * samplingRatio;
    const cacheReadTokens = ex(rec?.cache_read);
    const inputTokens = ex(rec?.input);
    const billableInput = cacheReadTokens + inputTokens;
    return {
      cacheReadTokens,
      cacheWriteTokens: ex(rec?.cache_write),
      inputTokens,
      outputTokens: ex(rec?.output),
      cacheHitRate: billableInput > 0 ? cacheReadTokens / billableInput : 0,
      sdkCost: ex(rec?.sdk_cost),
      spans: ex(rec?.spans),
      isLoading,
      error: error ?? undefined,
    };
  }, [data, isLoading, error, samplingRatio, showExample]);
};
