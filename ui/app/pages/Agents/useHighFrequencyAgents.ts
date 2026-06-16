/**
 * Set of agent names where a single tool was called more than the
 * high-frequency threshold within the timeframe (the AI N+1 pattern). Drives
 * the "high tool frequency" badge on the agents table. One fleet query, joined
 * to rows client-side by agent name.
 */
import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useSampling } from "../../scope/SamplingContext";
import {
  useResolvedServices,
  canQueryScope,
} from "../../scope/useResolvedServices";
import { buildHighFrequencyToolsQuery } from "./queries";
import { isHighFrequency } from "./constants";
import { toNum } from "../../data/format";

interface Rec {
  agent?: string;
  maxToolCalls?: number;
}

export const useHighFrequencyAgents = (): Set<string> => {
  const { scope } = useScope();
  const { samplingRatio } = useSampling();
  const resolution = useResolvedServices();
  const canQuery = canQueryScope(resolution);

  const { data } = useScopedDql<Rec>(
    canQuery
      ? buildHighFrequencyToolsQuery(resolution.serviceIds, scope.timeframe)
      : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  return useMemo(() => {
    const set = new Set<string>();
    for (const r of data?.records ?? []) {
      const calls = toNum(r.maxToolCalls) * samplingRatio;
      if (r.agent && isHighFrequency(calls)) set.add(r.agent);
    }
    return set;
  }, [data, samplingRatio]);
};
