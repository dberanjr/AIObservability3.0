/**
 * Canned Demo Mode dataset for the Runtime Observability & Cost & Usage
 * sub-tab (ported from the standalone AWSBedrockApp's `bedrock/demoData.ts`).
 *
 * Design: rather than hand-writing each hook's *output* shape directly, this
 * module builds small "raw record" fixtures shaped exactly like the DQL
 * result rows each real query returns, then runs them through the SAME
 * parse/fold functions (`parseOverview`, `parseAgentSessions`, `foldDailyCost`,
 * `parsePerfByModel`, `aggregatePerfSeries`, `parseAccountCost`, `parseFacets`,
 * `parseTpmByModel`, `parseLogDelivery`, `parseBands`, `parsePerModelSummary`)
 * that production data flows through. Three benefits: (1) every derived
 * number (cost, blended-rate flags, sort order, label grouping) is computed
 * by the real math instead of hand-typed and risking drift from it; (2) raw
 * model ids are grouped/labelled via this app's own `shortModelName` exactly
 * like real telemetry, never a hardcoded parallel label; (3) one small set of
 * per-model "totals" below is the single source of truth every hook's demo
 * constant is folded from, so cost/tokens/invocations/labels all stay
 * internally consistent with each other.
 *
 * The dataset: 3 AWS accounts, 5 models (4 priced in the rate card, one — a
 * Llama 3.1 405B Instruct id — deliberately absent from it, so the demo also
 * exercises the blended/"estimated" fallback badge honestly), ~14.5k
 * invocations, ~37M tokens, ~$234 estimated spend, ~40% cache-hit rate, an
 * 18-session agent leaderboard (two genuinely multi-model), spread over a
 * 14-bucket window with hand-tuned per-series variance so every chart shows
 * real-looking movement instead of a flat repeated value.
 */

import { foldDailyCost, foldErrorRateSpark, foldSessionsSpark, type BedrockDailyCostPoint } from "./series";
import type { BedrockCostSummary } from "./cost";
import {
  parseOverview,
  parseAgentSessions,
  parsePerfByModel,
  parseAccountCost,
  parseFacets,
  aggregatePerfSeries,
  type OverviewTotals,
  type AgentSessionRow,
  type PerfByModelRow,
  type AccountCostRow,
  type BedrockFacets,
  type BedrockPerfSeries,
} from "./parse";
import {
  parseTpmByModel,
  parseLogDelivery,
  parseBands,
  parsePerModelSummary,
  type TpmModelRow,
  type LogDelivery,
  type MetricBands,
  type PerModelSummaryRow,
} from "./runtimeMetrics";

// ---------------------------------------------------------------------------
// Shared bucket/variance helpers
// ---------------------------------------------------------------------------

const BUCKETS = 14;
const DAY_MS = 86_400_000;
const NOW_MS = Date.now();
const WINDOW_START_MS = NOW_MS - BUCKETS * DAY_MS;
/** `interval` is nanoseconds on real DQL records — a day-granularity window
 *  keeps every demo chart's x-axis reading as plain calendar dates. */
const DAY_INTERVAL_NS = DAY_MS * 1e6;
const demoTimeframe = (): { start: string; end: string } => ({
  start: new Date(WINDOW_START_MS).toISOString(),
  end: new Date(NOW_MS).toISOString(),
});

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

/** Splits `total` across `weights.length` buckets proportionally to `weights`
 *  (need not sum to 1), fixing integer-rounding drift onto the largest
 *  bucket so the parts sum back to exactly `total`. */
const distribute = (total: number, weights: number[]): number[] => {
  const wsum = sum(weights);
  const raw = weights.map((w) => (total * w) / wsum);
  const floored = raw.map((x) => Math.round(x));
  const drift = total - sum(floored);
  const peakIdx = floored.indexOf(Math.max(...floored));
  floored[peakIdx] += drift;
  return floored;
};

