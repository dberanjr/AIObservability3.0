import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useResolvedServices, canQueryScope } from "../../scope/useResolvedServices";
import { useSampling } from "../../scope/SamplingContext";
import { canonicalizeModel } from "../../detection/attributes";
import { estimateCost, getPricing } from "../../data/pricing";
import { toNum } from "../../data/format";
import {
  buildMcpServersBreakdownQuery,
  buildMcpToolsBreakdownQuery,
  buildModelsBreakdownQuery,
} from "./dataQueries";

export interface BreakdownSlice {
  key: string;
  label: string;
  /** Primary metric used for donut sizing. */
  value: number;
  /** Total tokens (input + output). Always 0 for MCP slices. */
  tokens: number;
  /** Blended USD cost estimate. Always 0 for MCP slices. */
  cost: number;
  /** Average span duration ms. 0 for model slices. */
  avgDurationMs: number;
  /** Median (p50) span duration ms. */
  p50DurationMs: number;
  /** P95 span duration ms. */
  p95DurationMs: number;
  /** P99 span duration ms. */
  p99DurationMs: number;
  /** OTel span-level errors (span.status_code="error"). */
  spanErrors: number;
  /** Functional tool errors (isError present in response output). */
  toolErrors: number;
  /** Click-to-filter target for this slice's label. */
  filter?: { attribute: string; values: string[]; label?: string };
}

export interface UseTileBreakdownsResult {
  models: BreakdownSlice[];
  mcpServers: BreakdownSlice[];
  mcpTools: BreakdownSlice[];
  isLoading: boolean;
  error?: Error;
}

interface ModelRec {
  model?: string;
  requests?: number;
  input_tokens?: number;
  output_tokens?: number;
}
interface ServerRec {
  server?: string;
  requests?: number;
  avg_ms?: number;
  p50_ms?: number;
  p95_ms?: number;
  p99_ms?: number;
  span_errors?: number;
  tool_errors?: number;
}
interface ToolRec {
  tool?: string;
  calls?: number;
  avg_ms?: number;
  p50_ms?: number;
  p95_ms?: number;
  p99_ms?: number;
  span_errors?: number;
  tool_errors?: number;
}

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

const BLENDED_PRICING = getPricing("claude-sonnet-4-6");

export const useTileBreakdowns = (): UseTileBreakdownsResult => {
  const { scope } = useScope();
  const { samplingRatio } = useSampling();
  const resolution = useResolvedServices();
  const { serviceIds } = resolution;
  const canQuery = canQueryScope(resolution);

  const modelsRes = useScopedDql<ModelRec>(
    canQuery ? buildModelsBreakdownQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );
  const serversRes = useScopedDql<ServerRec>(
    canQuery ? buildMcpServersBreakdownQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );
  const toolsRes = useScopedDql<ToolRec>(
    canQuery ? buildMcpToolsBreakdownQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  return useMemo<UseTileBreakdownsResult>(() => {
    interface ModelAgg {
      label: string;
      rawModels: Set<string>;
      requests: number;
      inputTokens: number;
      outputTokens: number;
      pricingKey: string;
      domRequests: number;
    }
    const modelAcc = new Map<string, ModelAgg>();
    for (const r of modelsRes.data?.records ?? []) {
      if (typeof r.model !== "string" || !r.model) continue;
      const { key, label } = canonicalizeModel(r.model);
      const reqs = num(r.requests);
      const cur =
        modelAcc.get(key) ?? {
          label,
          rawModels: new Set<string>(),
          requests: 0,
          inputTokens: 0,
          outputTokens: 0,
          pricingKey: r.model,
          domRequests: -1,
        };
      cur.rawModels.add(r.model);
      cur.requests += reqs * samplingRatio;
      cur.inputTokens += num(r.input_tokens) * samplingRatio;
      cur.outputTokens += num(r.output_tokens) * samplingRatio;
      if (reqs > cur.domRequests) {
        cur.domRequests = reqs;
        cur.pricingKey = r.model;
      }
      modelAcc.set(key, cur);
    }
    const models: BreakdownSlice[] = Array.from(modelAcc.entries())
      .map(([key, agg]) => {
        const pricing = getPricing(agg.pricingKey);
        return {
          key,
          label: agg.label,
          value: agg.requests,
          tokens: agg.inputTokens + agg.outputTokens,
          cost: estimateCost(agg.inputTokens, agg.outputTokens, pricing),
          avgDurationMs: 0,
          p50DurationMs: 0,
          p95DurationMs: 0,
          p99DurationMs: 0,
          spanErrors: 0,
          toolErrors: 0,
          filter: {
            attribute: "gen_ai.request.model",
            values: Array.from(agg.rawModels),
            label: "model",
          },
        };
      })
      .sort((a, b) => b.value - a.value);

    const mcpServers: BreakdownSlice[] = (serversRes.data?.records ?? [])
      .filter(
        (r): r is Required<Pick<ServerRec, "server">> & ServerRec =>
          typeof r.server === "string" && r.server.length > 0,
      )
      .map((r) => ({
        key: r.server,
        label: r.server,
        value: num(r.requests) * samplingRatio,
        tokens: 0,
        cost: 0,
        avgDurationMs: num(r.avg_ms),
        p50DurationMs: num(r.p50_ms),
        p95DurationMs: num(r.p95_ms),
        p99DurationMs: num(r.p99_ms),
        spanErrors: num(r.span_errors) * samplingRatio,
        toolErrors: num(r.tool_errors) * samplingRatio,
        filter: {
          attribute: "traceloop.workflow.name",
          values: [r.server],
          label: "MCP server",
        },
      }));

    const mcpTools: BreakdownSlice[] = (toolsRes.data?.records ?? [])
      .filter(
        (r): r is Required<Pick<ToolRec, "tool">> & ToolRec =>
          typeof r.tool === "string" && r.tool.length > 0,
      )
      .map((r) => ({
        key: r.tool,
        label: r.tool,
        value: num(r.calls) * samplingRatio,
        tokens: 0,
        cost: 0,
        avgDurationMs: num(r.avg_ms),
        p50DurationMs: num(r.p50_ms),
        p95DurationMs: num(r.p95_ms),
        p99DurationMs: num(r.p99_ms),
        spanErrors: num(r.span_errors) * samplingRatio,
        toolErrors: num(r.tool_errors) * samplingRatio,
        filter: {
          attribute: "traceloop.entity.name",
          values: [r.tool],
          label: "MCP tool",
        },
      }));

    return {
      models,
      mcpServers,
      mcpTools,
      isLoading:
        modelsRes.isLoading || serversRes.isLoading || toolsRes.isLoading,
      error:
        modelsRes.error ?? serversRes.error ?? toolsRes.error ?? undefined,
    };
  }, [
    modelsRes.data,
    modelsRes.isLoading,
    modelsRes.error,
    serversRes.data,
    serversRes.isLoading,
    serversRes.error,
    toolsRes.data,
    toolsRes.isLoading,
    toolsRes.error,
    samplingRatio,
  ]);
};
