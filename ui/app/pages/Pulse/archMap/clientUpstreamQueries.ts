/**
 * Queries for the Client tier of the architecture map. The "client" is the set
 * of monitored services that CALL the in-scope AI services — read from
 * Smartscape `calls` topology (parent.service.name isn't emitted on spans),
 * then enriched with RED metrics + a throughput timeseries from their own spans.
 *
 * The RED / series queries filter by the upstream entity IDs directly (not the
 * AI scope), so they run via a plain useDql — injecting the AI scope filter
 * would exclude these caller services entirely.
 */
import { dqlIdArray, dqlTimeArg } from "../../../scope/queries";
import type { Timeframe } from "../../../scope/types";

const to = (tf: Timeframe): string => tf.to ?? "now()";

/** Upstream caller services (id + name) for the given AI service entity IDs. */
export const buildClientUpstreamQuery = (aiServiceIds: string[]): string => {
  if (aiServiceIds.length === 0) return "";
  // NB: smartscapeEdges target_id is a *smartscape-id* type, not a string, so
  // in(target_id, array("SERVICE-…")) silently never matches (0 rows). Coerce
  // with toString() — otherwise the Client tier has no upstream callers.
  return `
smartscapeEdges type:"calls"
| filter in(toString(target_id), array(${dqlIdArray(aiServiceIds)}))
| join [ smartscapeNodes type:"SERVICE" | fields source_id = id, upstream = name ], kind: inner, on: { source_id }, prefix: "s."
| summarize aiServices = countDistinct(target_id), by: { upstreamId = source_id, upstream = \`s.upstream\` }
| sort aiServices desc
| limit 25
`.trim();
};

/** RED metrics (requests / errors / p90) per upstream service, keyed by id. */
export const buildUpstreamRedQuery = (
  upstreamIds: string[],
  timeframe: Timeframe,
): string => {
  if (upstreamIds.length === 0) return "";
  return `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}
| filter in(dt.entity.service, array(${dqlIdArray(upstreamIds)}))
| fieldsAdd is_err = if(lower(toString(span.status_code)) == "error", 1, else: 0)
| summarize
    requests = count(),
    errors = sum(is_err),
    p90ns = percentile(duration, 90),
    p95ns = percentile(duration, 95),
    by: { svcId = dt.entity.service, svc = entityName(dt.entity.service) }
| sort requests desc
| limit 25
`.trim();
};

/** Per-upstream throughput timeseries for the drawer mini-charts, keyed by id. */
export const buildUpstreamSeriesQuery = (
  upstreamIds: string[],
  timeframe: Timeframe,
): string => {
  if (upstreamIds.length === 0) return "";
  return `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}
| filter in(dt.entity.service, array(${dqlIdArray(upstreamIds)}))
| makeTimeseries throughput = count(), by: { svcId = dt.entity.service }
`.trim();
};
