import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useGlobalFilters } from "../../scope/GlobalFilterContext";
import {
  canQueryScope,
  useResolvedServices,
} from "../../scope/useResolvedServices";
import { buildLatencyDecompositionQuery } from "./queries";
import { toNum } from "../../data/format";

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

export type LatencyTier = "LLM" | "Retrieval/DB" | "Tool" | "Orchestration";

export interface TierRow {
  tier: LatencyTier;
  spans: number;
  totalMs: number;
  avgMs: number;
  p95Ms: number;
  /** Share of total execution time across all tiers (0–100). */
  sharePct: number;
}

export interface UseLatencyDecompositionResult {
  tiers: TierRow[];
  totalMs: number;
  /** The tier with the largest share of total time, if any. */
  dominant: TierRow | null;
  isLoading: boolean;
  error?: Error;
}

const TIER_ORDER: LatencyTier[] = [
  "LLM",
  "Retrieval/DB",
  "Tool",
  "Orchestration",
];

export const useLatencyDecomposition = (): UseLatencyDecompositionResult => {
  const { scope } = useScope();
  const resolution = useResolvedServices();
  const { filters } = useGlobalFilters();
  const canQuery = canQueryScope(resolution);

  const { data, isLoading, error } = useScopedDql<{
    tier?: string;
    spans?: number;
    total_ms?: number;
    avg_ms?: number;
    p95_ms?: number;
  }>(
    canQuery
      ? buildLatencyDecompositionQuery(
          resolution.serviceIds,
          scope.timeframe,
          filters,
        )
      : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  return useMemo<UseLatencyDecompositionResult>(() => {
    const raw = (data?.records ?? [])
      .filter((r) => typeof r.tier === "string")
      .map((r) => ({
        tier: r.tier as LatencyTier,
        spans: num(r.spans),
        totalMs: num(r.total_ms),
        avgMs: num(r.avg_ms),
        p95Ms: num(r.p95_ms),
      }));
    const totalMs = raw.reduce((acc, r) => acc + r.totalMs, 0);
    const tiers: TierRow[] = raw
      .map((r) => ({
        ...r,
        sharePct: totalMs > 0 ? (r.totalMs / totalMs) * 100 : 0,
      }))
      .sort(
        (a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier),
      );
    const dominant =
      tiers.length > 0
        ? tiers.reduce((m, r) => (r.totalMs > m.totalMs ? r : m), tiers[0])
        : null;

    return {
      tiers,
      totalMs,
      dominant,
      isLoading: resolution.isLoading || isLoading,
      error: error ?? undefined,
    };
  }, [data, isLoading, error, resolution.isLoading]);
};
