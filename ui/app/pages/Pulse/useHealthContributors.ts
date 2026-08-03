import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import {
  canQueryScope,
  useResolvedServices,
} from "../../scope/useResolvedServices";
import { buildSlowAgentsQuery, buildSlowModelsQuery } from "./queries";
import {
  computeHealthContributors,
  type Contributor,
  type SlowAgentRow,
  type SlowModelRow,
} from "./parseHealthAndTiles";
import { DEMO_SLOW_AGENT_RECORDS, DEMO_SLOW_MODEL_RECORDS } from "./demoData";

export type { Contributor };

export interface UseHealthContributorsResult {
  slowAgents: Contributor[];
  slowModels: Contributor[];
  errorAgents: Contributor[];
  isLoading: boolean;
}

/** Precomputed once from the raw fixtures in `./demoData` (kept as raw
 *  records there, not this folded shape, to avoid a circular import back
 *  into this file). */
const DEMO_HEALTH_CONTRIBUTORS = computeHealthContributors(
  DEMO_SLOW_AGENT_RECORDS,
  DEMO_SLOW_MODEL_RECORDS,
);

/**
 * `showExample` (default false, mirrors useGuardrails.ts) renders the Demo
 * Mode dataset instead of querying Grail — set by Pulse's PlatformHealthCard
 * when Demo Mode (or the app-wide "no AI telemetry yet" fallback) is active.
 */
export const useHealthContributors = (
  showExample = false,
): UseHealthContributorsResult => {
  const { scope } = useScope();
  const resolution = useResolvedServices();
  const canQuery = canQueryScope(resolution);

  const agents = useScopedDql<SlowAgentRow>(
    canQuery ? buildSlowAgentsQuery(resolution.serviceIds, scope.timeframe) : "",
    { enabled: canQuery && !showExample, staleTime: 60_000 },
  );

  const models = useScopedDql<SlowModelRow>(
    canQuery ? buildSlowModelsQuery(resolution.serviceIds, scope.timeframe) : "",
    { enabled: canQuery && !showExample, staleTime: 60_000 },
  );

  return useMemo<UseHealthContributorsResult>(() => {
    if (showExample) {
      return { ...DEMO_HEALTH_CONTRIBUTORS, isLoading: false };
    }
    const core = computeHealthContributors(agents.data?.records ?? [], models.data?.records ?? []);
    return {
      ...core,
      isLoading: resolution.isLoading || agents.isLoading || models.isLoading,
    };
  }, [showExample, agents.data, models.data, agents.isLoading, models.isLoading, resolution.isLoading]);
};
