import { dqlIdArray, dqlTimeArg } from "../../../scope/queries";
import type { Timeframe } from "../../../scope/types";

const to = (tf: Timeframe): string => tf.to ?? "now()";

/** Caller→AI-service edge PAIRS (not counts) for drawing the flow. Smartscape
 *  target_id is a smartscape-id type — filter via toString(). */
export const buildUpstreamEdgePairsQuery = (aiServiceIds: string[]): string => {
  if (aiServiceIds.length === 0) return "";
  return `
smartscapeEdges type:"calls"
| filter in(toString(target_id), array(${dqlIdArray(aiServiceIds)}))
| join [ smartscapeNodes type:"SERVICE" | fields source_id = id, upstream = name ], kind: inner, on: { source_id }, prefix: "s."
| join [ smartscapeNodes type:"SERVICE" | fields target_id = id, target_name = name ], kind: inner, on: { target_id }, prefix: "t."
| fields upstreamId = toString(source_id), upstream = \`s.upstream\`, aiServiceId = toString(target_id), aiService = \`t.target_name\`
| limit 500
`.trim();
};

/** Per-caller P90 latency timeseries for the multi-line chart. */
export const buildUpstreamP90SeriesQuery = (
  upstreamIds: string[],
  timeframe: Timeframe,
): string => {
  if (upstreamIds.length === 0) return "";
  return `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}
| filter in(dt.entity.service, array(${dqlIdArray(upstreamIds)}))
| makeTimeseries p90ns = percentile(duration, 90), by: { svcId = dt.entity.service }
`.trim();
};

/** Per-AI-service component rollup: distinct agents / tools / models. */
export const buildServiceComponentsQuery = (
  aiServiceIds: string[],
  timeframe: Timeframe,
): string => {
  if (aiServiceIds.length === 0) return "";
  return `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${dqlTimeArg(to(timeframe))}
| filter in(dt.entity.service, array(${dqlIdArray(aiServiceIds)}))
| filter isNotNull(gen_ai.request.model) or isNotNull(gen_ai.agent.name) or isNotNull(gen_ai.tool.name)
| summarize
    agents = collectDistinct(gen_ai.agent.name),
    tools = collectDistinct(gen_ai.tool.name),
    models = collectDistinct(gen_ai.request.model),
    by: { svcId = dt.entity.service }
| limit 200
`.trim();
};
