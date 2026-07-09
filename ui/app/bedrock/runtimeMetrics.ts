import type { BedrockScope } from "./types";
import { toNum } from "../data/format";
import { shortModelName } from "./model";

/**
 * Runtime Observability 2.0 metric builders — the three signals the original
 * Bedrock page lacked (per-model TPM quota pressure, CloudWatch log-delivery
 * health, latency/TTFT min·avg·max bands) plus the per-model summary table.
 * All read `cloud.aws.bedrock.*` CloudWatch metrics. Validated against
 * fifththird-preprod over 7 days.
 *
 * Scope: these apply the ACCOUNT filter (`aws.account.id` — the ids match the
 * log-sourced zones) but deliberately NOT the model filter — the metric
 * `ModelId` dimension vocabulary differs from the log `modelId` values the D6
 * Model selector emits, so filtering metrics by a log modelId would zero the
 * result. (Same metric-vs-log gap the existing PerfZone documents.)
 */

const K = (name: string): string => `\`cloud.aws.bedrock.${name}.By.ModelId\``;
const M = (name: string): string => `\`cloud.aws.bedrock.${name}\``;

const acctFilter = (s: BedrockScope): string =>
  s.accounts.length
    ? `, filter: { in(aws.account.id, ${s.accounts.map((a) => `"${a}"`).join(", ")}) }`
    : "";
const range = (s: BedrockScope): string =>
  `from: ${s.timeframe.from}, to: ${s.timeframe.to ?? "now()"}`;

/** Peak estimated TPM-quota usage per model (absolute tokens/min — NOT a %,
 *  since the per-model quota ceiling isn't in telemetry). */
export const buildTpmByModelQuery = (s: BedrockScope): string =>
  `timeseries tpm = max(${K("EstimatedTPMQuotaUsage")}), ${range(s)}, by: { ModelId }${acctFilter(s)}
| fieldsAdd peak = arrayMax(tpm)
| filter isNotNull(peak) and peak > 0
| fields ModelId, peak
| sort peak desc`;

/** CloudWatch model-invocation-log delivery success — total + sparkline. */
export const buildLogDeliveryQuery = (s: BedrockScope): string =>
  // eslint-disable-next-line noSecrets/no-secrets -- public AWS CloudWatch metric name, not a secret
  `timeseries delivered = sum(${M("ModelInvocationLogsCloudWatchDeliverySuccess")}), ${range(s)}${acctFilter(s)}`;

/** Invocation-latency min/avg/max bands over time (tenant-wide). */
export const buildLatencyBandsQuery = (s: BedrockScope): string =>
  `timeseries {
    min_ms = min(${K("InvocationLatency")}),
    avg_ms = avg(${K("InvocationLatency")}),
    max_ms = max(${K("InvocationLatency")})
  }, ${range(s)}${acctFilter(s)}`;

/** Time-to-first-token min/avg/max bands over time (tenant-wide). */
export const buildTtftBandsQuery = (s: BedrockScope): string =>
  `timeseries {
    min_ms = min(${K("TimeToFirstToken")}),
    avg_ms = avg(${K("TimeToFirstToken")}),
    max_ms = max(${K("TimeToFirstToken")})
  }, ${range(s)}${acctFilter(s)}`;

/** Per-model summary: throughput, tokens, cache and latency in one table. */
export const buildPerModelSummaryQuery = (s: BedrockScope): string =>
  `timeseries {
    invocations   = sum(${K("Invocations")}),
    input_tokens  = sum(${K("InputTokenCount")}),
    output_tokens = sum(${K("OutputTokenCount")}),
    cache_read    = sum(${K("CacheReadInputTokenCount")}),
    cache_write   = sum(${K("CacheWriteInputTokenCount")}),
    latency       = avg(${K("InvocationLatency")}),
    ttft          = avg(${K("TimeToFirstToken")})
  }, ${range(s)}, by: { ModelId }${acctFilter(s)}
| fieldsAdd
    invocations   = arraySum(invocations),
    inTok         = arraySum(input_tokens),
    outTok        = arraySum(output_tokens),
    cacheRead     = arraySum(cache_read),
    cacheWrite    = arraySum(cache_write),
    latencyMs     = arrayAvg(latency),
    ttftMs        = arrayAvg(ttft)
| fields ModelId, invocations, inTok, outTok, cacheRead, cacheWrite, latencyMs, ttftMs
| sort invocations desc`;

