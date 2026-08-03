/**
 * Pure fold functions for the Pulse-domain hooks Summary's hero KPIs and
 * tiles reuse (usePulseSummary, usePulseHealth, useDailySpend,
 * useTokenEfficiency, useProviderMix, useAgentCosts, useActivityHistogram).
 *
 * Kept in a SEPARATE module from the hooks (mirrors `ui/app/pages/Agents/parse.ts`)
 * so both the real query path (each hook calls these with live DQL rows) and
 * the Demo Mode path (`demoData.ts` calls these with small "raw record"
 * fixtures) share the exact same math, AND so this module stays free of
 * React / useScopedDql — pulling those in here would drag a DOM-dependent
 * transitive chain into the pure-function test runner (`vitest.config.ts`
 * runs `environment: "node"`, no `document`).
 */

import { toNum, fmtCountCompact } from "../../data/format";
import { costOf, isRetrievalModel } from "../../data/pricing";
import { canonicalizeModel, PROVIDER_COLOR, PROVIDER_DISPLAY, type ProviderId } from "../../detection/attributes";
import { extrapolatedSum, type ProviderRecord } from "./providerMix";
import { QUALITY_EVAL_SETUP_GUIDE, type Pillar, type PillarStatus, type PillarReason } from "./types";

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

/* ------------------------------- usePulseSummary ------------------------ */

export interface SummaryRecord {
  requests?: number;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  p95_ms?: number;
  error_rate_pct?: number;
  models?: number;
  mcp_servers?: number;
  mcp_tools?: number;
  token_efficiency_pct?: number;
}

export interface SeriesRecord {
  tokens?: (number | null)[] | null;
  p95_ns?: (number | null)[] | null;
  errors?: (number | null)[] | null;
  requests?: (number | null)[] | null;
  timeframe?: { start?: string; end?: string };
}

export interface McpCountRecord {
  mcp_servers?: number;
  mcp_tools?: number;
}

export interface PulseSummarySpark {
  tokens: number[];
  spend: number[];
  costPerReq: number[];
  p95Ms: number[];
  errorRatePct: number[];
  intervalSec: number;
  intervalLabel: string;
  labels: string[];
}

export interface PulseSummaryCore {
  tokens: number | null;
  requests: number | null;
  spend: number | null;
  costPerRequest: number | null;
  p95Ms: number | null;
  errorRatePct: number | null;
  models: number | null;
  mcpServers: number | null;
  mcpTools: number | null;
  tokenEfficiencyPct: number | null;
  spark: PulseSummarySpark;
}

