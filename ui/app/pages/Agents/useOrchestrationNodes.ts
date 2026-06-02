import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useGlobalFilters } from "../../scope/GlobalFilterContext";
import {
  canQueryScope,
  useResolvedServices,
} from "../../scope/useResolvedServices";
import { buildOrchestrationNodesQuery } from "./queries";
import { toNum } from "../../data/format";

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

interface NodeRecord {
  node?: string;
  agent?: string;
  services?: Array<string | null>;
  invocations?: number;
  avg_ms?: number;
  p90_ms?: number;
  p99_ms?: number;
}

export interface NodeRow {
  node: string;
  agent: string;
  service: string;
  invocations: number;
  avgMs: number;
  p90Ms: number;
  p99Ms: number;
}

export interface UseOrchestrationNodesResult {
  nodes: NodeRow[];
  isLoading: boolean;
  error?: Error;
}

/**
 * Node-level runtime breakdown for the Agents page. Each row is one runtime
 * span name (node) within an agent, deduped across the agent's named/null
 * service entities.
 */
export const useOrchestrationNodes = (): UseOrchestrationNodesResult => {
  const { scope } = useScope();
  const resolution = useResolvedServices();
  const { filters } = useGlobalFilters();
  const canQuery = canQueryScope(resolution);

  const { data, isLoading, error } = useScopedDql<NodeRecord>(
    canQuery
      ? buildOrchestrationNodesQuery(
          resolution.serviceIds,
          scope.timeframe,
          filters,
        )
      : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  return useMemo<UseOrchestrationNodesResult>(() => {
    const nodes: NodeRow[] = [];
    for (const r of data?.records ?? []) {
      if (!r.node || !r.agent) continue;
      const service =
        (r.services ?? []).find(
          (s): s is string => typeof s === "string" && s.length > 0,
        ) ?? r.agent;
      nodes.push({
        node: r.node,
        agent: r.agent,
        service,
        invocations: num(r.invocations),
        avgMs: num(r.avg_ms),
        p90Ms: num(r.p90_ms),
        p99Ms: num(r.p99_ms),
      });
    }
    return {
      nodes,
      isLoading: resolution.isLoading || isLoading,
      error: error ?? undefined,
    };
  }, [data, isLoading, error, resolution.isLoading]);
};
