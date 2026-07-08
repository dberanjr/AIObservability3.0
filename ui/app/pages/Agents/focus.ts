import type { AgentRow } from "./useAgents";
import { HIGH_FREQUENCY_TOOL_THRESHOLD } from "./constants";

/**
 * Pulse problem-pattern drill-downs land on the Agents tab with `?focus=<id>`
 * (set by the Pulse NodeDrawer, see PP-2). Unlike the Prompts page — where each
 * focus injects a DQL `| filter` clause into the list query — the Agents page
 * works on the ALREADY-FETCHED per-agent rows (`useAgents().substantive`). So
 * each preset here is a pure ROW operation: `apply(rows, ctx)` returns a new,
 * filtered/sorted row array. This is the right grain because every signal these
 * patterns care about (error rate, p90, tool-call frequency, loop rate,
 * retrieval volume) is already an aggregated per-agent column or an auxiliary
 * fleet signal the page already loads — no extra query, no DQL needed.
 *
 * The destination reads the RAW `?focus` string param (NOT the typed
 * useFocusParam union, which only covers architecture-layer keys). The `label`
 * drives the removable "Filtered: <label>" chip on the page.
 *
 * Data-grain notes (validated on ualpre over now()-24h):
 *  - `vector_db.query.top_k` is NOT emitted on ANY span in this tenant (0 of
 *    2B+ scanned), so `vdb-topk-over-retrieval` can't threshold on top_k. The
 *    closest defensible signal at the agent grain is RETRIEVAL VOLUME: agents
 *    are sorted by their retrieval-stage share (`stage.retrieval`) then total
 *    invocations. 11/31 agents carry retrieval spans (max 64), so the signal is
 *    real, just a proxy — flagged `approximate` below.
 *  - Tool spans almost never carry `gen_ai.agent.name` directly (max tool_spans
 *    per agent ≈ 0). So `tool-retry-storm` can't use a per-agent tool error
 *    rate. The N+1 tool-frequency signal instead comes from the dedicated
 *    high-frequency-tools query (internal/client function spans), surfaced
 *    via the `highFreqAgents` Set the table already loads — `agent-n1-tool-calls`
 *    reuses that. `tool-retry-storm` falls back to overall agent error rate
 *    among the tool-using / high-frequency agents — flagged `approximate`.
 *  - `gen_ai.conversation.id` is absent; thread/checkpoint state lives only on
 *    the 161 LangGraph spans, which are exactly the loop-detection spans. So
 *    `mem-history-growth` surfaces the agents that have LangGraph runs (the
 *    loop-context agents), sorted by their run/node volume — flagged
 *    `approximate`.
 */

/** Auxiliary fleet signals the Agents page already loads, passed to `apply`. */
export interface FocusContext {
  /**
   * Agent names flagged N+1 (a single tool called above the high-frequency
   * threshold), from `useHighFrequencyAgents()` (the high-frequency tools query).
   */
  highFreqAgents?: Set<string>;
  /**
   * Per-agent loop signal from `useAgentLoops()`: maps agent name → its loop
   * rate (%) and run/node volume. Used by `orch-reasoning-loop` and
   * `mem-history-growth`.
   */
  loopByAgent?: Map<string, { loopRatePct: number; runs: number; avgNodesPerRun: number }>;
}

export interface AgentFocusPreset {
  /** Human label shown in the "Filtered: <label>" chip. */
  label: string;
  /**
   * True when the pattern's true signal isn't available at the agent grain on
   * this tenant and `apply` uses the closest defensible proxy (see file notes).
   * Surfaced in the chip tooltip so the approximation is honest.
   */
  approximate?: boolean;
  /**
   * Pure row operation: take the fetched per-agent rows (+ auxiliary signals)
   * and return the filtered/sorted subset that matches the pattern. Must not
   * mutate the input array.
   */
  apply: (rows: AgentRow[], ctx?: FocusContext) => AgentRow[];
}

const byErrorRateThenP90 = (a: AgentRow, b: AgentRow): number =>
  b.errorRatePct - a.errorRatePct || b.p90Ms - a.p90Ms;