/** Positive per-bucket weights from a signed variance shape (mean ≈ 0). */
const weightsOf = (shape: number[]): number[] => shape.map((v) => 1 + v);

/** Bucketed series whose MAX equals `peak` (for `arrayMax`-folded metrics,
 *  e.g. `latencyMs`). */
const seriesWithPeak = (peak: number, shape: number[]): number[] => {
  const maxV = Math.max(...shape);
  const k = peak / (1 + maxV);
  return shape.map((v) => Math.round(k * (1 + v)));
};

/** Bucketed series whose AVERAGE equals `avg` (for `arrayAvg`-folded metrics,
 *  e.g. `ttftMs`). */
const seriesWithAvg = (avg: number, shape: number[]): number[] => {
  const mean = sum(shape) / shape.length;
  return shape.map((v) => Math.round(avg * (1 + (v - mean))));
};

/** Hand-tuned 14-bucket fractional-deviation patterns (mean ≈ 0), one per
 *  model plus one tenant-wide ("fleet") shape — so every model's trend moves
 *  independently instead of N identical copies of the same curve. */
const VARIANCE = {
  sonnet: [-0.10, 0.05, -0.05, 0.12, -0.08, 0.02, -0.15, 0.08, 0.15, 0.20, 0.00, -0.12, -0.06, 0.10],
  haiku: [0.05, -0.08, 0.10, -0.04, 0.14, -0.10, 0.02, 0.09, -0.06, 0.16, -0.02, 0.07, -0.11, 0.03],
  novaPro: [-0.06, 0.09, -0.12, 0.05, 0.11, -0.09, 0.15, -0.03, 0.07, -0.10, 0.12, -0.05, 0.02, 0.08],
  novaLite: [0.12, -0.05, 0.08, -0.11, 0.03, 0.10, -0.07, 0.14, -0.09, 0.01, 0.09, -0.13, 0.06, -0.02],
  llama: [-0.15, 0.20, -0.10, 0.06, -0.05, 0.11, -0.08, 0.02, 0.18, -0.12, 0.04, -0.06, 0.09, -0.01],
  fleet: [-0.08, 0.10, -0.04, 0.14, -0.06, 0.03, -0.12, 0.09, 0.16, -0.02, 0.11, -0.09, 0.05, -0.10],
} as const satisfies Record<string, number[]>;

// ---------------------------------------------------------------------------
// Accounts + models
// ---------------------------------------------------------------------------

/** Realistic 12-digit AWS account ids — real ModelInvocationLog `accountId`
 *  values look like this, not friendly names. */
export const DEMO_ACCOUNTS: string[] = ["111122223333", "444455556666", "777788889999"];
const ACCOUNT_SHARE: Record<string, number> = {
  "111122223333": 0.55,
  "444455556666": 0.3,
  "777788889999": 0.15,
};

/** Friendly connection names for the demo accounts (`useAccountNames`'s demo
 *  branch) — so Demo Mode also demonstrates the "Name (id)" account format,
 *  not just bare ids. */
export const DEMO_ACCOUNT_NAMES: Record<string, string> = {
  "111122223333": "prod-genai-platform",
  "444455556666": "staging-ml-workloads",
  "777788889999": "sandbox-experiments",
};

/** Raw Bedrock modelIds, as they'd actually appear in a ModelInvocationLog
 *  `modelId` field — region/inference-profile prefixed, dated, versioned.
 *  The Llama id is deliberately absent from the pricing tables so the demo
 *  also shows the blended/"estimated" fallback rate honestly. */
const MODEL_ID = {
  sonnet: "us.anthropic.claude-sonnet-4-5-20250219-v1:0",
  haiku: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
  novaPro: "amazon.nova-pro-v1:0",
  novaLite: "amazon.nova-lite-v1:0",
  llama: "meta.llama3-1-405b-instruct-v1:0",
} as const;

