import { LOGICAL_ERROR_EXPR, dqlTimeArg, mcpNotLifecycleClause } from "../../scope/queries";
import type { Timeframe } from "../../scope/types";

/**
 * Pulse problem-pattern drill-downs land on the Prompts tab with `?focus=<id>`
 * (set by the Pulse NodeDrawer, see PP-2). Each id maps to a DQL boolean
 * fragment applied as `| filter (<predicate>)` in `buildPromptsListQuery`, and
 * an optional `orderBy` DQL expression that sharpens the pattern by surfacing
 * the worst offenders first (e.g. highest ttft / most tokens). The `label`
 * drives the removable "Filtered: <label>" chip on the page.
 *
 * These are page-local predicates (comparisons / thresholds), NOT global
 * attribute filters — they're kept here rather than routed through
 * injectGlobalFilters. The focus ANDs with the sidebar (`pf_*`) filter and the
 * global filter.
 *
 * The destination reads the RAW `?focus` string param (NOT the typed
 * useFocusParam union, which only covers architecture-layer keys).
 */
export interface FocusPreset {
  /** Human label shown in the "Filtered: <label>" chip. */
  label: string;
  /** DQL boolean fragment applied as `| filter (<predicate>)`. */
  predicate: string;
  /**
   * Optional DQL sort expression (without the leading `| sort`) applied so the
   * worst-offending rows surface first, e.g. `gen_ai.response.ttft desc`.
   */
  orderBy?: string;
}

/**
 * Model fallback / mismatch: request model != response model, AFTER normalizing
 * both sides so provider routing prefixes + version/date snapshots of the SAME
 * logical model don't false-positive. On this tenant EVERY raw request!=response
 * pair was such a non-difference (e.g. request `us.anthropic.claude-opus-4-8`,
 * response `claude-opus-4-8` — same model, Bedrock region prefix only), so
 * normalization is essential, not cosmetic.
 *
 * Normalization uses DQL `replacePattern` with DPL patterns (NOT regex —
 * `replacePattern` takes a DPL pattern; a regex with `(...)` alternation throws
 * ERROR_IN_PARSING_PATTERN). Four passes, in order, validated on ualpre:
 *   1. `<region>.<vendor>.` prefix → ``  (us.anthropic. / global.anthropic.)
 *   2. `-YYYY-MM-DD` date snapshot → ``  (gpt-4o-2024-08-06 → gpt-4o)
 *   3. `-vN` / `-vN:N` version tag → ``  (…-v1:0, …-v1)
 *   4. `-NNNNNNNN` (8-digit) date  → ``  (…-20241022)
 * Genuine variants (gpt-4o vs gpt-4o-mini, sonnet vs haiku) are preserved, so
 * the comparison flags only real base-model differences (true fallbacks).
 * Caveat: a non-numeric rolling alias (e.g. `-latest`, `-preview`) is NOT
 * stripped and would read as a mismatch vs the bare base name; not observed
 * on this tenant.
 */
const MODEL_NORM = (col: string): string =>
  `replacePattern(replacePattern(replacePattern(replacePattern(lower(toString(${col})), "LD:p '.' LD:v '.'", ""), "'-' INT:y '-' INT:mo '-' INT:d", ""), "'-v' INT:vn (':' INT:sub)? EOS", ""), "'-' INT:d8 EOS", "")`;

const MODEL_MISMATCH_PREDICATE = `isNotNull(gen_ai.response.model) and isNotNull(gen_ai.request.model) and ${MODEL_NORM(
  "gen_ai.request.model",
)} != ${MODEL_NORM("gen_ai.response.model")}`;

