import { dqlTimeArg } from "../scope/queries";
import type { Timeframe } from "../scope/types";

/**
 * AWS Bedrock Guardrails metric keys (CloudWatch → Dynatrace aws-metric-poller).
 * Each carries the `.By.GuardrailArn.GuardrailVersion` dimension-set suffix and
 * the dimensions GuardrailArn / GuardrailVersion / aws.region / aws.account.id.
 * Validated on ualpre — see memory guardrails-data-model.
 */
const M = "cloud.aws.bedrock_guardrails";
export const AWS_GUARDRAIL_METRICS = {
  invocations: `${M}.Invocations.By.GuardrailArn.GuardrailVersion`,
  intervened: `${M}.InvocationsIntervened.By.GuardrailArn.GuardrailVersion`,
  latency: `${M}.InvocationLatency.By.GuardrailArn.GuardrailVersion`,
  textUnits: `${M}.TextUnitCount.By.GuardrailArn.GuardrailVersion`,
} as const;

const range = (t: Timeframe): string =>
  `from: ${dqlTimeArg(t.from)}, to: ${dqlTimeArg(t.to ?? "now()")}`;

/**
 * Per-guardrail rollup over the window — one row per GuardrailArn. No explicit
 * interval, so the platform buckets automatically and arraySum/arrayAvg collapse
 * the series to window totals (correct for any timeframe).
 */
export const buildGuardrailSummaryQuery = (timeframe: Timeframe): string =>
  `
timeseries {
    inv = sum(${AWS_GUARDRAIL_METRICS.invocations}),
    intervened = sum(${AWS_GUARDRAIL_METRICS.intervened}),
    latency = avg(${AWS_GUARDRAIL_METRICS.latency}),
    textUnits = sum(${AWS_GUARDRAIL_METRICS.textUnits})
  },
  by: {GuardrailArn, aws.region, aws.account.id}, ${range(timeframe)}
| fieldsAdd total_inv = arraySum(inv), total_intervened = arraySum(intervened), avg_latency = arrayAvg(latency), total_text = arraySum(textUnits)
| fieldsAdd intervention_rate = if(total_inv > 0, toDouble(total_intervened) / total_inv * 100, else: 0.0)
| fields GuardrailArn, region = aws.region, account = aws.account.id, total_inv, total_intervened, intervention_rate, avg_latency, total_text
| sort total_inv desc
| limit 200
`.trim();

/** Fleet-wide intervention trend — two summed series across the window; the
 *  per-bucket rate is derived client-side (perBucketRate) so empty buckets gap. */
export const buildGuardrailTrendQuery = (timeframe: Timeframe): string =>
  `
timeseries {
    inv = sum(${AWS_GUARDRAIL_METRICS.invocations}),
    intervened = sum(${AWS_GUARDRAIL_METRICS.intervened})
  }, ${range(timeframe)}
`.trim();
