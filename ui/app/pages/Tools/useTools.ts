import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useGlobalFilters } from "../../scope/GlobalFilterContext";
import {
  canQueryScope,
  useResolvedServices,
} from "../../scope/useResolvedServices";
import { buildToolsQuery } from "./queries";
import {
  CATEGORY_COLOR,
  inferToolCategory,
  type ToolCategory,
} from "./categories";
import { toNum } from "../../data/format";

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

interface ToolRecord {
  tool?: string;
  service?: string;
  mcp_server?: string | null;
  calls?: number;
  avg_ms?: number;
  p90_ms?: number;
  p99_ms?: number;
  errors?: number;
  retry_total?: number;
  error_rate_pct?: number;
  retry_rate_pct?: number;
  calling_agents?: string[];
}

export type ToolZone = "bottleneck" | "hot-spot" | "quiet" | "healthy";

export const ZONE_LABEL: Record<ToolZone, string> = {
  bottleneck: "Bottleneck",
  "hot-spot": "Hot spot",
  quiet: "Quiet",
  healthy: "Healthy",
};

export const ZONE_DESCRIPTION: Record<ToolZone, string> = {
  bottleneck: "Slow & infrequent — investigate the few long-running calls",
  "hot-spot": "Slow & high-volume — the biggest latency wins are here",
  quiet: "Fast & low-volume — likely fine",
  healthy: "Fast & high-volume — keep them healthy",
};

export const ZONE_COLOR: Record<ToolZone, string> = {
  bottleneck: "var(--amber)",
  "hot-spot": "var(--red)",
  quiet: "var(--text-3)",
  healthy: "var(--green-2)",
};

export const ZONE_CALL_THRESHOLD = 2000;
export const ZONE_LATENCY_THRESHOLD_MS = 5000;

export interface Tool {
  tool: string;
  service: string;
  mcpServer: string | null;
  category: ToolCategory;
  color: string;
  calls: number;
  avgMs: number;
  p90Ms: number;
  p99Ms: number;
  errors: number;
  errorRatePct: number;
  retryTotal: number;
  retryRatePct: number;
  callingAgents: string[];
  zone: ToolZone;
}

export const zoneFor = (calls: number, avgMs: number): ToolZone => {
  const high = calls > ZONE_CALL_THRESHOLD;
  const slow = avgMs > ZONE_LATENCY_THRESHOLD_MS;
  if (high && slow) return "hot-spot";
  if (!high && slow) return "bottleneck";
  if (!high && !slow) return "quiet";
  return "healthy";
};

export interface UseToolsResult {
  tools: Tool[];
  isLoading: boolean;
  error?: Error;
}

export const useTools = (): UseToolsResult => {
  const { scope } = useScope();
  const { filters } = useGlobalFilters();
  const resolution = useResolvedServices();
  const canQuery = canQueryScope(resolution);

  const { data, isLoading, error } = useScopedDql<ToolRecord>(
    canQuery ? buildToolsQuery(resolution.serviceIds, scope.timeframe, filters) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  return useMemo<UseToolsResult>(() => {
    const tools: Tool[] = [];
    for (const r of data?.records ?? []) {
      if (!r.tool) continue;
      const calls = num(r.calls);
      const avgMs = num(r.avg_ms);
      const category = inferToolCategory(r.tool, r.mcp_server ?? null);
      tools.push({
        tool: r.tool,
        service: r.service ?? "",
        mcpServer: r.mcp_server ?? null,
        category,
        color: CATEGORY_COLOR[category],
        calls,
        avgMs,
        p90Ms: num(r.p90_ms),
        p99Ms: num(r.p99_ms),
        errors: num(r.errors),
        errorRatePct: num(r.error_rate_pct),
        retryTotal: num(r.retry_total),
        retryRatePct: num(r.retry_rate_pct),
        callingAgents: Array.isArray(r.calling_agents) ? r.calling_agents : [],
        zone: zoneFor(calls, avgMs),
      });
    }
    return {
      tools,
      isLoading: resolution.isLoading || isLoading,
      error: error ?? undefined,
    };
  }, [data, isLoading, error, resolution.isLoading, filters]);
};