const formatIntervalLabel = (sec: number): string => {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h`;
  return `${Math.round(sec / 86400)}d`;
};

/** Sampled counts/sums extrapolated back to the unsampled population by
 *  `samplingRatio`; returns `null` when the raw value is missing/non-finite. */
const extrapolate = (raw: unknown, samplingRatio: number): number | null => {
  const n = toNum(raw);
  return Number.isFinite(n) ? n * samplingRatio : null;
};
const extrapolateSeries = (arr: number[], samplingRatio: number): number[] =>
  arr.map((v) => v * samplingRatio);

/**
 * Pure fold: the summary + spark + MCP-count rows into a `PulseSummaryCore`.
 * Both `usePulseSummary` (real rows) and `demoData.ts` (canned rows) call
 * this — the ONLY place this math lives.
 */
export const computePulseSummaryCore = (
  row: SummaryRecord | undefined,
  sparkRow: SeriesRecord | undefined,
  mcpRow: McpCountRecord | undefined,
  samplingRatio: number,
  sparkIntervalSec: number,
): PulseSummaryCore => {
  // Counts and sums are sampled — extrapolate back to the unsampled
  // population. Ratios (error rate, token efficiency) and statistics
  // (percentiles, distinctCount) are sampling-invariant.
  const inTok = (row?.input_tokens ?? 0) * samplingRatio;
  const outTok = (row?.output_tokens ?? 0) * samplingRatio;
  const tokens = extrapolate(row?.total_tokens, samplingRatio);
  const requests = extrapolate(row?.requests, samplingRatio);

  const spend = costOf(inTok, outTok, null);

  // costPerRequest is invariant under sampling — spend and requests
  // are both scaled by samplingRatio, so the quotient cancels.
  const costPerRequest = requests && requests > 0 ? spend / requests : null;

  // Derive per-bucket spark series from the multi-series spark query.
  // tokens / errors / requests are count-or-sum aggregates (extrapolate
  // by samplingRatio); p95_ns / error-rate ratios are statistics
  // (sampling-invariant). Spend per bucket follows from the per-bucket
  // tokens via the same blended pricing as the headline.
  const toNumArr = (arr: unknown): number[] =>
    Array.isArray(arr)
      ? arr.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : 0))
      : [];
  const tokensSeries = extrapolateSeries(toNumArr(sparkRow?.tokens), samplingRatio);
  const p95NsSeries = toNumArr(sparkRow?.p95_ns);
  const errorsSeries = toNumArr(sparkRow?.errors);
  const requestsSeries = toNumArr(sparkRow?.requests);

  const spendSeries = tokensSeries.map((bucketTokens) =>
    costOf(bucketTokens / 2, bucketTokens / 2, null),
  );
  const p95MsSeries = p95NsSeries.map((ns) => (ns > 0 ? ns / 1_000_000 : 0));
  const errorRateSeries = requestsSeries.map((req, i) =>
    req > 0 ? (errorsSeries[i] / req) * 100 : 0,
  );
  // Cost per request per bucket. spendSeries is extrapolated (from
  // extrapolated tokens); requestsSeries is the raw sampled count, so scale
  // it by samplingRatio to keep the quotient sampling-invariant.
  const costPerReqSeries = spendSeries.map((bucketSpend, i) => {
    const reqs = requestsSeries[i] * samplingRatio;
    return reqs > 0 ? bucketSpend / reqs : 0;
  });

  // Per-bucket date+time labels for the sparkline cursor tooltip. The
  // last bucket lines up with "now"; earlier buckets step back by
  // intervalMs. Format compresses to HH:MM for short windows and
  // "MMM dd HH:MM" for multi-day windows.
  const len = Math.max(
    tokensSeries.length,
    p95NsSeries.length,
    errorsSeries.length,
    requestsSeries.length,
  );
  const intervalMs = sparkIntervalSec * 1000;
  const totalSpanMs = len * intervalMs;
  const multiDay = totalSpanMs >= 24 * 60 * 60 * 1000;
  const tsFmt = new Intl.DateTimeFormat(undefined, {
    ...(multiDay
      ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
      : { hour: "numeric", minute: "2-digit" }),
  });
  const nowMs = Date.now();
  const sparkLabels: string[] = [];
  for (let i = 0; i < len; i++) {
    const ts = nowMs - (len - 1 - i) * intervalMs;
    sparkLabels.push(tsFmt.format(new Date(ts)));
  }

  return {
    tokens,
    requests,
    spend: tokens ? spend : null,
    costPerRequest,
    p95Ms: row?.p95_ms ?? null,
    errorRatePct: row?.error_rate_pct ?? null,
    models: row?.models ?? null,
    // MCP counts come from a dedicated query that doesn't filter on
    // gen_ai.provider.name. Fall back to the legacy summary value if
    // the dedicated query hasn't returned yet.
    mcpServers: mcpRow?.mcp_servers ?? row?.mcp_servers ?? null,
    mcpTools: mcpRow?.mcp_tools ?? row?.mcp_tools ?? null,
    tokenEfficiencyPct: row?.token_efficiency_pct ?? null,
    spark: {
      tokens: tokensSeries,
      spend: spendSeries,
      costPerReq: costPerReqSeries,
      p95Ms: p95MsSeries,
      errorRatePct: errorRateSeries,
      intervalSec: sparkIntervalSec,
      intervalLabel: formatIntervalLabel(sparkIntervalSec),
      labels: sparkLabels,
    },
  };
};

/* ------------------------------- usePulseHealth -------------------------- */

export interface OperationalRecord {
  total?: number;
  errors?: number;
  p95_ms?: number;
  p50_ms?: number;
}

export interface QualityRecord {
  total?: number;
  with_eval?: number;
  avg_score?: number | null;
}

export interface CostRecord {
  requests?: number;
  input_tokens?: number;
  output_tokens?: number;
  distinct_models?: number;
}

export interface CostBaselineRecord {
  requests_7d?: number;
  input_tokens_7d?: number;
  output_tokens_7d?: number;
}

const HOURS_PER_WEEK = 24 * 7;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const round = (n: number): number => Math.round(n);

export const operationalPillar = (
  rec: OperationalRecord | undefined,
  samplingRatio: number,
): Pillar => {
  // Extrapolate count for the displayed span volume only — error rate and
  // p95 are sampling-invariant statistics computed at sample size.
  const total = num(rec?.total) * samplingRatio;
  if (!rec || total === 0) {
    return {
      key: "operational",
      label: "Operational",
      status: "no-data",
      score: null,
      reasons: [{ text: "No AI spans observed in the current scope." }],
    };
  }
  const p95 = num(rec.p95_ms);
  const rawTotal = num(rec.total);
  const errorRatePct = rawTotal > 0 ? (num(rec.errors) / rawTotal) * 100 : 0;
  const latencyPenalty = clamp((p95 - 2000) / 100, 0, 60);
  const errorPenalty = clamp(errorRatePct * 10, 0, 40);
  const score = clamp(round(100 - latencyPenalty - errorPenalty), 0, 100);
  const status: PillarStatus =
    score >= 80 ? "good" : score >= 50 ? "warning" : "critical";

  const reasons: PillarReason[] = [
    {
      text: `p95 latency ${p95.toFixed(0)} ms across ${fmtCountCompact(total)} spans`,
      intent: p95 > 4000 ? "critical" : p95 > 2000 ? "warning" : "info",
    },
    {
      text: `Error rate ${errorRatePct.toFixed(2)}%`,
      intent:
        errorRatePct > 5 ? "critical" : errorRatePct > 1 ? "warning" : "info",
    },
    {
      text: "Active problems · pending Dynatrace Intelligence wire-up",
    },
  ];
  return { key: "operational", label: "Operational", status, score, reasons };
};

export const qualityPillar = (
  rec: QualityRecord | undefined,
  samplingRatio: number,
): Pillar => {
  // Extrapolate display-only counts; coverage and avg_score are ratios/stats
  // that are sampling-invariant.
  const total = num(rec?.total) * samplingRatio;
  const withEval = num(rec?.with_eval) * samplingRatio;
  const setupCta = {
    label: "Setup eval pipeline",
    href: QUALITY_EVAL_SETUP_GUIDE,
  };

  if (total === 0) {
    return {
      key: "quality",
      label: "Quality",
      status: "no-data",
      score: null,
      reasons: [
        { text: "No LLM spans found in the current scope." },
        { text: "Quality scoring requires gen_ai.evaluation.* attributes." },
      ],
      cta: setupCta,
    };
  }

  if (withEval === 0) {
    return {
      key: "quality",
      label: "Quality",
      status: "no-data",
      score: null,
      reasons: [
        {
          text: `No gen_ai.evaluation.* attrs on ${fmtCountCompact(total)} LLM spans`,
          intent: "warning",
        },
        { text: "Add evaluation attrs to LLM spans or run an LLM-as-judge workflow." },
      ],
      cta: setupCta,
    };
  }

  const coverage = (withEval / total) * 100;
  const rawAvg = toNum(rec?.avg_score);
  const avgScore = Number.isFinite(rawAvg) ? rawAvg : null;
  const score = avgScore != null ? clamp(round(avgScore * 100), 0, 100) : null;
  const status: PillarStatus =
    score == null
      ? "no-data"
      : score >= 80
        ? "good"
        : score >= 60
          ? "warning"
          : "critical";

  return {
    key: "quality",
    label: "Quality",
    status,
    score,
    reasons: [
      {
        text: `Eval coverage ${coverage.toFixed(0)}% (${fmtCountCompact(withEval)} / ${fmtCountCompact(total)} spans)`,
      },
      ...(avgScore != null
        ? [{ text: `Avg evaluation score ${avgScore.toFixed(2)}` }]
        : []),
    ],
    cta: setupCta,
  };
};

export const costPillar = (
  current: CostRecord | undefined,
  baseline: CostBaselineRecord | undefined,
  scopeHours: number,
  samplingRatio: number,
): Pillar => {
  // Extrapolate sums/counts. distinct_models is a distinctCount aggregate —
  // sampling-invariant, do not multiply.
  const inputTokens = num(current?.input_tokens) * samplingRatio;
  const outputTokens = num(current?.output_tokens) * samplingRatio;
  const totalTokens = inputTokens + outputTokens;
  const requests = num(current?.requests) * samplingRatio;
  const distinctModels = num(current?.distinct_models);

  if (requests === 0 || totalTokens === 0) {
    return {
      key: "cost",
      label: "Cost",
      status: "no-data",
      score: null,
      reasons: [{ text: "No token usage observed in the current scope." }],
    };
  }

  // Both current and baseline are sampled at the same ratio so the ratio
  // (currentPerHour / baselinePerHour) is invariant. We still scale baseline
  // tokens for display consistency with totalTokens above.
  const baselineTokens =
    (num(baseline?.input_tokens_7d) + num(baseline?.output_tokens_7d)) *
    samplingRatio;
  const baselinePerHour = baselineTokens / HOURS_PER_WEEK;
  const currentPerHour = scopeHours > 0 ? totalTokens / scopeHours : totalTokens;
  const ratio = baselinePerHour > 0 ? currentPerHour / baselinePerHour : 1;

  const variancePenalty = clamp(Math.abs(ratio - 1) * 40, 0, 60);
  const score = clamp(round(100 - variancePenalty), 0, 100);
  const status: PillarStatus =
    ratio > 1.5 ? "critical" : ratio > 1.2 ? "warning" : "good";

  const reasons: PillarReason[] = [
    { text: `${fmtCountCompact(totalTokens)} tokens across ${fmtCountCompact(requests)} requests` },
    {
      text:
        baselinePerHour > 0
          ? `${ratio.toFixed(2)}× rolling 7d hourly baseline`
          : "7d baseline still warming up",
      intent: ratio > 1.5 ? "critical" : ratio > 1.2 ? "warning" : undefined,
    },
    {
      text: `${distinctModels} distinct models in scope`,
    },
  ];
  return { key: "cost", label: "Cost", status, score, reasons };
};

/* ------------------------------- useDailySpend ---------------------------- */

/** Days rendered in the daily cost bar (oldest → newest). */
const DAYS = 8;

export interface DayRec {
  model?: string;
  in_tok?: number;
  out_tok?: number;
}

export interface DailySpendCore {
  bars: number[];
  barLabels: string[];
  spend24h: number;
  spend7d: number;
  projected30d: number;
  delta24h: number | null;
  samplingRatio: number;
}

const dayLabel = (d: number): string => (d === 0 ? "Last 24h" : `${d}d ago`);

const dayCost = (recs: DayRec[] | undefined, effectiveRatio: number): number =>
  (recs ?? []).reduce(
    (acc, row) =>
      acc + costOf(num(row.in_tok) * effectiveRatio, num(row.out_tok) * effectiveRatio, row.model ?? null),
    0,
  );

/**
 * Pure fold: 8 per-day record arrays (index 0 = most recent 24h, matching the
 * real hook's per-day query order) into a `DailySpendCore`.
 */
export const computeDailySpend = (
  perDayRecords: (DayRec[] | undefined)[],
  effectiveRatio: number,
): DailySpendCore => {
  const totals = perDayRecords.map((recs) => dayCost(recs, effectiveRatio));
  const bars: number[] = [];
  const barLabels: string[] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    bars.push(totals[i]);
    barLabels.push(dayLabel(i));
  }

  const spend24h = totals[0] ?? 0;
  const spend7d = totals.slice(0, 7).reduce((a, b) => a + b, 0);
  const projected30d = spend7d > 0 ? (spend7d / 7) * 30 : 0;
  const prev = totals[1] ?? 0;
  const delta24h = prev > 0 ? ((spend24h - prev) / prev) * 100 : null;

  return {
    bars,
    barLabels,
    spend24h,
    spend7d,
    projected30d,
    delta24h,
    samplingRatio: effectiveRatio,
  };
};

/* ---------------------------- useTokenEfficiency -------------------------- */

/** Throughput benchmark: tokens/sec that maps to a full throughput factor. */
const TARGET_TPS = 60;
const W_LEVERAGE = 0.5;
const W_COMPLETION = 0.3;
const W_THROUGHPUT = 0.2;

export interface TokenEfficiencyRecord {
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  requests?: number;
  truncations?: number;
  eval_spans?: number;
  dur_s?: number;
}

export interface TokenEfficiencyCore {
  score: number | null;
  leverage: number;
  completionRate: number;
  tokensPerSec: number;
  outputPerDollar: number | null;
  inputTokensPerRequest: number;
  truncationRatePct: number;
  costPer1kOutput: number | null;
  hasEval: boolean;
}

export const computeTokenEfficiency = (
  records: TokenEfficiencyRecord[],
): TokenEfficiencyCore => {
  let input = 0;
  let output = 0;
  let requests = 0;
  let truncations = 0;
  let evalSpans = 0;
  let durS = 0;
  let cost = 0;
  for (const r of records) {
    // Token efficiency is a generation-quality metric. Embedding/rerank
    // models produce zero output tokens and would drag every ratio toward
    // zero, so exclude them entirely from this calculation.
    if (isRetrievalModel(r.model)) continue;
    const inTok = num(r.input_tokens);
    const outTok = num(r.output_tokens);
    input += inTok;
    output += outTok;
    requests += num(r.requests);
    truncations += num(r.truncations);
    evalSpans += num(r.eval_spans);
    durS += num(r.dur_s);
    // Ratios are scale-invariant, so sampling extrapolation isn't needed —
    // price the sampled tokens directly with the per-model rate.
    cost += costOf(inTok, outTok, r.model);
  }

  const totalTok = input + output;
  const leverage = totalTok > 0 ? output / totalTok : 0;
  const completionRate = requests > 0 ? 1 - truncations / requests : 1;
  const tokensPerSec = durS > 0 ? output / durS : 0;
  const throughputFactor = Math.min(1, tokensPerSec / TARGET_TPS);
  const hasData = requests > 0 && totalTok > 0;
  const score = hasData
    ? Math.round(
        100 *
          (W_LEVERAGE * leverage +
            W_COMPLETION * completionRate +
            W_THROUGHPUT * throughputFactor),
      )
    : null;

  return {
    score,
    leverage,
    completionRate,
    tokensPerSec,
    outputPerDollar: cost > 0 ? output / cost : null,
    inputTokensPerRequest: requests > 0 ? input / requests : 0,
    truncationRatePct: requests > 0 ? (truncations / requests) * 100 : 0,
    costPer1kOutput: output > 0 ? cost / (output / 1000) : null,
    hasEval: evalSpans > 0,
  };
};

/* ------------------------------ useProviderMix ---------------------------- */

export interface ProviderShare {
  provider: string;
  displayName: string;
  rawProviders: string[];
  requests: number;
  tokens: number;
  sharePct: number;
  color: string;
  isBedrockProxy: boolean;
}

export interface ProviderMixCore {
  shares: ProviderShare[];
  totalRequests: number;
  bedrockProxyCount: number;
}

const isKnownProvider = (p: string): p is ProviderId =>
  Boolean(Object.prototype.hasOwnProperty.call(PROVIDER_COLOR, p));

/** Distinct fallback palette for non-canonical providers (custom proxies,
 *  tenant-specific names). Mirrors `useProviderMix.ts`'s original constant. */
const FALLBACK_PALETTE = [
  "var(--pink)",
  "var(--blue-pale)",
  "var(--green-lime)",
  "var(--purple-dark)",
  "var(--red)",
  "var(--purple)",
] as const;

const prettifyUnknown = (provider: string): string =>
  provider
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");

export const computeProviderMix = (
  records: ProviderRecord[],
  samplingRatio: number,
): ProviderMixCore => {
  // Per-provider request counts and token sums need extrapolation. Shares
  // (sharePct) are ratios and unaffected, but the displayed center value
  // and the legend's per-provider request counts both need to reflect the
  // unsampled population.
  const totalRequests = extrapolatedSum(records, (r) => r.requests, samplingRatio);

  let bedrockProxyVolume = 0;
  let fallbackIdx = 0;
  const shares: ProviderShare[] = records
    .filter((r): r is Required<Pick<ProviderRecord, "provider">> & ProviderRecord =>
      typeof r.provider === "string" && r.provider.length > 0,
    )
    .map((r) => {
      const provider = r.provider.trim().toLowerCase();
      const requests = toNum(r.requests) * samplingRatio;
      const viaBedrock = toNum(r.via_bedrock_count) * samplingRatio;
      bedrockProxyVolume += viaBedrock;

      const known = isKnownProvider(provider);
      const color = known
        ? PROVIDER_COLOR[provider]
        : FALLBACK_PALETTE[fallbackIdx++ % FALLBACK_PALETTE.length];
      const display = known
        ? PROVIDER_DISPLAY[provider]
        : prettifyUnknown(provider);

      return {
        provider,
        displayName: display,
        rawProviders: (r.raw_providers ?? []).filter(
          (p): p is string => typeof p === "string" && p.length > 0,
        ),
        requests,
        tokens: toNum(r.tokens) * samplingRatio,
        sharePct: totalRequests > 0 ? (requests / totalRequests) * 100 : 0,
        color,
        // Bedrock-proxy flag: either the canonical key is aws-bedrock, or
        // every request for this provider arrived via the Bedrock proxy
        // (signal for the "via Bedrock proxy" sublabel).
        isBedrockProxy:
          provider === "aws-bedrock" ||
          (viaBedrock > 0 && viaBedrock === requests),
      };
    });

  const bedrockProxyCount = bedrockProxyVolume > 0
    ? shares.filter((s) => s.isBedrockProxy).length
    : 0;

  return { shares, totalRequests, bedrockProxyCount };
};

/* ------------------------------- useAgentCosts ---------------------------- */

export interface AgentTraceJoinRecord {
  agent?: string;
  models?: Array<string | null>;
  linked_traces?: number;
  input_tokens?: number;
  output_tokens?: number;
}

export interface AgentCost {
  agent: string;
  invocations: number;
  inputTokens: number;
  outputTokens: number;
  tokens: number;
  cost: number;
  models: string[];
}

export interface AgentCostsCore {
  rows: AgentCost[];
  totalCost: number;
}

export const computeAgentCosts = (
  records: AgentTraceJoinRecord[],
  samplingRatio: number,
): AgentCostsCore => {
  const byAgent = new Map<string, AgentCost>();
  for (const r of records) {
    if (!r.agent) continue;
    const rawModels = (r.models ?? []).filter(
      (m): m is string => typeof m === "string" && m.length > 0,
    );
    // Extrapolate token sums back to the unsampled population; cost derives
    // from the extrapolated figures, via the cache-aware cost model.
    const inTok = (r.input_tokens ?? 0) * samplingRatio;
    const outTok = (r.output_tokens ?? 0) * samplingRatio;
    const invocations = (r.linked_traces ?? 0) * samplingRatio;
    const cost = costOf(inTok, outTok, rawModels[0]);
    const models = Array.from(
      new Set(rawModels.map((m) => canonicalizeModel(m).label)),
    );
    byAgent.set(r.agent, {
      agent: r.agent,
      invocations,
      inputTokens: inTok,
      outputTokens: outTok,
      tokens: inTok + outTok,
      cost,
      models,
    });
  }
  const rows = Array.from(byAgent.values()).sort((a, b) => b.cost - a.cost);
  const totalCost = rows.reduce((acc, r) => acc + r.cost, 0);
  return { rows, totalCost };
};

/* --------------------------- useActivityHistogram -------------------------- */

export interface HistogramRecord {
  requests?: (number | null)[] | null;
}

export interface HistogramBucket {
  hour: number;
  requests: number;
}

export interface ActivityHistogramCore {
  buckets: HistogramBucket[];
  peakHour: number | null;
  peakRequests: number;
}

export const computeActivityHistogram = (
  row: HistogramRecord | undefined,
  samplingRatio: number,
): ActivityHistogramCore => {
  // Each bucket is a count() of requests — extrapolate every bucket.
  const series = (row?.requests ?? []).map((v) =>
    typeof v === "number" ? v * samplingRatio : 0,
  );
  // Pad or trim to 24 buckets.
  const buckets: HistogramBucket[] = Array.from(
    { length: 24 },
    (_, i) => ({ hour: i, requests: series[i] ?? 0 }),
  );

  let peakHour: number | null = null;
  let peakRequests = 0;
  for (const b of buckets) {
    if (b.requests > peakRequests) {
      peakRequests = b.requests;
      peakHour = b.hour;
    }
  }

  return { buckets, peakHour, peakRequests };
};
