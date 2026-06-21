/**
 * Per-framework node data for the AI Application Architecture map. The single
 * "Orchestrator" node is split into one node PER orchestration framework
 * (LangGraph, LangChain, …) plus an "Other" fallback.
 *
 * ONE scoped summarize over the WORKFLOW (orchestration) span population —
 * the exact `is_wf` predicate useArchitectureData uses — assigns each span a
 * framework label via a programmatic if/else chain over FRAMEWORK_NODE_DEFS,
 * then counts spans, logical errors (same LOGICAL_ERROR_EXPR), and p90 latency
 * per framework. `rowsToFrameworkNodes` folds the labeled rows back into typed
 * nodes (id resolved from label), forcing "Other" last regardless of count.
 *
 * Routes through useScopedDql (timeframe, segments, sampling, scan-limit, global
 * filter) — `null` serviceIds (fleet-wide; scopeFilterClause emits ""), matching
 * the sibling archMap query builders.
 */
import {
  dqlTimeArg,
  scopeFilterClause,
  dqlIdArray,
  LOGICAL_ERROR_EXPR,
} from "../../../scope/queries";
import type { Timeframe } from "../../../scope/types";
import { FRAMEWORK_LABEL, type FrameworkId } from "../../../detection/attributes";
import { toNum } from "../../../data/format";

/** A value-detectable orchestration framework and the exact literal signal
 *  values that identify it. `wf` matches traceloop.workflow.name; `system`
 *  matches gen_ai.system (only honored values that denote a FRAMEWORK). */
export interface FrameworkNodeDef {
  id: FrameworkId;
  label: string;
  wf?: string[];
  system?: string[];
  /** Raw DQL boolean predicate ORed into this framework's match — for signals
   *  that aren't a value-list match (e.g. LangGraph node/checkpoint attributes). */
  extra?: string;
}

/** ORDERED — drives both the if-chain precedence and the default node order. */
export const FRAMEWORK_NODE_DEFS: FrameworkNodeDef[] = [
  {
    id: "langgraph",
    label: FRAMEWORK_LABEL.langgraph,
    wf: ["LangGraph"],
    extra:
      "isNotNull(traceloop.association.properties.langgraph_node) or isNotNull(traceloop.association.properties.langgraph_checkpoint_ns)",
  },
  {
    id: "langchain",
    label: FRAMEWORK_LABEL.langchain,
    wf: ["RunnableSequence", "AgentExecutor"],
    system: ["langchain"],
  },
  { id: "crewai", label: FRAMEWORK_LABEL.crewai, system: ["crewai"] },
  { id: "agno", label: FRAMEWORK_LABEL.agno, system: ["agno"] },
  { id: "llamaindex", label: FRAMEWORK_LABEL.llamaindex, wf: ["llama_index_query_pipeline"] },
  { id: "haystack", label: FRAMEWORK_LABEL.haystack, wf: ["haystack_pipeline"] },
  { id: "openai-agents", label: FRAMEWORK_LABEL["openai-agents"], wf: ["Agent Workflow"] },
];

/** WORKFLOW (orchestration) span population — copied verbatim from
 *  useArchitectureData's `is_wf` expression. */
const IS_WF_PREDICATE =
  "isNotNull(traceloop.workflow.name) or isNotNull(traceloop.association.properties.langgraph_node)";

/** The DQL boolean predicate that is TRUE for spans belonging to a framework
 *  def: OR of an in(...) test on each signal it specifies. */
const defPredicate = (def: FrameworkNodeDef): string => {
  const parts: string[] = [];
  if (def.wf && def.wf.length > 0)
    parts.push(`in(toString(traceloop.workflow.name), array(${dqlIdArray(def.wf)}))`);
  if (def.system && def.system.length > 0)
    parts.push(`in(toString(gen_ai.system), array(${dqlIdArray(def.system)}))`);
  if (def.extra) parts.push(def.extra);
  return parts.join(" or ");
};

/** Build the nested `if(p0, "l0", else: if(p1, "l1", else: ... else: "Other"))`
 *  chain programmatically — one closing paren per def. */
const buildFwChain = (defs: FrameworkNodeDef[]): string => {
  const open = defs
    .map((def) => `if(${defPredicate(def)}, "${def.label}", else: `)
    .join("");
  const close = ")".repeat(defs.length);
  return `${open}"Other"${close}`;
};

export const buildFrameworkNodesQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
): string => {
  const toClause = dqlTimeArg(timeframe.to ?? "now()");
  return `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${toClause}
${scopeFilterClause(serviceIds)}
| filter ${IS_WF_PREDICATE}
| fieldsAdd is_err = if(${LOGICAL_ERROR_EXPR}, 1, else: 0)
| fieldsAdd fw = ${buildFwChain(FRAMEWORK_NODE_DEFS)}
| summarize n = count(), err = countIf(is_err == 1), p90ns = percentile(duration, 90), by: { fw }
| sort n desc
| limit 50
`.trim();
};

export interface FrameworkNodeRow {
  fw?: string | null;
  n?: number | string | null;
  err?: number | string | null;
  p90ns?: number | string | null;
}

export interface FrameworkNode {
  id: FrameworkId | "other";
  label: string;
  count: number;
  errorRate: number;
  p90Ms: number;
}

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

/** label → FrameworkId, built once from the ordered defs. */
const LABEL_TO_ID = new Map<string, FrameworkId>(
  FRAMEWORK_NODE_DEFS.map((d) => [d.label, d.id]),
);

/** Fold labeled rows into typed nodes. Drops count-0 rows; sorts by count desc
 *  but always keeps "Other" last regardless of its count. */
export const rowsToFrameworkNodes = (rows: FrameworkNodeRow[]): FrameworkNode[] => {
  const nodes: FrameworkNode[] = [];
  for (const r of rows) {
    const count = num(r.n);
    if (count <= 0) continue;
    const label = r.fw ?? "Other";
    const isOther = label === "Other" || !LABEL_TO_ID.has(label);
    const id: FrameworkId | "other" = isOther ? "other" : LABEL_TO_ID.get(label)!;
    const err = num(r.err);
    nodes.push({
      id,
      label: isOther ? "Other" : label,
      count,
      errorRate: count > 0 ? err / count : 0,
      p90Ms: num(r.p90ns) / 1e6,
    });
  }
  return nodes.sort((a, b) => {
    if (a.id === "other" && b.id !== "other") return 1;
    if (b.id === "other" && a.id !== "other") return -1;
    return b.count - a.count;
  });
};
