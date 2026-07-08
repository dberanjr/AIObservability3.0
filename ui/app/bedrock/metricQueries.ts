import type { Timeframe } from "../scope/types";

const K = (name: string) => `\`cloud.aws.bedrock.${name}.By.ModelId\``;

/** Per-model latency/TTFT/invocations/tokens. `rollup: avg` lets the percentile
 *  fall back to average where the ingested statistic has no percentile (see spec
 *  §3.2 caveat). */
export const buildBedrockPerfByModelQuery = (tf: Timeframe): string =>
  `timeseries {
    latencyMs = avg(${K("InvocationLatency")}),
    ttftMs = avg(${K("TimeToFirstToken")}),
    invocations = sum(${K("Invocations")}),
    inTok = sum(${K("InputTokenCount")}),
    outTok = sum(${K("OutputTokenCount")})
  }, from: ${tf.from}, to: ${tf.to ?? "now()"}, by: { ModelId }`;

export const buildBedrockTpmQuery = (tf: Timeframe): string =>
  `timeseries tpm = avg(${K("EstimatedTPMQuotaUsage")}), from: ${tf.from}, to: ${tf.to ?? "now()"}, by: { ModelId }`;
