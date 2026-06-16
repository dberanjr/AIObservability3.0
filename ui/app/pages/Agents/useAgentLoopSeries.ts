import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import {
  canQueryScope,
  useResolvedServices,
} from "../../scope/useResolvedServices";
import { buildAgentLoopsSeriesQuery } from "./queries";

interface SeriesRecord {
  node_execs?: (number | null)[] | null;
}

export interface UseAgentLoopSeriesResult {
  /** LangGraph node-execution count per bucket. */
  values: number[];
  total: number;
  isLoading: boolean;
  isEmpty: boolean;
}

const TARGET_BUCKETS = 120;

const parseScopeMs = (from: string): number => {
  const m = /now\(\)\s*-\s*(\d+)([mhd])/i.exec(from);
  if (!m) return 24 * 60 * 60 * 1000;
  const n = Number(m[1]);
  switch (m[2].toLowerCase()) {
    case "m":
      return n * 60 * 1000;
    case "h":
      return n * 60 * 60 * 1000;
    case "d":
      return n * 24 * 60 * 60 * 1000;
    default:
      return 24 * 60 * 60 * 1000;
  }
};

/**
 * Time series of LangGraph node executions over the scope timeframe — the raw
 * activity loop detection reads. Lazily queried (pass `enabled`) so it only
 * runs when the Looping Agents popup is open.
 */
export const useAgentLoopSeries = (
  enabled: boolean,
): UseAgentLoopSeriesResult => {
  const { scope } = useScope();
  const resolution = useResolvedServices();
  const canQuery = canQueryScope(resolution);
  const active = enabled && canQuery;

  const intervalSec = useMemo(() => {
    const totalMs = parseScopeMs(scope.timeframe.from);
    return Math.max(60, Math.floor(totalMs / TARGET_BUCKETS / 1000));
  }, [scope.timeframe.from]);

  const series = useScopedDql<SeriesRecord>(
    active
      ? buildAgentLoopsSeriesQuery(
          resolution.serviceIds,
          scope.timeframe,
          intervalSec,
        )
      : "",
    { enabled: active, staleTime: 60_000 },
  );

  return useMemo<UseAgentLoopSeriesResult>(() => {
    const values = (series.data?.records?.[0]?.node_execs ?? []).map((v) =>
      typeof v === "number" ? v : 0,
    );
    return {
      values,
      total: values.reduce((acc, v) => acc + v, 0),
      isLoading: series.isLoading,
      isEmpty: !series.isLoading && values.length === 0,
    };
  }, [series.data, series.isLoading]);
};
