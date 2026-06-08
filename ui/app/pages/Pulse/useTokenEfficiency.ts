import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import {
  canQueryScope,
  useResolvedServices,
} from "../../scope/useResolvedServices";
import { buildTokenEfficiencyQuery } from "./dataQueries";
import { estimateCost, getPricing, isRetrievalModel } from "../../data/pricing";
import { toNum } from "../../data/format";

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

/** Throughput benchmark: tokens/sec that maps to a full throughput factor. */
const TARGET_TPS = 60;
/** Composite score weights. */
const W_LEVERAGE = 0.5;
const W_COMPLETION = 0.3;
const W_THROUGHPUT = 0.2;

export interface TokenEfficiency {
  /** Composite 0–100 cost/throughput/waste efficiency score (not quality). */
  score: number | null;
  /** output / (input + output), 0–1. */
  leverage: number;
  /** 1 − truncation rate, 0–1. */
  completionRate: number;
  /** output tokens / sec. */
  tokensPerSec: number;
  /** Plain metric: output tokens produced per US dollar spent. */
  outputPerDollar: number | null;
  // Drivers (the actionable levers):
  inputTokensPerRequest: number;
  truncationRatePct: number;
  costPer1kOutput: number | null;
  /** Whether any LLM span in scope carries an evaluation/quality score. */
  hasEval: boolean;
  isLoading: boolean;
  error?: Error;
}

export const useTokenEfficiency = (): TokenEfficiency => {
  const { scope } = useScope();
  const resolution = useResolvedServices();
  const canQuery = canQueryScope(resolution);

  const { data, isLoading, error } = useScopedDql<{
    model?: string;
    input_tokens?: number;
    output_tokens?: number;
    requests?: number;
    truncations?: number;
    eval_spans?: number;
    dur_s?: number;
  }>(
    canQuery
      ? buildTokenEfficiencyQuery(resolution.serviceIds, scope.timeframe)
      : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  return useMemo<TokenEfficiency>(() => {
    let input = 0;
    let output = 0;
    let requests = 0;
    let truncations = 0;
    let evalSpans = 0;
    let durS = 0;
    let cost = 0;
    for (const r of data?.records ?? []) {
      // Token efficiency is a generation-quality metric. Embedding/rerank
      // models produce zero output tokens and would drag every ratio toward
      // zero, so exclude them entirely from this calculation.
      if (isRetrievalModel(r.model)) continue;
      const inTok = num(r.input_tokens);
      const outTok = num(r.output_tokens);
      input += inTok;
      output += outTok;
      requests += num(r.requests);
      truncations += num(r.truncations);
      evalSpans += num(r.eval_spans);
      durS += num(r.dur_s);
      // Ratios are scale-invariant, so sampling extrapolation isn't needed —
      // price the sampled tokens directly with the per-model rate.
      cost += estimateCost(inTok, outTok, getPricing(r.model));
    }

    const totalTok = input + output;
    const leverage = totalTok > 0 ? output / totalTok : 0;
    const completionRate = requests > 0 ? 1 - truncations / requests : 1;
    const tokensPerSec = durS > 0 ? output / durS : 0;
    const throughputFactor = Math.min(1, tokensPerSec / TARGET_TPS);
    const hasData = requests > 0 && totalTok > 0;
    const score = hasData
      ? Math.round(
          100 *
            (W_LEVERAGE * leverage +
              W_COMPLETION * completionRate +
              W_THROUGHPUT * throughputFactor),
        )
      : null;

    return {
      score,
      leverage,
      completionRate,
      tokensPerSec,
      outputPerDollar: cost > 0 ? output / cost : null,
      inputTokensPerRequest: requests > 0 ? input / requests : 0,
      truncationRatePct: requests > 0 ? (truncations / requests) * 100 : 0,
      costPer1kOutput: output > 0 ? cost / (output / 1000) : null,
      hasEval: evalSpans > 0,
      isLoading: resolution.isLoading || isLoading,
      error: error ?? undefined,
    };
  }, [data, isLoading, error, resolution.isLoading]);
};
