import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useScanLimit } from "../../scope/ScanLimitContext";
import { readScanMeta } from "../../scope/ScanReportContext";
import { useGlobalFilters } from "../../scope/GlobalFilterContext";
import {
  canQueryScope,
  useResolvedServices,
} from "../../scope/useResolvedServices";
import { buildModelsQuery } from "./queries";
import { costOf, getPricing, type ModelPricing } from "../../data/pricing";
import {
  canonicalizeModel,
  normalizeProvider,
  PROVIDER_COLOR,
  type ProviderId,
} from "../../detection/attributes";
import { toNum } from "../../data/format";
import { inferModelType, MODEL_TYPE_LABEL, type ModelType } from "./finopsLogic";

export { inferModelType, MODEL_TYPE_LABEL, type ModelType };

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

interface ModelRecord {
  model?: string;
  requests?: number;
  input_tokens?: number;
  output_tokens?: number;
  avg_input_tokens?: number;
  avg_output_tokens?: number;
  avg_ms?: number;
  p95_ms?: number;
  p99_ms?: number;
  errors?: number;
  timeouts?: number;
  has_status_code?: number;
  operation?: string | null;
  system?: string | null;
  error_rate_pct?: number;
  timeout_rate_pct?: number;
}

export interface ModelRow {
  model: string;
  modelKey: string;
  /** All raw gen_ai.request.model values merged under this canonical row. */
  rawModels: string[];
  provider: { id: ProviderId; label: string; viaBedrock: boolean };
  providerColor: string;
  type: ModelType;
  /** True when the type was inferred from the model name (not gen_ai.operation.name). */
  typeInferredFromName: boolean;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  avgMs: number;
  p95Ms: number;
  p99Ms: number;
  errors: number;
  errorRatePct: number;
  timeouts: number;
  timeoutRatePct: number;
  /** Whether the tenant emits span.status_code at all (so "—" vs "0%"). */
  hasTimeoutAttribute: boolean;
  cost: number;
  costPerMTok: number;
  /** Effective pricing record (rates, context window, provider, tier) for the
   *  dominant model variant — drives the detail modal's pricing card. */
  pricing: ModelPricing;
  /** avg input tokens / context window size. Null when the model isn't in pricing.ts. */
  contextUtilizationPct: number | null;
  /** avg output tokens / (avg latency in seconds). Null for embedding (no output tokens). */
  tokensPerSec: number | null;
  /** True when pricing.ts didn't have this model. */
  pricingUnknown: boolean;
}

export interface UseModelsResult {
  models: ModelRow[];
  isLoading: boolean;
  error?: Error;
  /** True when the model scan reached its scan-limit budget (results partial),
   *  so an empty view can offer a "raise the scan limit" remedy (STATE-4/6). */
  limitHit: boolean;
}

