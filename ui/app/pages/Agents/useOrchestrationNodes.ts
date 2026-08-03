import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useGlobalFilters } from "../../scope/GlobalFilterContext";
import {
  canQueryScope,
  useResolvedServices,
} from "../../scope/useResolvedServices";
import { buildOrchestrationNodesQuery } from "./queries";
import { parseOrchestrationNodes, type NodeRecord, type NodeRow } from "./parse";
import { DEMO_ORCH_NODES } from "./demoData";

export type { NodeRow };

export interface UseOrchestrationNodesResult {
  nodes: NodeRow[];
  isLoading: boolean;
  error?: Error;
}

/**
 * Node-level runtime breakdown for the Agents page. Each row is one runtime
 * span name (node) within an agent, deduped across the agent's named/null
 * service entities.
 *
 * @param showExample Demo Mode / no-telemetry fallback — see BedrockPage's
 * doc comment. Returns the canned `DEMO_ORCH_NODES` instead of querying.
 */
export const useOrchestrationNodes = (
  showExample = false,
): UseOrchestrationNodesResult => {
  const { scope } = useScope();
  const resolution = useResolvedServices();
  const { filters } = useGlobalFilters();
  const canQuery = canQueryScope(resolution);

  const { data, isLoading, error } = useScopedDql<NodeRecord>(
    canQuery && !showExample
      ? buildOrchestrationNodesQuery(
          resolution.serviceIds,
          scope.timeframe,
          filters,
        )
      : "",
    { enabled: canQuery && !showExample, staleTime: 60_000 },
  );

  return useMemo<UseOrchestrationNodesResult>(() => {
    if (showExample) {
      return { nodes: DEMO_ORCH_NODES, isLoading: false, error: undefined };
    }
    return {
      nodes: parseOrchestrationNodes(data?.records ?? []),
      isLoading: resolution.isLoading || isLoading,
      error: error ?? undefined,
    };
  }, [showExample, data, isLoading, error, resolution.isLoading]);
};
