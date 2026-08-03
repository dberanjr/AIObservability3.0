import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useResolvedServices, canQueryScope } from "../../scope/useResolvedServices";
import { useSampling } from "../../scope/SamplingContext";
import {
  buildMcpServersBreakdownQuery,
  buildMcpToolsBreakdownQuery,
  buildModelsBreakdownQuery,
} from "./dataQueries";
import {
  foldTileBreakdowns,
  type BreakdownSlice,
  type ModelRec,
  type ServerRec,
  type ToolRec,
} from "./parseHealthAndTiles";
import {
  DEMO_TILE_MODEL_RECORDS,
  DEMO_TILE_SERVER_RECORDS,
  DEMO_TILE_TOOL_RECORDS,
} from "./demoData";

export type { BreakdownSlice };

export interface UseTileBreakdownsResult {
  models: BreakdownSlice[];
  mcpServers: BreakdownSlice[];
  mcpTools: BreakdownSlice[];
  isLoading: boolean;
  error?: Error;
}

/** Precomputed once from the raw fixtures in `./demoData` (kept as raw
 *  records there, not this folded shape, to avoid a circular import back
 *  into this file). */
const DEMO_TILE_BREAKDOWNS = foldTileBreakdowns(
  DEMO_TILE_MODEL_RECORDS,
  DEMO_TILE_SERVER_RECORDS,
  DEMO_TILE_TOOL_RECORDS,
  1,
);

/**
 * `showExample` (default false, mirrors useGuardrails.ts) renders the Demo
 * Mode dataset instead of querying Grail — set by Pulse's SummaryTilesRow
 * when Demo Mode (or the app-wide "no AI telemetry yet" fallback) is active.
 * This hook has no other caller, so the default only matters for tests.
 */
export const useTileBreakdowns = (showExample = false): UseTileBreakdownsResult => {
  const { scope } = useScope();
  const { samplingRatio } = useSampling();
  const resolution = useResolvedServices();
  const { serviceIds } = resolution;
  const canQuery = canQueryScope(resolution);

  const modelsRes = useScopedDql<ModelRec>(
    canQuery ? buildModelsBreakdownQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery && !showExample, staleTime: 60_000 },
  );
  const serversRes = useScopedDql<ServerRec>(
    canQuery ? buildMcpServersBreakdownQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery && !showExample, staleTime: 60_000 },
  );
  const toolsRes = useScopedDql<ToolRec>(
    canQuery ? buildMcpToolsBreakdownQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery && !showExample, staleTime: 60_000 },
  );

  return useMemo<UseTileBreakdownsResult>(() => {
    if (showExample) {
      return { ...DEMO_TILE_BREAKDOWNS, isLoading: false, error: undefined };
    }
    const core = foldTileBreakdowns(
      modelsRes.data?.records ?? [],
      serversRes.data?.records ?? [],
      toolsRes.data?.records ?? [],
      samplingRatio,
    );
    return {
      ...core,
      isLoading:
        modelsRes.isLoading || serversRes.isLoading || toolsRes.isLoading,
      error:
        modelsRes.error ?? serversRes.error ?? toolsRes.error ?? undefined,
    };
  }, [
    showExample,
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
