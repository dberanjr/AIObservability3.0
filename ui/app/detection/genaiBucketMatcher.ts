/**
 * The exact OpenPipeline `genai_spans` storage-rule matcher: a span counts as
 * an AI span if ANY of these attributes is present. Backtick-quoted because the
 * field names are dotted and some carry a numeric segment (e.g.
 * `gen_ai.prompt.0.role`). Validated on ualpre.
 *
 * Kept separate from `AI_SPAN_POPULATION` (a narrower heuristic used by the
 * capability probe): the bucket detector must use the authoritative storage
 * rule so its bucket census matches how OpenPipeline actually routes spans.
 */
export const GENAI_BUCKET_ATTRS = [
  "gen_ai.system",
  "gen_ai.provider.name",
  "gen_ai.operation.name",
  "gen_ai.request.model",
  "gen_ai.agent.name",
  "gen_ai.tool.name",
  "traceloop.span.kind",
  "traceloop.workflow.name",
  "llm.request.type",
  "gen_ai.prompt.0.role",
  "gen_ai.completion.0.role",
  "openinference.span.kind",
] as const;

export const GENAI_BUCKET_MATCHER = GENAI_BUCKET_ATTRS.map(
  (a) => "isNotNull(`" + a + "`)",
).join(" or ");
