import type { AgentRow } from "./useAgents";

/**
 * The attribute-name variants that carry time-to-first-token, in coalesce
 * order. Used both to derive per-agent TTFT (buildAgentsQuery) and as the
 * presence-filter attribute set for the "filter to TTFT traces" action.
 */
export const TTFT_ATTRIBUTES = [
  "gen_ai.response.ttft",
  "gen_ai.usage.time_to_first_token",
  "gen_ai.response.time_to_first_chunk",
];

/**
 * Fleet TTFT summary derived from per-agent average time-to-first-token.
 *
 * TTFT (gen_ai.response.ttft, in ms) is emitted only on streamed model/agent
 * responses, so it lands on a subset of agents. buildAgentsQuery already
 * computes each agent's avg TTFT (AgentRow.ttftMs); this collapses those
 * per-agent averages into a single fleet figure for the Agents-tab TTFT tile
 * and its popup. Percentiles are over per-agent values (the tile is framed
 * per-agent), not span-weighted.
 */
export interface TtftSummary {
  /** Number of agents emitting a TTFT value in the current scope. */
  agentsWithTtft: number;
  /** Median (P50) of per-agent average TTFT, in ms. */
  medianMs: number;
  /** P90 of per-agent average TTFT, in ms. */
  p90Ms: number;
  /** Mean of per-agent average TTFT, in ms. */
  avgMs: number;
  /** Per-agent TTFT values, ascending — for the popup distribution chart. */
  values: number[];
  /**
   * Names of the agents emitting TTFT — used by the popup's "filter to these
   * agents" action (sets a gen_ai.agent.name global filter). Order matches
   * `values` (ascending by TTFT).
   */
  agentNames: string[];
}

/** Nearest-rank percentile over an ascending-sorted array. */
const percentile = (sortedAsc: number[], p: number): number => {
  if (sortedAsc.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sortedAsc.length);
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, rank - 1));
  return sortedAsc[idx];
};

export const summarizeAgentTtft = (
  agents: Pick<AgentRow, "agent" | "ttftMs">[],
): TtftSummary | null => {
  // Keep the (name, value) pairing so the emitting agent names can back the
  // "filter to these agents" action, then sort ascending by TTFT.
  const emitters = agents
    .filter(
      (a): a is Pick<AgentRow, "agent" | "ttftMs"> & { ttftMs: number } =>
        typeof a.ttftMs === "number" &&
        Number.isFinite(a.ttftMs) &&
        a.ttftMs > 0,
    )
    .map((a) => ({ agent: a.agent, ttftMs: a.ttftMs }))
    .sort((a, b) => a.ttftMs - b.ttftMs);
  if (emitters.length === 0) return null;
  const values = emitters.map((e) => e.ttftMs);
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
  return {
    agentsWithTtft: values.length,
    medianMs: percentile(values, 50),
    p90Ms: percentile(values, 90),
    avgMs: avg,
    values,
    agentNames: emitters.map((e) => e.agent),
  };
};