type ModelKey = keyof typeof MODEL_ID;
const MODEL_KEYS = Object.keys(MODEL_ID) as ModelKey[];

/** Per-model window totals — the single source of truth every hook's demo
 *  data is folded from. Tuned to land the whole tenant around ~14.5k
 *  invocations, ~37M tokens, ~$234 est. cost, ~40% cache-hit rate, and a >2x
 *  latency spread between the fastest and slowest model. */
const MODEL_TOTALS: Record<
  ModelKey,
  {
    invocations: number;
    inTok: number;
    outTok: number;
    cacheRead: number;
    cacheWrite: number;
    latencyMs: number;
    ttftMs: number;
    tpmPeak: number;
  }
> = {
  sonnet: { invocations: 2800, inTok: 5_400_000, outTok: 11_700_000, cacheRead: 3_600_000, cacheWrite: 450_000, latencyMs: 780, ttftMs: 320, tpmPeak: 185_000 },
  haiku: { invocations: 5200, inTok: 3_600_000, outTok: 5_400_000, cacheRead: 2_520_000, cacheWrite: 270_000, latencyMs: 560, ttftMs: 210, tpmPeak: 95_000 },
  novaPro: { invocations: 2300, inTok: 900_000, outTok: 360_000, cacheRead: 576_000, cacheWrite: 63_000, latencyMs: 460, ttftMs: 180, tpmPeak: 42_000 },
  novaLite: { invocations: 3600, inTok: 630_000, outTok: 252_000, cacheRead: 396_000, cacheWrite: 45_000, latencyMs: 380, ttftMs: 150, tpmPeak: 28_000 },
  llama: { invocations: 600, inTok: 450_000, outTok: 180_000, cacheRead: 270_000, cacheWrite: 32_000, latencyMs: 900, ttftMs: 390, tpmPeak: 61_000 },
};

const TOTAL_INVOCATIONS = sum(MODEL_KEYS.map((k) => MODEL_TOTALS[k].invocations));
const TOTAL_ERRORS = 205; // ~1.4% of invocations
const TOTAL_SESSIONS = 18;

// ---------------------------------------------------------------------------
// Overview (useBedrockOverview)
// ---------------------------------------------------------------------------

export const DEMO_OVERVIEW_TOTALS: OverviewTotals = parseOverview([
  {
    invocations: TOTAL_INVOCATIONS,
    inTok: sum(MODEL_KEYS.map((k) => MODEL_TOTALS[k].inTok)),
    outTok: sum(MODEL_KEYS.map((k) => MODEL_TOTALS[k].outTok)),
    cacheRead: sum(MODEL_KEYS.map((k) => MODEL_TOTALS[k].cacheRead)),
    cacheWrite: sum(MODEL_KEYS.map((k) => MODEL_TOTALS[k].cacheWrite)),
    accounts: DEMO_ACCOUNTS.length,
    models: MODEL_KEYS.length,
    sessions: TOTAL_SESSIONS,
    errors: TOTAL_ERRORS,
  },
]);

// ---------------------------------------------------------------------------
// Daily cost + summary (useBedrockCost), spark (useBedrockCostSpark)
// ---------------------------------------------------------------------------

const dailyCostRecords = MODEL_KEYS.map((key) => {
  const t = MODEL_TOTALS[key];
  const w = weightsOf(VARIANCE[key]);
  return {
    modelId: MODEL_ID[key],
    inTok: distribute(t.inTok, w),
    outTok: distribute(t.outTok, w),
    cacheRead: distribute(t.cacheRead, w),
    cacheWrite: distribute(t.cacheWrite, w),
    timeframe: demoTimeframe(),
    interval: DAY_INTERVAL_NS,
  };
});

const foldedDailyCost = foldDailyCost(dailyCostRecords);
export const DEMO_DAILY_COST: BedrockDailyCostPoint[] = foldedDailyCost.daily;
export const DEMO_COST_SUMMARY: BedrockCostSummary = foldedDailyCost.summary;

