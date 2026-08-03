import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useGlobalFilters } from "../../scope/GlobalFilterContext";
import {
  canQueryScope,
  useResolvedServices,
} from "../../scope/useResolvedServices";
import { buildLatencyDecompositionQuery } from "./queries";
import {
  parseLatencyTiers,
  type LatencyTier,
  type TierRecord,
  type TierRow,
} from "./parse";
import { DEMO_LATENCY_TIERS } from "./demoData";

export type { LatencyTier, TierRow };

export interface UseLatencyDecompositionResult {
  tiers: TierRow[];
  totalMs: number;
  /** The tier with the largest share of total time, if any. */
  dominant: TierRow | null;
  isLoading: boolean;
  error?: Error;
}

/**
 * `showExample` (default false, mirrors useGuardrails.ts) renders the Demo
 * Mode dataset instead of querying Grail — used by the Summary page's
 * LatencyTierCard. Agents' own LatencyTierPanel never passes it, so its
 * behavior is unchanged. The fold itself lives in `./parse` (shared with
 * every other Agents hook) — `demoData.ts`'s `DEMO_LATENCY_TIERS` runs the
 * SAME `parseLatencyTiers` over a small raw-record fixture.
 */
export const useLatencyDecomposition = (
  showExample = false,
): UseLatencyDecompositionResult => {
  const { scope } = useScope();
  const resolution = useResolvedServices();
  const { filters } = useGlobalFilters();
  const canQuery = canQueryScope(resolution);

  const { data, isLoading, error } = useScopedDql<TierRecord>(
    canQuery
      ? buildLatencyDecompositionQuery(
          resolution.serviceIds,
          scope.timeframe,
          filters,
        )
      : "",
    { enabled: canQuery && !showExample, staleTime: 60_000 },
  );

  return useMemo<UseLatencyDecompositionResult>(() => {
    if (showExample) {
      return { ...DEMO_LATENCY_TIERS, isLoading: false, error: undefined };
    }
    const core = parseLatencyTiers(data?.records ?? []);
    return {
      ...core,
      isLoading: resolution.isLoading || isLoading,
      error: error ?? undefined,
    };
  }, [showExample, data, isLoading, error, resolution.isLoading]);
};
