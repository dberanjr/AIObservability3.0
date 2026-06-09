import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { toNum } from "../../data/format";
import { buildAgentLoopsQuery, LOOP_REPEAT_RATIO, LOOP_MAX_STEP } from "./queries";

interface LoopRecord {
  agent?: string;
  runs?: number | string;
  looping_runs?: number | string;
  loop_rate_pct?: number | string;
  max_repeat?: number | string;
  max_steps?: number | string;
  avg_nodes_per_run?: number | string;
}

export interface AgentLoopRow {
  agent: string;
  runs: number;
  loopingRuns: number;
  loopRatePct: number;
  maxRepeat: number;
  maxSteps: number;
  avgNodesPerRun: number;
  /** True when the agent couldn't be resolved (LangGraph spans with no agent
   *  name — the proxy/trace-propagation gap). */
  unattributed: boolean;
}

export interface UseAgentLoopsResult {
  rows: AgentLoopRow[];
  /** Agents with at least one looping run. */
  loopingCount: number;
  isLoading: boolean;
  isEmpty: boolean;
  error?: Error;
}

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

export { LOOP_REPEAT_RATIO, LOOP_MAX_STEP };

export const useAgentLoops = (): UseAgentLoopsResult => {
  const { scope } = useScope();
  const res = useScopedDql<LoopRecord>(buildAgentLoopsQuery(null, scope.timeframe), {
    staleTime: 60_000,
  });

  return useMemo<UseAgentLoopsResult>(() => {
    // `runs` / `looping_runs` are distinct-trace group counts, NOT span counts,
    // so they are NOT multiplied by the span sampling ratio (group count
    // doesn't scale linearly with span sampling). Shown as observed; the
    // loop-rate percentage is sampling-invariant.
    const rows: AgentLoopRow[] = (res.data?.records ?? []).map((r) => ({
      agent: r.agent ?? "unattributed",
      runs: num(r.runs),
      loopingRuns: num(r.looping_runs),
      loopRatePct: num(r.loop_rate_pct),
      maxRepeat: num(r.max_repeat),
      maxSteps: num(r.max_steps),
      avgNodesPerRun: num(r.avg_nodes_per_run),
      unattributed: (r.agent ?? "unattributed") === "unattributed",
    }));

    return {
      rows,
      loopingCount: rows.filter((r) => r.loopingRuns > 0).length,
      isLoading: res.isLoading,
      isEmpty: !res.isLoading && rows.length === 0,
      error: res.error ?? undefined,
    };
  }, [res.data, res.isLoading, res.error]);
};