/** Same 14-bucket cadence as every other demo spark series (DEMO_PERF_SERIES,
 *  DEMO_ERROR_RATE_SPARK, DEMO_SESSIONS_SPARK below) — the real hooks all
 *  share one `pickChartIntervalSec` ladder now, so demo data mirrors that
 *  instead of a separately-split, finer-grained series. */
export const DEMO_COST_SPARK = {
  values: DEMO_DAILY_COST.map((d) => d.actual),
  labels: DEMO_DAILY_COST.map((d) => d.day),
};

/** Error-rate spark (useBedrockErrorRateSpark) — invocations and errors are
 *  distributed with DIFFERENT variance shapes (like DEMO_GUARDRAIL_TREND_RATE
 *  in guardrails/demoData.ts) so the per-bucket rate genuinely swings instead
 *  of tracking raw volume in lockstep. Sessions spark (useAgentSessionsSpark)
 *  — 18 sessions spread thinly across 14 buckets, same fleet shape as the
 *  daily-cost chart. */
export const DEMO_ERROR_RATE_SPARK = foldErrorRateSpark([
  {
    invocations: distribute(TOTAL_INVOCATIONS, weightsOf(VARIANCE.fleet)),
    errors: distribute(TOTAL_ERRORS, weightsOf(VARIANCE.llama)),
    timeframe: demoTimeframe(),
    interval: DAY_INTERVAL_NS,
  },
]);
export const DEMO_SESSIONS_SPARK = foldSessionsSpark([
  {
    sessions: distribute(TOTAL_SESSIONS, weightsOf(VARIANCE.novaPro)),
    timeframe: demoTimeframe(),
    interval: DAY_INTERVAL_NS,
  },
]);

// ---------------------------------------------------------------------------
// Per-account cost (useBedrockAccountCost)
// ---------------------------------------------------------------------------

const accountModelRecords = MODEL_KEYS.flatMap((key) => {
  const t = MODEL_TOTALS[key];
  return DEMO_ACCOUNTS.map((account) => ({
    account,
    modelId: MODEL_ID[key],
    inTok: Math.round(t.inTok * ACCOUNT_SHARE[account]),
    outTok: Math.round(t.outTok * ACCOUNT_SHARE[account]),
    cacheRead: Math.round(t.cacheRead * ACCOUNT_SHARE[account]),
    cacheWrite: Math.round(t.cacheWrite * ACCOUNT_SHARE[account]),
  }));
});
export const DEMO_ACCOUNT_COST_ROWS: AccountCostRow[] = parseAccountCost(accountModelRecords);

// ---------------------------------------------------------------------------
// Agent sessions (useAgentSessions)
// ---------------------------------------------------------------------------

/** Session identities + their per-model invocation SHARE (weights, not raw
 *  counts — actual counts come from `distribute()` against each model's
 *  total so the leaderboard reconciles with the model mix above). Modeled
 *  after the real field this feeds: the last path segment of an invocation
 *  identity ARN. */
const SESSION_PLAN: Record<ModelKey, { ids: string[]; accounts: string[]; weights: number[] }> = {
  sonnet: {
    ids: ["sess-4f2a91c3", "sess-9c7e21af", "sess-1d5b6e88", "sess-77af03d1"],
    accounts: ["111122223333", "111122223333", "444455556666", "777788889999"],
    weights: [0.34, 0.29, 0.23, 0.14],
  },
  haiku: {
    ids: ["sess-b3e64a02", "sess-2f9d17c5", "sess-88a1e4f0", "sess-5c3b90de", "sess-e17f2a63"],
    accounts: ["111122223333", "111122223333", "444455556666", "444455556666", "777788889999"],
    weights: [0.27, 0.22, 0.19, 0.17, 0.15],
  },
  novaPro: {
    ids: ["sess-a04d8b71", "sess-6e2c19f4", "sess-3b8a5d02"],
    accounts: ["111122223333", "444455556666", "111122223333"],
    weights: [0.43, 0.33, 0.24],
  },
  novaLite: {
    ids: ["sess-f91c2e07", "sess-0d6b4a9e", "sess-c72f1b83", "sess-4a9e6d15"],
    accounts: ["111122223333", "111122223333", "444455556666", "777788889999"],
    weights: [0.33, 0.28, 0.22, 0.17],
  },
  llama: {
    ids: ["sess-d81a3f52", "sess-2c5e97b0"],
    accounts: ["111122223333", "444455556666"],
    weights: [0.63, 0.37],
  },
};

