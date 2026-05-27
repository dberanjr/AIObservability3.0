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
import { buildDegradedTrendQuery } from "./queries";
import type { AgentRow } from "./useAgents";

interface TrendRecord {
  agent?: string;
  p90_ns?: (number | null)[] | null;
}

export interface UseDegradedAgentsResult {
  items: DegradedTrendItem[];
  isLoading: boolean;
  error?: Error;
}

const DEGRADED_P90_MS = 2000;
const TOP_N = 5;

const arrAvg = (a: number[]): number =>
  a.length === 0 ? 0 : a.reduce((acc, v) => acc + v, 0) / a.length;

export const useDegradedAgents = (
  agents: AgentRow[],
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
    canQuery && topNames.length > 0
      ? buildDegradedTrendQuery(resolution.serviceIds, topNames, filters)
      : "",
    {
      enabled: canQuery && topNames.length > 0,
      staleTime: 60_000,
    },
  );

  return useMemo<UseDegradedAgentsResult>(() => {
    const trendByAgent = new Map<string, number[]>();
    for (const r of data?.records ?? []) {
      if (!r.agent) continue;
      const trend = (r.p90_ns ?? []).map((v) =>
        typeof v === "number" ? v / 1_000_000 : 0,
      );
      trendByAgent.set(r.agent, trend);
    }

    const items: DegradedTrendItem[] = slow.map((agent) => {
      const trend = trendByAgent.get(agent.agent) ?? [];
      // 7d baseline placeholder: average of the trend's first half until a
      // dedicated 7d query lands (Session 14 polish).
      const baseline =
        trend.length > 4
          ? arrAvg(trend.slice(0, Math.floor(trend.length / 2)))
          : agent.p90Ms;
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
      isLoading,
      error: error ?? undefined,
    };
  }, [slow, data, isLoading, error, hasActive, thresholds.p90Ms, filters]);
};
