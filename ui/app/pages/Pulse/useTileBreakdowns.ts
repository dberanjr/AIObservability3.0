import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useResolvedServices, canQueryScope } from "../../scope/useResolvedServices";
import { useSampling } from "../../scope/SamplingContext";
import { stripModelVersion } from "../../detection/attributes";
import { toNum } from "../../data/format";
import {
  buildMcpServersBreakdownQuery,
  buildMcpToolsBreakdownQuery,
  buildModelsBreakdownQuery,
} from "./dataQueries";

export interface BreakdownSlice {
  key: string;
  label: string;
  value: number;
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
}
interface ServerRec {
  server?: string;
  requests?: number;
}
interface ToolRec {
  tool?: string;
  calls?: number;
}

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Donut data for the Models / MCP Servers / MCP Tools summary tiles.
 * Each breakdown is a sorted list of {label, value} slices, already
 * extrapolated by the active samplingRatio so the donut proportions
 * match the unsampled population.
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
  const toolsRes = useScopedDql<ToolRec>(
    canQuery ? buildMcpToolsBreakdownQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  return useMemo<UseTileBreakdownsResult>(() => {
    // Group model variants (date suffixes etc.) under their canonical name
    // so the donut doesn't fragment one model across N suffixed slices.
    const modelAcc = new Map<string, number>();
    for (const r of modelsRes.data?.records ?? []) {
      if (typeof r.model !== "string" || !r.model) continue;
      const canonical = stripModelVersion(r.model) || r.model;
      modelAcc.set(
        canonical,
        (modelAcc.get(canonical) ?? 0) + num(r.requests) * samplingRatio,
      );
    }
    const models: BreakdownSlice[] = Array.from(modelAcc.entries())
      .map(([label, value]) => ({ key: label, label, value }))
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
