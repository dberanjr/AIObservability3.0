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

export interface HighFrequencyAgent {
  agent: string;
  /** Busiest single-tool call count for this agent, scaled by the sampling
   *  ratio (already above the high-frequency threshold). */
  maxToolCalls: number;
}

export interface HighFrequencyAgentsResult {
  /** Flagged agents, busiest-tool-first. */
  rows: HighFrequencyAgent[];
  isLoading: boolean;
}

/** Canned rows — used only when `showExample` is set (Pulse's architecture
 *  map in Demo Mode / no telemetry). Shaped like the raw query result and
 *  folded through the SAME threshold check (`isHighFrequency`) the real path
 *  uses, rather than a hand-typed Set. */
const DEMO_HIGH_FREQ_RECORDS: Rec[] = [
  { agent: "refund-adjudicator", maxToolCalls: 34 },
  { agent: "trip-planner-agent", maxToolCalls: 22 },
];

/**
 * Per-agent detail behind the "high tool frequency" (N+1) signal: every agent
 * whose busiest single tool exceeds the threshold, with that call count,
 * ranked. One fleet query — react-query caches it, so the KPI tile, its modal
 * and the Set-returning hook below all share a single fetch.
 *
 * `showExample` defaults to false so this hook's OTHER callers (AgentsPage,
 * AgentsTable, tilePopups) are unaffected — only Pulse's architecture map
 * passes it.
 */
export const useHighFrequencyAgentRows = (
  showExample = false,
): HighFrequencyAgentsResult => {
  const { scope } = useScope();
  const { samplingRatio } = useSampling();
  const resolution = useResolvedServices();
  const canQuery = canQueryScope(resolution);

  const { data, isLoading } = useScopedDql<Rec>(
    canQuery
      ? buildHighFrequencyToolsQuery(resolution.serviceIds, scope.timeframe)
      : "",
    { enabled: canQuery && !showExample, staleTime: 60_000 },
  );

  return useMemo(() => {
    const records = showExample ? DEMO_HIGH_FREQ_RECORDS : (data?.records ?? []);
    const ratio = showExample ? 1 : samplingRatio;
    const rows: HighFrequencyAgent[] = [];
    for (const r of records) {
      const calls = toNum(r.maxToolCalls) * ratio;
      if (r.agent && isHighFrequency(calls)) {
        rows.push({ agent: r.agent, maxToolCalls: calls });
      }
    }
    rows.sort((a, b) => b.maxToolCalls - a.maxToolCalls);
    return { rows, isLoading: showExample ? false : canQuery ? isLoading : false };
  }, [data, isLoading, canQuery, samplingRatio, showExample]);
};

/**
 * Set of agent names above the high-frequency threshold — the shape the table
 * badge and the Pulse focus presets consume. Derived from the rows hook so both
 * stay in lock-step.
 */
export const useHighFrequencyAgents = (showExample = false): Set<string> => {
  const { rows } = useHighFrequencyAgentRows(showExample);
  return useMemo(() => new Set(rows.map((r) => r.agent)), [rows]);
};