const MODEL_ERROR_SHARE = distribute(
  TOTAL_ERRORS,
  MODEL_KEYS.map((k) => MODEL_TOTALS[k].invocations),
);

const sessionRecords = MODEL_KEYS.flatMap((key, modelIdx) => {
  const t = MODEL_TOTALS[key];
  const plan = SESSION_PLAN[key];
  const invocations = distribute(t.invocations, plan.weights);
  const inTok = distribute(t.inTok, plan.weights);
  const outTok = distribute(t.outTok, plan.weights);
  const cacheRead = distribute(t.cacheRead, plan.weights);
  const cacheWrite = distribute(t.cacheWrite, plan.weights);
  const errors = distribute(MODEL_ERROR_SHARE[modelIdx], plan.weights);
  return plan.ids.map((session, i) => ({
    session,
    account: plan.accounts[i],
    modelId: MODEL_ID[key],
    invocations: invocations[i],
    inTok: inTok[i],
    outTok: outTok[i],
    cacheRead: cacheRead[i],
    cacheWrite: cacheWrite[i],
    errors: errors[i],
  }));
});

/** Two genuinely multi-model agent sessions — a small secondary-model slice
 *  bolted onto an existing primary-model session (e.g. a planning call that
 *  hands off a tool-use step to a cheaper model) — so the leaderboard's "+N"
 *  model-chip path and the multi-model cost-per-row join both render for
 *  real, not just in theory. */
const multiModelBonusRecords = [
  {
    session: "sess-4f2a91c3",
    account: "111122223333",
    modelId: MODEL_ID.novaLite,
    invocations: 140,
    inTok: 14_000,
    outTok: 5_600,
    cacheRead: 8_000,
    cacheWrite: 1_000,
    errors: 2,
  },
  {
    session: "sess-b3e64a02",
    account: "111122223333",
    modelId: MODEL_ID.novaPro,
    invocations: 210,
    inTok: 30_000,
    outTok: 11_000,
    cacheRead: 16_000,
    cacheWrite: 2_000,
    errors: 3,
  },
];

export const DEMO_AGENT_SESSION_ROWS: AgentSessionRow[] = parseAgentSessions([
  ...sessionRecords,
  ...multiModelBonusRecords,
]);

// ---------------------------------------------------------------------------
// Per-model perf (useBedrockPerf) — metric-sourced rows + cross-model series
// ---------------------------------------------------------------------------

const perfRecords = MODEL_KEYS.map((key) => {
  const t = MODEL_TOTALS[key];
  const shape = VARIANCE[key];
  const w = weightsOf(shape);
  return {
    ModelId: MODEL_ID[key],
    latencyMs: seriesWithPeak(t.latencyMs, shape),
    ttftMs: seriesWithAvg(t.ttftMs, shape),
    invocations: distribute(t.invocations, w),
    inTok: distribute(t.inTok, w),
    outTok: distribute(t.outTok, w),
  };
});

const tpmSeriesRecords = MODEL_KEYS.map((key) => ({
  ModelId: MODEL_ID[key],
  tpm: seriesWithPeak(MODEL_TOTALS[key].tpmPeak, VARIANCE[key]),
}));