// --- parsing -----------------------------------------------------------------

type Rec = Record<string, unknown>;
const num = (v: unknown): number => {
  const x = toNum(v);
  return Number.isFinite(x) ? x : 0;
};
const arr = (v: unknown): number[] =>
  Array.isArray(v) ? v.map((x) => (x == null ? 0 : num(x))) : [];

export interface TpmModelRow {
  model: string;
  rawModel: string;
  peak: number;
}

export const parseTpmByModel = (records: Rec[]): TpmModelRow[] =>
  records
    .map((r) => ({
      rawModel: typeof r.ModelId === "string" ? r.ModelId : "",
      model: shortModelName(typeof r.ModelId === "string" ? r.ModelId : ""),
      peak: num(r.peak),
    }))
    .filter((r) => r.rawModel !== "" && r.peak > 0);

export interface LogDelivery {
  total: number;
  values: number[];
  /** Per-bucket time labels ("M/D" for day+ buckets, "M/D HH:MM" sub-day). */
  labels: string[];
}

export const parseLogDelivery = (records: Rec[]): LogDelivery => {
  const r = records[0] ?? {};
  const values = arr(r.delivered);
  const tf = r.timeframe as TimeframeLike | undefined;
  const startMs = tf?.start != null ? Date.parse(String(tf.start)) : NaN;
  const intervalMs = r.interval != null ? Number(r.interval) / 1e6 : NaN;
  const hasAxis = Number.isFinite(startMs) && Number.isFinite(intervalMs);
  const labels = values.map((_, i) =>
    hasAxis ? bucketLabel(startMs + i * intervalMs, intervalMs) : String(i),
  );
  return { total: values.reduce((s, v) => s + v, 0), values, labels };
};

export interface MetricBands {
  min: number[];
  avg: number[];
  max: number[];
  /** Per-bucket time labels ("M/D" for day+ buckets, "M/D HH:MM" for sub-day),
   *  derived from the record's timeframe + interval envelope. */
  labels: string[];
}

interface TimeframeLike {
  start?: string;
}

const bucketLabel = (ms: number, intervalMs: number): string => {
  const d = new Date(ms);
  const md = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  if (intervalMs >= 86_400_000) return md;
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${md} ${hh}:${mm}`;
};

export const parseBands = (records: Rec[]): MetricBands => {
  const r = records[0] ?? {};
  const min = arr(r.min_ms);
  const avg = arr(r.avg_ms);
  const max = arr(r.max_ms);
  const count = Math.max(min.length, avg.length, max.length);
  const tf = r.timeframe as TimeframeLike | undefined;
  const startMs = tf?.start != null ? Date.parse(String(tf.start)) : NaN;
  const intervalMs = r.interval != null ? Number(r.interval) / 1e6 : NaN;
  const hasAxis = Number.isFinite(startMs) && Number.isFinite(intervalMs);
  const labels = Array.from({ length: count }, (_, i) =>
    hasAxis ? bucketLabel(startMs + i * intervalMs, intervalMs) : String(i),
  );
  return { min, avg, max, labels };
};

export interface PerModelSummaryRow {
  model: string;
  rawModel: string;
  invocations: number;
  inTok: number;
  outTok: number;
  cacheRead: number;
  cacheWrite: number;
  latencyMs: number;
  ttftMs: number;
}

export const parsePerModelSummary = (records: Rec[]): PerModelSummaryRow[] =>
  records
    .map((r) => ({
      rawModel: typeof r.ModelId === "string" ? r.ModelId : "",
      model: shortModelName(typeof r.ModelId === "string" ? r.ModelId : ""),
      invocations: num(r.invocations),
      inTok: num(r.inTok),
      outTok: num(r.outTok),
      cacheRead: num(r.cacheRead),
      cacheWrite: num(r.cacheWrite),
      latencyMs: num(r.latencyMs),
      ttftMs: num(r.ttftMs),
    }))
    .filter((r) => r.rawModel !== "");