export const useModels = (serviceName?: string | null): UseModelsResult => {
  const { scope } = useScope();
  const resolution = useResolvedServices();
  const { filters } = useGlobalFilters();
  const { scanLimitGb } = useScanLimit();
  const canQuery = canQueryScope(resolution);

  const { data, isLoading, error } = useScopedDql<ModelRecord>(
    canQuery
      ? buildModelsQuery(resolution.serviceIds, scope.timeframe, filters, serviceName)
      : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  return useMemo<UseModelsResult>(() => {
    // The same model is logged under several naming conventions
    // (global.anthropic.claude-sonnet-4-6 / Claude-Sonnet-4.6 / dated bedrock
    // ids). Merge per-raw-model rows under one canonical key so the table
    // shows one row per real model. Sums are exact; latency percentiles take
    // the dominant (highest-request) variant since percentiles can't be
    // re-aggregated from per-variant percentiles; averages are request-weighted.
    interface Agg {
      key: string;
      label: string;
      rawModels: Set<string>;
      requests: number;
      inputTokens: number;
      outputTokens: number;
      errors: number;
      timeouts: number;
      hasStatusCode: number;
      wAvgMs: number;
      wAvgIn: number;
      wAvgOut: number;
      domRequests: number;
      domModel: string;
      domOperation?: string | null;
      domSystem?: string | null;
      domP95: number;
      domP99: number;
    }
    const byKey = new Map<string, Agg>();
    for (const r of data?.records ?? []) {
      if (!r.model) continue;
      const { key, label } = canonicalizeModel(r.model);
      const requests = num(r.requests);
      const avgInputTokens = num(r.avg_input_tokens);
      const avgOutputTokens = num(r.avg_output_tokens);
      const avgMs = num(r.avg_ms);
      let agg = byKey.get(key);
      if (!agg) {
        agg = {
          key,
          label,
          rawModels: new Set<string>(),
          requests: 0,
          inputTokens: 0,
          outputTokens: 0,
          errors: 0,
          timeouts: 0,
          hasStatusCode: 0,
          wAvgMs: 0,
          wAvgIn: 0,
          wAvgOut: 0,
          domRequests: -1,
          domModel: r.model,
          domOperation: r.operation,
          domSystem: r.system,
          domP95: 0,
          domP99: 0,
        };
        byKey.set(key, agg);
      }
      agg.rawModels.add(r.model);
      agg.requests += requests;
      agg.inputTokens += num(r.input_tokens);
      agg.outputTokens += num(r.output_tokens);
      agg.errors += num(r.errors);
      agg.timeouts += num(r.timeouts);
      agg.hasStatusCode += num(r.has_status_code);
      agg.wAvgMs += avgMs * requests;
      agg.wAvgIn += avgInputTokens * requests;
      agg.wAvgOut += avgOutputTokens * requests;
      if (requests > agg.domRequests) {
        agg.domRequests = requests;
        agg.domModel = r.model;
        agg.domOperation = r.operation;
        agg.domSystem = r.system;
        agg.domP95 = num(r.p95_ms);
        agg.domP99 = num(r.p99_ms);
      }
    }

    const models: ModelRow[] = [];
    for (const agg of byKey.values()) {
      const pricing = getPricing(agg.domModel);
      const provider = normalizeProvider(agg.domSystem, agg.domModel);
      const inputTokens = agg.inputTokens;
      const outputTokens = agg.outputTokens;
      const requests = agg.requests;
      const avgInputTokens = requests > 0 ? agg.wAvgIn / requests : 0;
      const avgOutputTokens = requests > 0 ? agg.wAvgOut / requests : 0;
      const avgMs = requests > 0 ? agg.wAvgMs / requests : 0;
      // Cost via the cache-aware model (blended fallback for unknowns); the
      // `pricing` record above is still used for contextWindow + pricingUnknown.
      const cost = costOf(inputTokens, outputTokens, agg.domModel);
      const totalTokens = inputTokens + outputTokens;
      const costPerMTok =
        totalTokens > 0 ? (cost / totalTokens) * 1_000_000 : 0;
      const type = inferModelType(agg.domModel, agg.domOperation);
      const typeInferredFromName =
        !agg.domOperation ||
        ![
          "embeddings",
          "embedding",
          "rerank",
          "reranking",
          "chat",
          "completion",
        ].includes((agg.domOperation ?? "").trim().toLowerCase());
      const contextWindow = pricing.contextWindow;
      const contextUtilizationPct =
        contextWindow && contextWindow > 0
          ? (avgInputTokens / contextWindow) * 100
          : null;
      const tokensPerSec =
        type === "embedding" || avgMs <= 0 || avgOutputTokens <= 0
          ? null
          : avgOutputTokens / (avgMs / 1000);
      const hasTimeoutAttribute = agg.hasStatusCode > 0;
      const errorRatePct =
        requests > 0 ? (agg.errors / requests) * 100 : 0;
      const timeoutRatePct =
        requests > 0 ? (agg.timeouts / requests) * 100 : 0;

      models.push({
        model: agg.label,
        modelKey: agg.key,
        rawModels: Array.from(agg.rawModels),
        provider,
        providerColor: PROVIDER_COLOR[provider.id],
        type,
        typeInferredFromName,
        requests,
        inputTokens,
        outputTokens,
        avgInputTokens,
        avgOutputTokens,
        avgMs,
        p95Ms: agg.domP95,
        p99Ms: agg.domP99,
        errors: agg.errors,
        errorRatePct,
        timeouts: agg.timeouts,
        timeoutRatePct,
        hasTimeoutAttribute,
        cost,
        costPerMTok,
        pricing,
        contextUtilizationPct,
        tokensPerSec,
        pricingUnknown:
          pricing.inputPerMTok === 0 && pricing.outputPerMTok === 0,
      });
    }
    models.sort((a, b) => b.requests - a.requests);

    return {
      models,
      isLoading: resolution.isLoading || isLoading,
      error: error ?? undefined,
      limitHit: readScanMeta({ data }, scanLimitGb)?.limitHit ?? false,
    };
  }, [data, isLoading, error, resolution.isLoading, filters, scanLimitGb]);
};