export const AGENT_FOCUS_PRESETS: Record<string, AgentFocusPreset> = {
  "agent-n1-tool-calls": {
    label: "High-frequency tool calls (N+1)",
    // Reuse the app's existing N+1 detection: the `highFreqAgents` Set already
    // flags agents where a single tool was called above the threshold. Filter
    // to those, then sort by the per-agent tool-call count (proxy: toolCount)
    // and invocations desc so the busiest offenders surface first. When the Set
    // isn't supplied (e.g. unit context), fall back to sorting all rows by
    // toolCount desc so the pattern still surfaces tool-heavy agents.
    apply: (rows, ctx) => {
      const flagged = ctx?.highFreqAgents;
      const base =
        flagged && flagged.size > 0
          ? rows.filter((r) => flagged.has(r.agent))
          : rows;
      return [...base].sort(
        (a, b) => b.toolCount - a.toolCount || b.invocations - a.invocations,
      );
    },
  },
  "agent-degradation": {
    label: "Agent error / degradation",
    // Agents with elevated error rate or p90 latency: keep only agents with at
    // least one error, worst error rate (then p90) first. Fully populated on
    // ualpre (4/33 agents have errors, max ~14% error rate).
    apply: (rows) =>
      rows.filter((r) => r.errors > 0).sort(byErrorRateThenP90),
  },
  "tool-retry-storm": {
    label: "Tool retry storm",
    // True signal (per-tool error %/retries at the agent grain) isn't derivable:
    // tool spans rarely carry gen_ai.agent.name on this tenant. Approximate by
    // surfacing the tool-using agents (N+1-flagged or any with tool spans) and
    // ranking by overall error rate desc, which captures repeated-failure
    // agents. Falls back to all error-bearing agents if no tool signal.
    approximate: true,
    apply: (rows, ctx) => {
      const flagged = ctx?.highFreqAgents;
      const toolish = rows.filter(
        (r) => r.toolCount > 0 || (flagged?.has(r.agent) ?? false),
      );
      const base = toolish.length > 0 ? toolish : rows.filter((r) => r.errors > 0);
      return [...base].sort(byErrorRateThenP90);
    },
  },
  "vdb-topk-over-retrieval": {
    label: "Top-K over-retrieval",
    // `vector_db.query.top_k` is not emitted on any span in this tenant, so we
    // can't threshold on K. Closest defensible proxy at the agent grain:
    // retrieval VOLUME. Keep agents that do retrieval (retrieval stage share >
    // 0) and rank by retrieval share then invocations desc.
    approximate: true,
    apply: (rows) =>
      rows
        .filter((r) => r.stage.retrieval > 0)
        .sort(
          (a, b) =>
            b.stage.retrieval - a.stage.retrieval ||
            b.invocations - a.invocations,
        ),
  },
  "mem-history-growth": {
    label: "History growth",
    // No conversation id; thread/checkpoint state lives only on LangGraph spans,
    // which are the loop-detection runs. Surface agents that have LangGraph
    // run/state context (loopByAgent), sorted by run volume then nodes-per-run
    // desc (growing state). Falls back to invocations desc if no loop signal.
    approximate: true,
    apply: (rows, ctx) => {
      const loop = ctx?.loopByAgent;
      if (loop && loop.size > 0) {
        return rows
          .filter((r) => loop.has(r.agent))
          .sort((a, b) => {
            const la = loop.get(a.agent)!;
            const lb = loop.get(b.agent)!;
            return lb.runs - la.runs || lb.avgNodesPerRun - la.avgNodesPerRun;
          });
      }
      return [...rows].sort((a, b) => b.invocations - a.invocations);
    },
  },
  "orch-reasoning-loop": {
    label: "Reasoning loop",
    // Reuse the app's loop signal: keep agents with a non-zero loop rate, sort
    // by loop rate then run volume desc. Falls back to invocations desc when no
    // loop signal is supplied.
    apply: (rows, ctx) => {
      const loop = ctx?.loopByAgent;
      if (loop && loop.size > 0) {
        return rows
          .filter((r) => (loop.get(r.agent)?.loopRatePct ?? 0) > 0)
          .sort((a, b) => {
            const la = loop.get(a.agent)!;
            const lb = loop.get(b.agent)!;
            return lb.loopRatePct - la.loopRatePct || lb.runs - la.runs;
          });
      }
      return [...rows].sort((a, b) => b.invocations - a.invocations);
    },
  },
};

/** Type guard: is this raw `?focus` value a known Agents-tier focus preset? */
export const isAgentsFocus = (
  focus: string | null | undefined,
): focus is string => Boolean(focus && focus in AGENT_FOCUS_PRESETS);

/** Resolve a raw `?focus` value to its preset (or undefined if unknown). */
export const agentsFocusPreset = (
  focus: string | null | undefined,
): AgentFocusPreset | undefined =>
  isAgentsFocus(focus) ? AGENT_FOCUS_PRESETS[focus] : undefined;

/**
 * Apply a known `?focus` to the rows; a no-op (returns the input rows) for an
 * unknown / absent focus. The single entry point the page uses.
 */
export const applyAgentsFocus = (
  focus: string | null | undefined,
  rows: AgentRow[],
  ctx?: FocusContext,
): AgentRow[] => {
  const preset = agentsFocusPreset(focus);
  return preset ? preset.apply(rows, ctx) : rows;
};

// Re-export so callers that compute the high-frequency set can reuse the same
// threshold the focus presets reason about.
export { HIGH_FREQUENCY_TOOL_THRESHOLD };
