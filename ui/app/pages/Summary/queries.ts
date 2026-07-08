import { dqlTimeArg, scopeFilterClause } from "../../scope/queries";
import type { Timeframe } from "../../scope/types";
import { FOCUS_PREDICATES } from "../Prompts/focus";

const to = (tf: Timeframe): string => tf.to ?? "now()";

/**
 * Turn a problem-pattern focus id (kebab-case, e.g. `llm-ctx-exhaustion`) into a
 * DQL-safe summarize alias (`llm_ctx_exhaustion`). Hyphens aren't valid in a DQL
 * identifier, so the same-span count query aliases each `countIf` by this and the
 * hook maps the result columns back to the focus ids.
 */
export const patternAlias = (id: string): string =>
  id.replace(/[^A-Za-z0-9_]/g, "_");

/*
 * Hidden · 200-OK category expressions. These MIRROR the per-span `has_*`
 * booleans in Explorer's `buildAIServicesQuery` (Explorer/queries.ts) so the
 * split adds up to the same logical-error population the Explorer catalog
 * reports — the load-bearing signal on this tenant is
 * `gen_ai.response.finish_reasons`; the OTel-native markers are usually empty
 * but kept for portability. Kept local (not imported) to avoid destabilizing
 * the Explorer query's exact output; keep the two in sync if either changes.
 */
const REFUSAL_EXPR = `(isNotNull(gen_ai.response.refusal_reason) or contains(toString(gen_ai.response.finish_reasons), "refusal"))`;
const TRUNCATION_EXPR = `contains(toString(gen_ai.response.finish_reasons), "max_tokens")`;
const CONTENT_FILTER_EXPR = `contains(toString(gen_ai.response.finish_reasons), "content_filter")`;
const OTHER_LOGICAL_EXPR = `(isNotNull(gen_ai.error.type) or isNotNull(gen_ai.guardrail.action) or isNotNull(gen_ai.moderation.action))`;

/**
 * Hidden · 200-OK donut data: split the HTTP-200 logical failures into refusals,
 * max-token truncation, content-filter blocks, and an "other" bucket
 * (provider/guardrail markers). One grouped scan over the LLM span population;
 * scan-limit, sampling, segments, and the global filter are injected by
 * useScopedDql at call time (so none appear here).
 */
export const buildHiddenFailuresQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.provider.name)
| dedup {span.id}
| summarize
    refusals = countIf(${REFUSAL_EXPR}),
    truncations = countIf(${TRUNCATION_EXPR}),
    content_filters = countIf(${CONTENT_FILTER_EXPR}),
    other = countIf(${OTHER_LOGICAL_EXPR})
`.trim();

/**
 * Cheap fleet counts for the posture hero subline: distinct AI services and
 * distinct agents in scope. The population is `gen_ai.provider.name` OR
 * `gen_ai.agent.name` because agent spans live in services that don't always
 * emit provider.name directly (the LLM-proxy pattern on this tenant) — filtering
 * to provider-only would report zero agents. `countDistinct` ignores nulls and
 * is sampling-invariant, so agents/services each count their own population in
 * one scan and the caller applies no extrapolation. Injection (scan-limit /
 * sampling / filter) is applied later by useScopedDql.
 */
export const buildFleetCountsQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.provider.name) or isNotNull(gen_ai.agent.name)
| summarize
    services = countDistinct(dt.entity.service),
    agents = countDistinct(gen_ai.agent.name)
`.trim();

/**
 * Same-span problem-pattern match counts: one grouped scan that counts, per
 * detector, how many LLM/prompt spans match its predicate. The predicates come
 * straight from the real `FOCUS_PREDICATES` registry the Prompts page uses, so
 * a threshold change there flows here automatically (no duplicated detector
 * logic). Cross-span detectors (tool retry storm, N+1, top-K, history growth)
 * are counted separately by running their trace resolvers — see
 * useProblemPatternCounts. Injection (scan-limit / sampling / filter) is applied
 * later by useScopedDql.
 */
export const buildSameSpanPatternCountsQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
): string => {
  const counters = Object.entries(FOCUS_PREDICATES)
    .map(([id, preset]) => `    ${patternAlias(id)} = countIf(${preset.predicate})`)
    .join(",\n");
  return `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.provider.name)
| dedup {span.id}
| summarize
${counters}
`.trim();
};
