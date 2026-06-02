import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import {
  canQueryScope,
  useResolvedServices,
} from "../../scope/useResolvedServices";
import { buildSlowAgentsQuery, buildSlowModelsQuery } from "./queries";
import { canonicalizeModel } from "../../detection/attributes";
import { toNum } from "../../data/format";

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

export interface Contributor {
  name: string;
  p95Ms: number;
  calls: number;
  errorRatePct: number | null;
}

export interface UseHealthContributorsResult {
  slowAgents: Contributor[];
  slowModels: Contributor[];
  errorAgents: Contributor[];
  isLoading: boolean;
}

export const useHealthContributors = (): UseHealthContributorsResult => {
  const { scope } = useScope();
  const resolution = useResolvedServices();
  const canQuery = canQueryScope(resolution);

  const agents = useScopedDql<{
    name?: string;
    p95_ms?: number;
    calls?: number;
    errors?: number;
    error_rate_pct?: number;
  }>(canQuery ? buildSlowAgentsQuery(resolution.serviceIds, scope.timeframe) : "", {
    enabled: canQuery,
    staleTime: 60_000,
  });

  const models = useScopedDql<{ name?: string; p95_ms?: number; calls?: number }>(
    canQuery ? buildSlowModelsQuery(resolution.serviceIds, scope.timeframe) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  return useMemo<UseHealthContributorsResult>(() => {
    const agentRows: Contributor[] = (agents.data?.records ?? [])
      .filter((r) => typeof r.name === "string")
      .map((r) => ({
        name: r.name as string,
        p95Ms: num(r.p95_ms),
        calls: num(r.calls),
        errorRatePct: num(r.error_rate_pct),
      }));

    const modelRows: Contributor[] = (models.data?.records ?? [])
      .filter((r) => typeof r.name === "string")
      .map((r) => ({
        name: canonicalizeModel(r.name as string).label,
        p95Ms: num(r.p95_ms),
        calls: num(r.calls),
        errorRatePct: null,
      }));

    const errorAgents = [...agentRows]
      .filter((a) => (a.errorRatePct ?? 0) > 0)
      .sort((a, b) => (b.errorRatePct ?? 0) - (a.errorRatePct ?? 0))
      .slice(0, 5);

    return {
      slowAgents: agentRows,
      slowModels: modelRows,
      errorAgents,
      isLoading: resolution.isLoading || agents.isLoading || models.isLoading,
    };
  }, [agents.data, models.data, agents.isLoading, models.isLoading, resolution.isLoading]);
};