export const FOCUS_PREDICATES: Record<string, FocusPreset> = {
  "llm-ctx-exhaustion": {
    label: "Context-window exhaustion",
    // Responses cut off by the length / max-tokens limit. Reuses the same
    // finish_reasons → toString → contains approach the Prompts page already
    // uses for its `truncated` flag, widened to also catch the "length" reason.
    predicate: `contains(toString(gen_ai.response.finish_reasons), "max_tokens") or contains(toString(gen_ai.response.finish_reasons), "length")`,
  },
  "llm-logical-errors": {
    label: "Logical errors",
    // The shared logical-error rule (error status / http>=400 / exception /
    // gen_ai.error.code / refusal / content_filter).
    predicate: LOGICAL_ERROR_EXPR,
  },
  "llm-rate-limit": {
    label: "Provider rate-limit",
    predicate: `toLong(coalesce(http.response.status_code, 0)) == 429`,
  },
  "llm-model-mismatch": {
    label: "Model fallback / mismatch",
    predicate: MODEL_MISMATCH_PREDICATE,
  },
  "llm-ttft-degradation": {
    label: "TTFT degradation",
    // Capability-gated: surfaces only prompts that emit ttft (none if the
    // tenant doesn't instrument it), worst-first.
    predicate: `isNotNull(gen_ai.response.ttft)`,
    orderBy: `gen_ai.response.ttft desc`,
  },
  "tool-token-spike": {
    label: "Tool-output token spike",
    // SAME-SPAN: a tool result fed back into the next LLM call inflates that
    // call's input tokens. The defining signal — large `gen_ai.usage.input_tokens`
    // — lives on the prompt span itself, so this is a simple predicate + sort, NOT
    // a cross-span trace scope. Threshold 8000 input tokens: validated on ualpre
    // (10,951 of 173,214 token-bearing prompt spans exceed it; max 297,004).
    // Worst-first by input tokens so the biggest context-inflation surfaces.
    predicate: `toLong(coalesce(gen_ai.usage.input_tokens, gen_ai.usage.prompt_tokens, 0)) > 8000`,
    orderBy: `in_tok desc`,
  },
  "orch-token-growth": {
    label: "Token growth",
    // Within-trace token growth isn't derivable from a single span, so this is
    // an approximation: surface the largest-token prompts (biggest consumers).
    // `in_tok` / `out_tok` are fieldsAdd'd by buildPromptsListQuery before the
    // sort, so this orders on the same coalesced token totals.
    predicate: `toLong(coalesce(gen_ai.usage.input_tokens, gen_ai.usage.prompt_tokens, 0)) + toLong(coalesce(gen_ai.usage.output_tokens, gen_ai.usage.completion_tokens, 0)) > 0`,
    orderBy: `in_tok + out_tok desc`,
  },
};

/** Type guard: is this raw `?focus` value a known Prompts-tier focus preset? */
export const isPromptsFocus = (
  focus: string | null | undefined,
): focus is string => Boolean(focus && focus in FOCUS_PREDICATES);

/** Resolve a raw `?focus` value to its preset (or undefined if unknown). */
export const promptsFocusPreset = (
  focus: string | null | undefined,
): FocusPreset | undefined =>
  isPromptsFocus(focus) ? FOCUS_PREDICATES[focus] : undefined;

/* ------------------------------------------------------------------ *
 * CROSS-SPAN focus presets (PP-4)
 *
 * Some Pulse problem patterns drill to Prompts but their DEFINING signal does
 * NOT live on the LLM / prompt span the Prompts page reads — it lives on the
 * tool span (tool failures, tool-call counts) or on conversation/state spans.
 * A same-span `| filter` (FOCUS_PREDICATES above) therefore can't express them.
 *
 * Instead these resolve the matching `trace.id`s with a small per-focus query
 * (filter spans to the pattern's defining signal, `summarize by:{trace.id}`,
 * cap at SAFE_TRACE_CAP) and then scope the Prompts list to those traces via
 * `injectTraceScope` — the SAME machinery the hybrid global filter uses for
 * cross-span entity filters (agent/tool name). This surfaces the PROMPTS that
 * ran inside the traces exhibiting the pattern.
 *
 * The resolver query MUST pre-filter to the pattern's defining span population
 * BEFORE `summarize by:{trace.id}` — a bare full-table group-by on this tenant
 * (6.7B spans/24h) trips the internal ~10s fetch ceiling and returns
 * incomplete results (Lesson 23/38). Every builder below filters first.
 *
 * All thresholds + signals validated on ualpre over now()-24h (counts noted
 * per builder). `approximate: true` flags presets that fall back to a proxy
 * because the pattern's exact attribute isn't emitted on this tenant.
 * ------------------------------------------------------------------ */

/** A cross-span Prompts focus: resolved to trace.ids, then the Prompts list is
 *  scoped to those traces. The `label` drives the "Filtered: <label>" chip;
 *  `approximate` adds the "≈ approximate" marker when the signal is a proxy. */
