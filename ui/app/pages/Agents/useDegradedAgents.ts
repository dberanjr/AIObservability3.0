import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useGlobalFilters } from "../../scope/GlobalFilterContext";
import {
  canQueryScope,
  useResolvedServices,
} from "../../scope/useResolvedServices";
import { useSLA } from "../../components/SLAConfig/SLAContext";
import type { DegradedTrendItem } from "../../components/SLAConfig/types";
import { fmtMs } from "../../data/format";
import { buildDegradedTrendQuery, buildAgentBaselineQuery } from "./queries";
import type { AgentRow } from "./useAgents";
import { buildDegradedTrendMaps, type DegradedTrendRecord as TrendRecord, type DegradedBaselineRecord as BaselineRecord } from "./parse";
import { DEMO_DEGRADED_TREND_RECORDS, DEMO_DEGRADED_BASELINE_RECORDS } from "./demoData";

export interface UseDegradedAgentsResult {
  items: DegradedTrendItem[];
  isLoading: boolean;
  error?: Error;
}

const DEGRADED_P90_MS = 2000;
const TOP_N = 5;

const arrAvg = (a: number[]): number =>
  a.length === 0 ? 0 : a.reduce((acc, v) => acc + v, 0) / a.length;

/**
 * @param showExample Demo Mode / no-telemetry fallback — see BedrockPage's
 * doc comment. `agents` is already Demo Mode-aware (its caller passes the
 * same `showExample`-driven `useAgents` result), so `slow` naturally resolves
 * to the canned fleet's slow agents; this flag additionally swaps the
 * trend/baseline queries for the matching canned fixtures.
 */
export const useDegradedAgents = (
  agents: AgentRow[],
  showExample = false,
): UseDegradedAgentsResult => {
  const { filters } = useGlobalFilters();
  const resolution = useResolvedServices();
  const canQuery = canQueryScope(resolution);
  const { thresholds, hasActive } = useSLA();

  const slow = useMemo(
    () =>
      agents
        .filter((a) => a.p90Ms > DEGRADED_P90_MS && !a.isOrchestration)
        .sort((a, b) => b.p90Ms - a.p90Ms)
        .slice(0, TOP_N),
    [agents],
  );
  const topNames = slow.map((a) => a.agent);

  const { data, isLoading, error } = useScopedDql<TrendRecord>(
    canQuery && !showExample && topNames.length > 0
      ? buildDegradedTrendQuery(resolution.serviceIds, topNames, filters)
      : "",
    {
      enabled: canQuery && !showExample && topNames.length > 0,
      staleTime: 60_000,
    },
  );

  // Real rolling-7d P90 baseline (separate window) — replaces the old
  // first-half-of-trend placeholder so "% vs baseline" is meaningful.
  const baselineResult = useScopedDql<BaselineRecord>(
    canQuery && !showExample && topNames.length > 0
      ? buildAgentBaselineQuery(resolution.serviceIds, topNames)
      : "",
    {
      enabled: canQuery && !showExample && topNames.length > 0,
      staleTime: 5 * 60_000,
    },
  );

  return useMemo<UseDegradedAgentsResult>(() => {
    const { trendByAgent, baselineByAgent } = buildDegradedTrendMaps(
      showExample ? DEMO_DEGRADED_TREND_RECORDS : (data?.records ?? []),
      showExample ? DEMO_DEGRADED_BASELINE_RECORDS : (baselineResult.data?.records ?? []),
    );

    const items: DegradedTrendItem[] = slow.map((agent) => {
      const trend = trendByAgent.get(agent.agent) ?? [];
      // Prefer the real 7d baseline; fall back to the trend's first half only
      // if the baseline query hasn't resolved a value for this agent yet.
      const baseline =
        baselineByAgent.get(agent.agent) ??
        (trend.length > 4
          ? arrAvg(trend.slice(0, Math.floor(trend.length / 2)))
          : agent.p90Ms);
      const pctVsBaseline =
        baseline > 0 ? ((agent.p90Ms - baseline) / baseline) * 100 : 0;
      const isDegraded = pctVsBaseline > 20;
      const isBreached =
        hasActive &&
        thresholds.p90Ms != null &&
        agent.p90Ms > thresholds.p90Ms;
      return {
        id: `${agent.serviceId}-${agent.agent}`,
        name: agent.agent,
        currentValue: agent.p90Ms,
        displayValue: fmtMs(agent.p90Ms),
        metricLabel: "P90",
        trend,
        baseline,
        pctVsBaseline,
        isDegraded,
        isBreached,
      };
    });

    return {
      items,
      isLoading: showExample ? false : isLoading,
      error: showExample ? undefined : (error ?? baselineResult.error ?? undefined),
    };
  }, [
    showExample,
    slow,
    data,
    baselineResult.data,
    baselineResult.error,
    isLoading,
    error,
    hasActive,
    thresholds.p90Ms,
    filters,
  ]);
};
