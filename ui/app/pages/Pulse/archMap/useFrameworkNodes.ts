/**
 * Live per-framework node data for the AI Application Architecture map. The
 * single Orchestrator node is split into one node per orchestration framework
 * plus an "Other" fallback. Mirrors the sibling archMap hook
 * (useArchitectureData): reads the timeframe from `useScope()` and passes
 * `null` serviceIds (fleet-wide; scope is applied via segments + the global
 * trace filter inside useScopedDql). Labeled rows are folded into typed nodes
 * by `rowsToFrameworkNodes`.
 */
import { useMemo } from "react";
import { useScopedDql } from "../../../scope/useScopedDql";
import { useScope } from "../../../scope/ScopeContext";
import {
  buildFrameworkNodesQuery,
  rowsToFrameworkNodes,
  type FrameworkNodeRow,
  type FrameworkNode,
} from "./frameworkNodes";

export const useFrameworkNodes = (): {
  frameworks: FrameworkNode[];
  isLoading: boolean;
} => {
  const { scope } = useScope();
  const { data, isLoading } = useScopedDql<FrameworkNodeRow>(
    buildFrameworkNodesQuery(null, scope.timeframe),
    { staleTime: 60_000 },
  );
  const frameworks = useMemo(
    () => rowsToFrameworkNodes(data?.records ?? []),
    [data],
  );
  return { frameworks, isLoading };
};