export interface CrossSpanFocusPreset {
  /** Human label shown in the "Filtered: <label>" chip. */
  label: string;
  /** True when the resolver uses a proxy because the exact signal isn't emitted
   *  on this tenant (surfaced as an "≈ approximate" chip marker). */
  approximate?: boolean;
  /**
   * Build the trace-resolution query: pre-filter spans to the defining signal,
   * `summarize by:{trace.id}`, apply the per-pattern threshold, project the
   * trace id as a string, and cap at `cap + 1` so the caller can flag
   * truncation. Mirrors the buildTraceScopeQuery shape so injectTraceScope can
   * consume the resolved ids unchanged.
   */
  buildResolveQuery: (timeframe: Timeframe, cap: number) => string;
}

const toClauseOf = (tf: Timeframe): string => dqlTimeArg(tf.to ?? "now()");
const fromOf = (tf: Timeframe): string => dqlTimeArg(tf.from);

/** Tool-error rule for retry-storm: a tool span that failed. `span.status_code`
 *  is lowercase on this tenant (Lesson 27); the `isError`-in-output paths are
 *  near-zero but kept as belt-and-braces. Validated: 1,171 of 16,835 tool spans
 *  carry span.status_code=="error". */
const TOOL_ERROR_EXPR = `(span.status_code == "error" or isNotNull(exception.type) or contains(toString(traceloop.entity.output), "isError") or contains(toString(mcp.response.value), "isError"))`;

/** A span that counts as a tool call (same classifier the Agents page uses). */
const TOOL_CALL_EXPR = `(traceloop.span.kind == "tool" or isNotNull(gen_ai.tool.name) or (mcp.method.name == "tools/call" and ${mcpNotLifecycleClause()}))`;

/** Retrieval span heuristic, scoped to agent traces. `vector_db.query.top_k` is
 *  emitted on 0 spans on this tenant and there is no `vector` db.system, so the
 *  proxy is the span-name retrieval heuristic the Agents latency-tier query uses
 *  — restricted to agent traces so the scan stays under the time ceiling. */
const RETRIEVAL_LNAME_EXPR = `(gen_ai.operation.name == "embeddings" or contains(lname,"retriev") or contains(lname,"vector") or contains(lname,"embed") or contains(lname,"lookup") or contains(lname,"search"))`;

/** Conversation / thread / checkpoint state signal for history growth. */
const STATE_SIGNAL_EXPR = `(isNotNull(gen_ai.conversation.id) or isNotNull(traceloop.association.properties.thread_id) or isNotNull(traceloop.association.properties.langgraph_checkpoint_ns))`;

/** Per-trace count thresholds (validated on ualpre over now()-24h). */
export const N1_TOOL_CALL_THRESHOLD = 5; // 30 traces ≥5 tool calls (max 789)
export const RETRY_STORM_FAIL_THRESHOLD = 2; // 48 traces ≥2 tool failures
export const RETRIEVAL_VOLUME_THRESHOLD = 1; // 102 agent-traces do retrieval
export const HISTORY_STATE_THRESHOLD = 20; // 268 traces ≥20 state spans

/** Common tail: cap+1 limit so truncation is detectable, project trace id. */
const resolveTail = (cap: number): string =>
  `| fields trace_id = toString(trace.id)\n| limit ${cap + 1}`;

