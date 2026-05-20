import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import {
  canQueryScope,
  useResolvedServices,
} from "../../scope/useResolvedServices";
import { buildModelsQuery } from "./queries";
import { estimateCost, getPricing } from "../../data/pricing";
import {
  normalizeProvider,
  type ProviderId,
} from "../../detection/attributes";
import { toNum } from "../../data/format";

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

export type ModelType = "generative" | "embedding" | "reranking";

export const MODEL_TYPE_LABEL: Record<ModelType, string> = {
  generative: "Generative",
  embedding: "Embedding",
  reranking: "Reranking",
};

/**
 * Per Session 11 handoff: infer type from gen_ai.operation.name first, then
 * model-name substring. gen_ai.operation.name is not consistently set in BOS
 * data so the name-based fallback is load-bearing.
 */
export const inferModelType = (
  modelName: string,
  operationName?: string | null,
): ModelType => {
  const op = (operationName ?? "").trim().toLowerCase();
  if (op === "embeddings" || op === "embedding") return "embedding";
  if (op === "rerank" || op === "reranking") return "reranking";
  const m = modelName.toLowerCase();
  if (m.includes("embed")) return "embedding";
  if (m.includes("rerank")) return "reranking";
  return "generative";
};

export interface ModelRow {
  model: string;
  modelKey: string;
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
  /** avg input tokens / context window size. Null when the model isn't in pricing.ts. */
  contextUtilizationPct: number | null;
  /** avg output tokens / (avg latency in seconds). Null for embedding (no output tokens). */
  tokensPerSec: number | null;
  /** True when pricing.ts didn't have this model. */
  pricingUnknown: boolean;
}

const PROVIDER_COLOR_LIGHT: Record<ProviderId, string> = {
  anthropic: "var(--purple-2)",
  openai: "var(--green-2)",
  google: "var(--green-2)",
  "aws-bedrock": "var(--cyan)",
  azure: "var(--blue)",
  cohere: "var(--blue-purple)",
  mistral: "var(--amber)",
  unknown: "var(--text-4)",
};

export interface UseModelsResult {
  models: ModelRow[];
  isLoading: boolean;
  error?: Error;
}

export const useModels = (): UseModelsResult => {
  const { scope } = useScope();
  const resolution = useResolvedServices();
  const canQuery = canQueryScope(resolution);

  const { data, isLoading, error } = useScopedDql<ModelRecord>(
    canQuery ? buildModelsQuery(resolution.serviceIds, scope.timeframe) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  return useMemo<UseModelsResult>(() => {
    const models: ModelRow[] = [];
    for (const r of data?.records ?? []) {
      if (!r.model) continue;
      const pricing = getPricing(r.model);
      const provider = normalizeProvider(r.system, r.model);
      const inputTokens = num(r.input_tokens);
      const outputTokens = num(r.output_tokens);
      const requests = num(r.requests);
      const avgInputTokens = num(r.avg_input_tokens);
      const avgOutputTokens = num(r.avg_output_tokens);
      const avgMs = num(r.avg_ms);
      const cost = estimateCost(inputTokens, outputTokens, pricing);
      const totalTokens = inputTokens + outputTokens;
      const costPerMTok =
        totalTokens > 0 ? (cost / totalTokens) * 1_000_000 : 0;
      const type = inferModelType(r.model, r.operation);
      const typeInferredFromName =
        !r.operation ||
        ![
          "embeddings",
          "embedding",
          "rerank",
          "reranking",
          "chat",
          "completion",
        ].includes((r.operation ?? "").trim().toLowerCase());
      const contextWindow = pricing.contextWindow;
      const contextUtilizationPct =
        contextWindow && contextWindow > 0
          ? (avgInputTokens / contextWindow) * 100
          : null;
      const tokensPerSec =
        type === "embedding" || avgMs <= 0 || avgOutputTokens <= 0
          ? null
          : avgOutputTokens / (avgMs / 1000);
      const hasTimeoutAttribute = num(r.has_status_code) > 0;

      models.push({
        model: r.model,
        modelKey: r.model.toLowerCase(),
        provider,
        providerColor: PROVIDER_COLOR_LIGHT[provider.id],
        type,
        typeInferredFromName,
        requests,
        inputTokens,
        outputTokens,
        avgInputTokens,
        avgOutputTokens,
        avgMs,
        p95Ms: num(r.p95_ms),
        p99Ms: num(r.p99_ms),
        errors: num(r.errors),
        errorRatePct: num(r.error_rate_pct),
        timeouts: num(r.timeouts),
        timeoutRatePct: num(r.timeout_rate_pct),
        hasTimeoutAttribute,
        cost,
        costPerMTok,
        contextUtilizationPct,
        tokensPerSec,
        pricingUnknown:
          pricing.inputPerMTok === 0 && pricing.outputPerMTok === 0,
      });
    }

    return {
      models,
      isLoading: resolution.isLoading || isLoading,
      error: error ?? undefined,
    };
  }, [data, isLoading, error, resolution.isLoading]);
};
