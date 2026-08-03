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

/** Canned raw rows (shaped exactly like the real loops query's result),
 *  folded through `foldAgentLoops` below rather than hand-typed — used only
 *  when `showExample` is set (Pulse's architecture map in Demo Mode / no
 *  telemetry). A minority of runs loop; one agent is unattributed, mirroring
 *  the real-world LangGraph node/agent-name attribution gap this hook's doc
 *  comments call out. */
const DEMO_AGENT_LOOP_RECORDS: LoopRecord[] = [
  { agent: "trip-planner-agent", runs: 420, looping_runs: 58, loop_rate_pct: 13.8, max_repeat: 4, max_steps: 11, avg_nodes_per_run: 4.2 },
  { agent: "refund-adjudicator", runs: 260, looping_runs: 71, loop_rate_pct: 27.3, max_repeat: 6, max_steps: 18, avg_nodes_per_run: 6.1 },
  { agent: "support-triage-agent", runs: 610, looping_runs: 19, loop_rate_pct: 3.1, max_repeat: 2, max_steps: 6, avg_nodes_per_run: 2.8 },
  { agent: "unattributed", runs: 180, looping_runs: 22, loop_rate_pct: 12.2, max_repeat: 3, max_steps: 9, avg_nodes_per_run: 3.4 },
];

/** Pure fold: raw LoopRecord rows -> typed AgentLoopRow[]. Exported so demo
 *  datasets (Pulse's architecture map + Agents pages) can build a fixture row
 *  set shaped exactly like the DQL result and run it through the SAME fold the
 *  real hook uses, instead of hand-typing the derived shape. */
export const foldAgentLoops = (records: LoopRecord[]): AgentLoopRow[] =>
  records.map((r) => ({
    agent: r.agent ?? "unattributed",
    runs: num(r.runs),
    loopingRuns: num(r.looping_runs),
    loopRatePct: num(r.loop_rate_pct),
    maxRepeat: num(r.max_repeat),
    maxSteps: num(r.max_steps),
    avgNodesPerRun: num(r.avg_nodes_per_run),
    unattributed: (r.agent ?? "unattributed") === "unattributed",
  }));

/**
 * `showExample` defaults to false so this hook's OTHER callers (AgentsPage,
 * AgentsTable, AgentsTilesRow, tilePopups) are completely unaffected — only
 * Pulse's architecture map passes it, computed from its own Demo Mode /
 * no-telemetry `showExample` flag.
 */
export const useAgentLoops = (showExample = false): UseAgentLoopsResult => {
  const { scope } = useScope();
  const res = useScopedDql<LoopRecord>(buildAgentLoopsQuery(null, scope.timeframe), {
    staleTime: 60_000,
    enabled: !showExample,
  });

  return useMemo<UseAgentLoopsResult>(() => {
    if (showExample) {
      const rows = foldAgentLoops(DEMO_AGENT_LOOP_RECORDS);
      return {
        rows,
        loopingCount: rows.filter((r) => r.loopingRuns > 0).length,
        isLoading: false,
        isEmpty: false,
        error: undefined,
      };
    }
    // `runs` / `looping_runs` are distinct-trace group counts, NOT span counts,
    // so they are NOT multiplied by the span sampling ratio (group count
    // doesn't scale linearly with span sampling). Shown as observed; the
    // loop-rate percentage is sampling-invariant.
    const rows = foldAgentLoops(res.data?.records ?? []);

    return {
      rows,
      loopingCount: rows.filter((r) => r.loopingRuns > 0).length,
      isLoading: res.isLoading,
      isEmpty: !res.isLoading && rows.length === 0,
      error: res.error ?? undefined,
    };
  }, [showExample, res.data, res.isLoading, res.error]);
};
