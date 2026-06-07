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
  buildMcpServersTokensQuery,
  buildMcpToolsBreakdownQuery,
  buildMcpToolsTokensQuery,
  buildModelsBreakdownQuery,
} from "./dataQueries";

export interface BreakdownSlice {
  key: string;
  label: string;
  /** Primary metric used for donut sizing (requests for models/servers,
   * call count for tools). */
  value: number;
  /** Total input + output tokens summed across the slice's spans. */
  tokens: number;
  /** Blended USD estimate derived from the tokens via pricing.ts. For
   * model slices we use the model-specific pricing when known. */
  cost: number;
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
  input_tokens?: number;
  output_tokens?: number;
}
interface ServerTokenRec {
  server?: string;
  input_tokens?: number;
  output_tokens?: number;
}
interface ToolRec {
  tool?: string;
  calls?: number;
  input_tokens?: number;
  output_tokens?: number;
}
interface ToolTokenRec {
  tool?: string;
  input_tokens?: number;
  output_tokens?: number;
}

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Blended pricing used for non-model rows (MCP servers/tools, mixed
 * traffic). Matches the headline Spend tile so per-row cost on the
 * donut tables stays consistent with the rest of the page.
 */
const BLENDED_PRICING = getPricing("claude-sonnet-4-6");

/**
 * Donut data for the Models / MCP Servers / MCP Tools summary tiles.
 * Each breakdown is a sorted list of {label, value, tokens, cost} slices,
 * already extrapolated by the active samplingRatio so the donut
 * proportions and the per-row tokens/cost match the unsampled population.
 */
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
  // Token data for MCP servers comes from a separate trace-level join query
  // because MCP workflow spans don't carry gen_ai.usage.* attributes.
  const serverTokensRes = useScopedDql<ServerTokenRec>(
    canQuery ? buildMcpServersTokensQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );
  const toolsRes = useScopedDql<ToolRec>(
    canQuery ? buildMcpToolsBreakdownQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );
  const toolTokensRes = useScopedDql<ToolTokenRec>(
    canQuery ? buildMcpToolsTokensQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  return useMemo<UseTileBreakdownsResult>(() => {
    // Group model variants (date suffixes etc.) under their canonical name
    // so the donut doesn't fragment one model across N suffixed slices.
    // Accumulate the per-variant tokens into the canonical bucket too so
    // the table row totals are accurate.
    interface ModelAgg {
      label: string;
      rawModels: Set<string>;
      requests: number;
      inputTokens: number;
      outputTokens: number;
      // Track the dominant raw model id (by requests) so per-model pricing
      // lookup uses a real id, not a blended fallback.
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
          filter: {
            attribute: "gen_ai.request.model",
            values: Array.from(agg.rawModels),
            label: "model",
          },
        };
      })
      .sort((a, b) => b.value - a.value);

    // Build token lookup maps from the trace-level join queries. These
    // supplement the workflow-span request counts with LLM token attribution.
    const serverTokenMap = new Map<string, { inTok: number; outTok: number }>();
    for (const r of serverTokensRes.data?.records ?? []) {
      if (typeof r.server === "string" && r.server.length > 0) {
        serverTokenMap.set(r.server, {
          inTok: num(r.input_tokens) * samplingRatio,
          outTok: num(r.output_tokens) * samplingRatio,
        });
      }
    }
    const toolTokenMap = new Map<string, { inTok: number; outTok: number }>();
    for (const r of toolTokensRes.data?.records ?? []) {
      if (typeof r.tool === "string" && r.tool.length > 0) {
        toolTokenMap.set(r.tool, {
          inTok: num(r.input_tokens) * samplingRatio,
          outTok: num(r.output_tokens) * samplingRatio,
        });
      }
    }

    const mcpServers: BreakdownSlice[] = (serversRes.data?.records ?? [])
      .filter(
        (r): r is Required<Pick<ServerRec, "server">> & ServerRec =>
          typeof r.server === "string" && r.server.length > 0,
      )
      .map((r) => {
        const tok = serverTokenMap.get(r.server);
        const inTok = tok?.inTok ?? num(r.input_tokens) * samplingRatio;
        const outTok = tok?.outTok ?? num(r.output_tokens) * samplingRatio;
        return {
          key: r.server,
          label: r.server,
          value: num(r.requests) * samplingRatio,
          tokens: inTok + outTok,
          cost: estimateCost(inTok, outTok, BLENDED_PRICING),
          filter: {
            attribute: "traceloop.workflow.name",
            values: [r.server],
            label: "MCP server",
          },
        };
      });

    const mcpTools: BreakdownSlice[] = (toolsRes.data?.records ?? [])
      .filter(
        (r): r is Required<Pick<ToolRec, "tool">> & ToolRec =>
          typeof r.tool === "string" && r.tool.length > 0,
      )
      .map((r) => {
        const tok = toolTokenMap.get(r.tool);
        const inTok = tok?.inTok ?? num(r.input_tokens) * samplingRatio;
        const outTok = tok?.outTok ?? num(r.output_tokens) * samplingRatio;
        return {
          key: r.tool,
          label: r.tool,
          value: num(r.calls) * samplingRatio,
          tokens: inTok + outTok,
          cost: estimateCost(inTok, outTok, BLENDED_PRICING),
          filter: {
            attribute: "traceloop.entity.name",
            values: [r.tool],
            label: "MCP tool",
          },
        };
      });

    return {
      models,
      mcpServers,
      mcpTools,
      isLoading:
        modelsRes.isLoading ||
        serversRes.isLoading ||
        serverTokensRes.isLoading ||
        toolsRes.isLoading ||
        toolTokensRes.isLoading,
      error:
        modelsRes.error ??
        serversRes.error ??
        toolsRes.error ??
        undefined,
    };
  }, [
    modelsRes.data,
    modelsRes.isLoading,
    modelsRes.error,
    serversRes.data,
    serversRes.isLoading,
    serversRes.error,
    serverTokensRes.data,
    serverTokensRes.isLoading,
    toolsRes.data,
    toolsRes.isLoading,
    toolsRes.error,
    toolTokensRes.data,
    toolTokensRes.isLoading,
    samplingRatio,
  ]);
};