export const DEMO_PERF_ROWS: PerfByModelRow[] = parsePerfByModel(perfRecords);
export const DEMO_PERF_SERIES: BedrockPerfSeries = aggregatePerfSeries(perfRecords, tpmSeriesRecords);
export const DEMO_TPM_PEAK_PCT: number = Math.max(...tpmSeriesRecords.flatMap((r) => r.tpm));

// ---------------------------------------------------------------------------
// Facets (useBedrockFacets) — Account/Model picker option lists
// ---------------------------------------------------------------------------

export const DEMO_FACETS: BedrockFacets = parseFacets([
  {
    accounts: [...DEMO_ACCOUNTS],
    models: MODEL_KEYS.map((k) => MODEL_ID[k]),
  },
]);

// ---------------------------------------------------------------------------
// Runtime 2.0 metrics (useRuntimeMetrics.ts hooks)
// ---------------------------------------------------------------------------

/** Peak TPM by model (`useTpmByModel`) — Sonnet's peak sits clearly above
 *  every other model's, a realistic "worth flagging" TPM-headroom example. */
const tpmByModelRecords = MODEL_KEYS.map((key) => ({
  ModelId: MODEL_ID[key],
  peak: MODEL_TOTALS[key].tpmPeak,
}));
export const DEMO_TPM_BY_MODEL: TpmModelRow[] = parseTpmByModel(tpmByModelRecords);

/** CloudWatch log-delivery health (`useLogDelivery`) — slightly above total
 *  invocations (delivery events aren't 1:1 with invocations in practice). */
const DELIVERED_TOTAL = Math.round(TOTAL_INVOCATIONS * 1.02);
export const DEMO_LOG_DELIVERY: LogDelivery = parseLogDelivery([
  {
    delivered: distribute(DELIVERED_TOTAL, weightsOf(VARIANCE.fleet)),
    timeframe: demoTimeframe(),
    interval: DAY_INTERVAL_NS,
  },
]);

/** Tenant-wide latency / TTFT min-avg-max bands (`useLatencyBands`). */
const bandSeries = (avg: number, shape: number[], spikeIdx: number): { min: number[]; avg: number[]; max: number[] } => {
  const avgArr = seriesWithAvg(avg, shape);
  return {
    min: avgArr.map((v) => Math.round(v * 0.58)),
    avg: avgArr,
    max: avgArr.map((v, i) => Math.round(v * (i === spikeIdx ? 2.3 : 1.85))),
  };
};

const latencyBand = bandSeries(950, VARIANCE.fleet, 9);
export const DEMO_LATENCY_BANDS: MetricBands = parseBands([
  {
    min_ms: latencyBand.min,
    avg_ms: latencyBand.avg,
    max_ms: latencyBand.max,
    timeframe: demoTimeframe(),
    interval: DAY_INTERVAL_NS,
  },
]);

const ttftBand = bandSeries(260, VARIANCE.fleet, 9);
export const DEMO_TTFT_BANDS: MetricBands = parseBands([
  {
    min_ms: ttftBand.min,
    avg_ms: ttftBand.avg,
    max_ms: ttftBand.max,
    timeframe: demoTimeframe(),
    interval: DAY_INTERVAL_NS,
  },
]);

/** Per-model summary table (usePerModelSummary) — already-folded scalar sums
 *  per model, mirroring the arraySum/arrayAvg fold the real query produces
 *  server-side. */
const perModelSummaryRecords = MODEL_KEYS.map((key) => {
  const t = MODEL_TOTALS[key];
  return {
    ModelId: MODEL_ID[key],
    invocations: t.invocations,
    inTok: t.inTok,
    outTok: t.outTok,
    cacheRead: t.cacheRead,
    cacheWrite: t.cacheWrite,
    latencyMs: t.latencyMs,
    ttftMs: t.ttftMs,
  };
});
export const DEMO_PER_MODEL_SUMMARY: PerModelSummaryRow[] = parsePerModelSummary(perModelSummaryRecords);
