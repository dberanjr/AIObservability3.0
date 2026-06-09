import {
  dqlEscape,
  dqlIdArray,
  dqlTimeArg,
  scopeFilterClause,
  logicalErrorField,
} from "../../scope/queries";
import type { Timeframe } from "../../scope/types";
import type { AggTier } from "./useAggregateTopology";

/** DQL filter expression selecting the spans for a topology node. */
export const nodeFilterExpr = (tier: AggTier, label: string): string => {
  const v = dqlEscape(label);
  switch (tier) {
    case "agent":
      return `gen_ai.agent.name == "${v}"`;
    case "model":
      return `gen_ai.request.model == "${v}"`;
    case "provider":
      return `gen_ai.provider.name == "${v}"`;
    case "tool":
      return `gen_ai.tool.name == "${v}" or span.name == "${v}"`;
    case "service":
      return `entityName(dt.entity.service) == "${v}"`;
    default: // upstream / downstream — plain services
      return `service.name == "${v}"`;
  }
};

/**
 * Active Davis problems affecting the AI services in scope. Matched by entity
 * ID intersection (entityName() can't run on expanded affected_entity_ids), so
 * the caller maps the returned ids back to node names. Returns nothing when no
 * AI service has an active problem.
 */
export const buildAffectedServiceIdsQuery = (aiServiceIds: string[]): string => {
  if (aiServiceIds.length === 0) return "";
  return `
fetch dt.davis.problems, from: now()-24h, to: now()
| filter event.status == "ACTIVE"
| expand eid = affected_entity_ids
| filter in(eid, array(${dqlIdArray(aiServiceIds)}))
| summarize problems = count(), by: { eid }
`.trim();
};

/** Per-node RED summary (calls, errors, p50/p90/p99). */
export const buildNodeRedQuery = (
  expr: string,
  timeframe: Timeframe,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}, scanLimitGBytes: 500
| filter ${expr}
| fieldsAdd ${logicalErrorField("err")}
| summarize calls = count(), errors = sum(err),
    p50 = percentile(duration, 50), p90 = percentile(duration, 90), p99 = percentile(duration, 99)
`.trim();

/** Per-node call volume + p90 latency over time. */
export const buildNodeSeriesQuery = (
  expr: string,
  timeframe: Timeframe,
  intervalSec: number,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}, scanLimitGBytes: 500
| filter ${expr}
| makeTimeseries { calls = count(), p90 = percentile(duration, 90) }, interval: ${intervalSec}s
`.trim();

// The global attribute filter is injected centrally by useScopedDql, so these
// builders don't thread it (no globalFilterClauses call sites).
const to = (tf: Timeframe): string => tf.to ?? "now()";

/**
 * AI-core co-occurrence: service × agent × tool × model × provider with call +
 * error counts. The client derives nodes (per-tier distinct sets) and edges
 * (service→agent→tool, agent→model→provider). Capped to keep the graph
 * tractable. Only gen_ai.* spans — generic db.system is excluded because it
 * pulls in the whole fleet's infrastructure DB traffic.
 */
export const buildAggregateTopologyQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.provider.name) or isNotNull(gen_ai.agent.name) or isNotNull(gen_ai.tool.name)
| fieldsAdd ${logicalErrorField("has_err")}
| summarize calls = count(), errors = sum(has_err), by: {
    service = entityName(dt.entity.service),
    agent = gen_ai.agent.name,
    tool = gen_ai.tool.name,
    model = gen_ai.request.model,
    provider = gen_ai.provider.name
  }
| sort calls desc
| limit 5000
`.trim();

/** Resolve the dt.entity.service IDs (and names) that host AI activity in scope. */
export const buildAiServiceIdsQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
): string => `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}, scanLimitGBytes: 500
${scopeFilterClause(serviceIds)}
| filter isNotNull(gen_ai.provider.name) or isNotNull(gen_ai.agent.name) or isNotNull(gen_ai.tool.name)
| summarize spans = count(), name = takeFirst(entityName(dt.entity.service)), by: { svc = dt.entity.service }
| filter isNotNull(svc)
| sort spans desc
| limit 60
`.trim();

/**
 * Smartscape "calls" edges into the AI services (upstream callers) — services
 * that call an AI service, resolved to names. Proven join form from
 * useUpstreamServices. Returns nothing when there are no monitored callers.
 */
export const buildUpstreamEdgesQuery = (aiServiceIds: string[]): string => {
  if (aiServiceIds.length === 0) return "";
  // Return the AI-service entity ID (target_id), not its Smartscape name, so
  // the caller can map it to the SAME node label the co-occurrence query uses
  // (entityName) — otherwise upstream edges point at an orphan service node.
  return `
smartscapeEdges type:"calls"
| filter in(target_id, array(${dqlIdArray(aiServiceIds)}))
| join [ smartscapeNodes type:"SERVICE" | fields source_id = id, upstream = name ], kind: inner, on: { source_id }, prefix: "s."
| filter isNotNull(\`s.upstream\`)
| summarize n = count(), by: { upstream = \`s.upstream\`, target_id }
| sort n desc
| limit 60
`.trim();
};

/**
 * Smartscape "calls" edges OUT of the AI services (downstream dependencies) —
 * services an AI service calls (proxies, datastores, etc.), resolved to names.
 */
export const buildDownstreamEdgesQuery = (aiServiceIds: string[]): string => {
  if (aiServiceIds.length === 0) return "";
  // Return the AI-service entity ID (source_id) so the caller maps it to the
  // co-occurrence service node label (entityName), keeping the graph connected.
  return `
smartscapeEdges type:"calls"
| filter in(source_id, array(${dqlIdArray(aiServiceIds)}))
| join [ smartscapeNodes type:"SERVICE" | fields target_id = id, downstream = name ], kind: inner, on: { target_id }, prefix: "t."
| filter isNotNull(\`t.downstream\`)
| summarize n = count(), by: { downstream = \`t.downstream\`, source_id }
| sort n desc
| limit 60
`.trim();
};
