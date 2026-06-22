import { useMemo } from "react";
import { useScope } from "../../scope/ScopeContext";
import {
  useResolvedServices,
  canQueryScope,
} from "../../scope/useResolvedServices";
import { useScopedDql } from "../../scope/useScopedDql";
import { toNum } from "../../data/format";
import { buildAgentToolTracesQuery } from "./queries";
import {
  pickRepresentativeTraces,
  type CandidateTrace,
  type RepTrace,
} from "./representativeTraces";

interface TraceRec {
  trace_id?: string;
  start_ms?: number | string;
  dur_ms?: number | string;
  is_error?: boolean | string;
  calls?: number | string;
}

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

const bool = (v: unknown): boolean => v === true || v === "true";

export interface UseAgentToolTracesResult {
  traces: RepTrace[];
  isLoading: boolean;
}

/**
 * Up to 10 "interesting" representative traces for one agent+tool, for the
 * Agents-tab tool drilldown. Runs buildAgentToolTracesQuery (scoped/filter
 * aware via useScopedDql), coerces the SDK's string longs, then picks a diverse
 * subset (slowest/fastest/errored/median/recency/spread) with pickRepresentative-
 * Traces.
 */
export const useAgentToolTraces = (
  agentName: string,
  toolName: string,
  strict: boolean,
): UseAgentToolTracesResult => {
  const { scope } = useScope();
  const resolution = useResolvedServices();
  const canQuery = canQueryScope(resolution);

  const { data, isLoading } = useScopedDql<TraceRec>(
    canQuery
      ? buildAgentToolTracesQuery(
          resolution.serviceIds,
          scope.timeframe,
          agentName,
          toolName,
          strict,
        )
      : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  return useMemo<UseAgentToolTracesResult>(() => {
    const candidates: CandidateTrace[] = [];
    for (const r of data?.records ?? []) {
      if (!r.trace_id) continue;
      candidates.push({
        traceId: r.trace_id,
        startMs: num(r.start_ms),
        durMs: num(r.dur_ms),
        isError: bool(r.is_error),
        calls: num(r.calls),
      });
    }
    return { traces: pickRepresentativeTraces(candidates, 10), isLoading };
  }, [data, isLoading]);
};