export const CROSS_SPAN_FOCUS: Record<string, CrossSpanFocusPreset> = {
  "tool-retry-storm": {
    label: "Tool retry storm",
    // Traces with repeated tool FAILURES. Pre-filter to failing tool spans, then
    // keep traces with >= 2 of them. 48 traces over 24h on ualpre.
    buildResolveQuery: (tf, cap) =>
      `
fetch spans, samplingRatio: 1, from: ${fromOf(tf)}, to: ${toClauseOf(tf)}
| filter traceloop.span.kind == "tool" and ${TOOL_ERROR_EXPR}
| summarize fails = count(), by: { trace.id }
| filter fails >= ${RETRY_STORM_FAIL_THRESHOLD}
${resolveTail(cap)}
`.trim(),
  },
  "agent-n1-tool-calls": {
    label: "High-frequency tool calls (N+1)",
    // Traces with a high tool-call count. Pre-filter to tool spans (a bare
    // full-table group-by trips the time ceiling), keep traces with >= 5 calls.
    // 30 traces over 24h on ualpre (max 789 tool calls in one trace).
    buildResolveQuery: (tf, cap) =>
      `
fetch spans, samplingRatio: 1, from: ${fromOf(tf)}, to: ${toClauseOf(tf)}
| filter ${TOOL_CALL_EXPR}
| summarize tools = count(), by: { trace.id }
| filter tools >= ${N1_TOOL_CALL_THRESHOLD}
${resolveTail(cap)}
`.trim(),
  },
  "vdb-topk-over-retrieval": {
    label: "Top-K over-retrieval",
    // APPROXIMATE: `vector_db.query.top_k` is emitted on 0 spans on this tenant
    // and there's no vector db.system, so we can't threshold on K or retrieval
    // volume. Proxy: traces whose AGENT execution does retrieval at all (the
    // span-name retrieval heuristic, scoped to agent traces so the scan stays
    // under the time ceiling). 102 agent-traces over 24h on ualpre.
    approximate: true,
    buildResolveQuery: (tf, cap) =>
      `
fetch spans, samplingRatio: 1, from: ${fromOf(tf)}, to: ${toClauseOf(tf)}
| filter isNotNull(gen_ai.agent.name)
| fieldsAdd lname = lower(span.name)
| filter ${RETRIEVAL_LNAME_EXPR}
| summarize r = count(), by: { trace.id }
| filter r >= ${RETRIEVAL_VOLUME_THRESHOLD}
${resolveTail(cap)}
`.trim(),
  },
  "mem-history-growth": {
    label: "History growth",
    // Traces with growing conversation / thread / checkpoint state. Pre-filter
    // to state-bearing spans, keep traces with >= 20 of them (the tail of the
    // distribution — most state traces sit at ~10). 268 traces over 24h on
    // ualpre (max 159 state spans in one trace). approximate: no stable
    // gen_ai.conversation.id, so this counts state-bearing spans as the proxy.
    approximate: true,
    buildResolveQuery: (tf, cap) =>
      `
fetch spans, samplingRatio: 1, from: ${fromOf(tf)}, to: ${toClauseOf(tf)}
| filter ${STATE_SIGNAL_EXPR}
| summarize state = count(), by: { trace.id }
| filter state >= ${HISTORY_STATE_THRESHOLD}
${resolveTail(cap)}
`.trim(),
  },
};

/** One selectable problem-pattern filter for the Prompts sidebar. */
export interface PromptsFocusOption {
  id: string;
  label: string;
  /** True when the signal is a proxy (shown with an "≈ approx" marker). */
  approximate: boolean;
}

/**
 * Every problem pattern the Prompts page can filter by — the same set the Pulse
 * architecture diagram drills into (same-span predicates + cross-span trace
 * scopes). Surfaced as a single-select list at the top of the Prompts sidebar so
 * a pattern can be picked directly, not only by drilling in from Pulse. Order:
 * same-span LLM/tool/orch predicates first, then the trace-scoped patterns.
 */
export const PROMPTS_FOCUS_OPTIONS: PromptsFocusOption[] = [
  ...Object.entries(FOCUS_PREDICATES).map(([id, p]) => ({
    id,
    label: p.label,
    approximate: false,
  })),
  ...Object.entries(CROSS_SPAN_FOCUS).map(([id, p]) => ({
    id,
    label: p.label,
    approximate: Boolean(p.approximate),
  })),
];

/** Type guard: is this raw `?focus` a known CROSS-SPAN (trace-scoped) focus? */
export const isCrossSpanFocus = (
  focus: string | null | undefined,
): focus is string => Boolean(focus && focus in CROSS_SPAN_FOCUS);

/** Resolve a raw `?focus` to its cross-span preset (or undefined). */
export const crossSpanFocusPreset = (
  focus: string | null | undefined,
): CrossSpanFocusPreset | undefined =>
  isCrossSpanFocus(focus) ? CROSS_SPAN_FOCUS[focus] : undefined;

/**
 * The chip label for ANY known Prompts focus — same-span OR cross-span. Returns
 * the label plus whether the signal is approximate (proxy), so the page can
 * render the "Filtered: <label>" chip with an optional "≈ approximate" marker
 * for both kinds of focus. Undefined for an unknown / absent focus.
 */
export const promptsFocusChip = (
  focus: string | null | undefined,
): { label: string; approximate: boolean } | undefined => {
  const same = promptsFocusPreset(focus);
  if (same) return { label: same.label, approximate: false };
  const cross = crossSpanFocusPreset(focus);
  if (cross) return { label: cross.label, approximate: Boolean(cross.approximate) };
  return undefined;
};
