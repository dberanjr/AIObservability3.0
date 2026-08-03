/**
 * Canned Demo Mode dataset for the Models page (main table/tiles/bubble chart
 * plus the merged-in FinOps deep-dives: daily cost, per-service breakdown,
 * and prompt-cache/reported-cost). Mirrors the Bedrock page's `demoData.ts`
 * design: rather than hand-typing each hook's *output*, this module builds
 * small "raw record" fixtures shaped exactly like what each real DQL query
 * returns, then lets `useModels`/`useFinOps`/`useCacheCost` run them through
 * their OWN aggregation code (the same loops real records flow through) —
 * so cost, blended-rate flags, and per-model sums are computed by the real
 * math, never hand-typed and risking drift from it.
 *
 * Single source of truth: `MODEL_SEEDS` below. Every exported demo dataset —
 * the main models table, the FinOps daily-cost chart, the per-service
 * breakdown, and the prompt-cache panel — is folded from these same 7
 * per-model totals, so a number for Claude Sonnet in the bubble chart, the
 * daily-cost bars, and the service treemap all trace back to one figure.
 *
 * The mix: 7 models across 4 providers (Anthropic + Amazon via Bedrock,
 * OpenAI, Google direct) and all 3 model types (generative, embedding,
 * reranking). One model — a Llama 3.1 70B Instruct id — is deliberately
 * absent from the pricing table (only the 8B and 405B variants are priced),
 * so the demo also exercises the blended/"estimated" fallback rate honestly,
 * same trick as the Bedrock demo's Llama 405B id.
 */

import type { ModelRecord } from "./useModels";
import type { DailyDayRecord, ServiceCostRecord } from "./useFinOps";
import type { CacheRecord } from "./useCacheCost";
import { costOf } from "../../data/pricing";

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

/** Splits `total` across `weights.length` buckets proportionally to `weights`
 *  (need not sum to 1), fixing integer-rounding drift onto the largest bucket
 *  so the parts sum back to exactly `total`. Mirrors bedrock/demoData.ts. */
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

// ---------------------------------------------------------------------------
// Per-model seed — the single source of truth every export below folds from.
// ---------------------------------------------------------------------------

type ModelKey =
  | "sonnet"
  | "haiku"
  | "gpt4o"
  | "geminiFlash"
  | "titanEmbed"
  | "rerank"
  | "llama70b";

interface ModelSeed {
  /** Raw gen_ai.request.model value, as it would actually appear on a span. */
  id: string;
  requests: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  avgMs: number;
  p95Ms: number;
  p99Ms: number;
  errorRatePct: number;
  timeoutRatePct: number;
  /** gen_ai.operation.name convention. */
  operation: string;
  /** gen_ai.provider.name convention ("bedrock" for AWS-fronted models). */
  system: string;
}

/** Realistic per-model totals over the demo window. Requests/tokens tuned so
 *  the fleet lands around ~20k requests, a >30x latency spread (embeddings
 *  fastest, Sonnet/Llama slowest), and a clear cost-tier spread once priced. */
const MODEL_SEEDS: Record<ModelKey, ModelSeed> = {
  sonnet: {
    id: "us.anthropic.claude-sonnet-4-6-20260114-v1:0",
    requests: 1800,
    avgInputTokens: 1250,
    avgOutputTokens: 640,
    avgMs: 1450,
    p95Ms: 2600,
    p99Ms: 3400,
    errorRatePct: 0.8,
    timeoutRatePct: 0.1,
    operation: "chat",
    system: "bedrock",
  },
  haiku: {
    id: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    requests: 4200,
    avgInputTokens: 900,
    avgOutputTokens: 380,
    avgMs: 520,
    p95Ms: 900,
    p99Ms: 1300,
    errorRatePct: 0.3,
    timeoutRatePct: 0.05,
    operation: "chat",
    system: "bedrock",
  },
  gpt4o: {
    id: "gpt-4o-2024-08-06",
    requests: 1500,
    avgInputTokens: 1400,
    avgOutputTokens: 700,
    avgMs: 1600,
    p95Ms: 2800,
    p99Ms: 3700,
    errorRatePct: 1.1,
    timeoutRatePct: 0.2,
    operation: "chat",
    system: "openai",
  },
  geminiFlash: {
    id: "gemini-2.5-flash-002",
    requests: 2600,
    avgInputTokens: 1000,
    avgOutputTokens: 420,
    avgMs: 430,
    p95Ms: 760,
    p99Ms: 1050,
    errorRatePct: 0.4,
    timeoutRatePct: 0.05,
    operation: "chat",
    system: "google",
  },
  titanEmbed: {
    id: "amazon.titan-embed-text-v2:0",
    requests: 9000,
    avgInputTokens: 180,
    avgOutputTokens: 0,
    avgMs: 45,
    p95Ms: 80,
    p99Ms: 120,
    errorRatePct: 0.05,
    timeoutRatePct: 0,
    operation: "embeddings",
    system: "bedrock",
  },
  rerank: {
    id: "cohere.rerank-v3-5:0",
    requests: 1200,
    avgInputTokens: 640,
    avgOutputTokens: 0,
    avgMs: 95,
    p95Ms: 160,
    p99Ms: 210,
    errorRatePct: 0.1,
    timeoutRatePct: 0,
    operation: "rerank",
    system: "bedrock",
  },
  // Deliberately absent from pricing.ts (only llama3-1-8b and llama3-1-405b
  // are priced) — exercises the blended/"estimated" fallback rate honestly.
  llama70b: {
    id: "meta.llama3-1-70b-instruct-v1:0",
    requests: 650,
    avgInputTokens: 1100,
    avgOutputTokens: 520,
    avgMs: 980,
    p95Ms: 1700,
    p99Ms: 2300,
    errorRatePct: 1.6,
    timeoutRatePct: 0.3,
    operation: "chat",
    system: "bedrock",
  },
};

const MODEL_KEYS = Object.keys(MODEL_SEEDS) as ModelKey[];

/** Hand-tuned 7-bucket fractional-deviation patterns (mean ≈ 0), one per
 *  model, so each model's daily-cost trend moves independently instead of 7
 *  identical copies of the same curve. Oldest → newest (index 0 = 6 days
 *  ago, matching `distribute()`'s bucket order; the daily-cost hook re-maps
 *  this to its own oldest→newest column order). */
const DAILY_VARIANCE: Record<ModelKey, number[]> = {
  sonnet: [-0.1, 0.08, -0.05, 0.12, -0.08, 0.05, -0.02],
  haiku: [0.06, -0.09, 0.04, -0.02, 0.1, -0.07, -0.02],
  gpt4o: [-0.05, 0.1, -0.08, 0.03, -0.04, 0.09, -0.05],
  geminiFlash: [0.08, -0.04, 0.06, -0.1, 0.02, 0.05, -0.07],
  titanEmbed: [-0.03, 0.05, -0.06, 0.08, -0.02, -0.04, 0.02],
  rerank: [0.04, -0.06, 0.02, 0.05, -0.08, 0.06, -0.03],
  llama70b: [-0.08, 0.03, 0.06, -0.04, 0.09, -0.05, -0.01],
};

/** Which AI services drive each model's traffic, and their share of it. Each
 *  model's shares sum to 1. Modeled after a small fleet: a customer-facing
 *  checkout assistant, an internal support copilot, a fraud-review agent, a
 *  RAG search ranker (embeddings + rerank), and a docs chatbot. */
const SERVICE_SHARE: Record<ModelKey, Record<string, number>> = {
  sonnet: {
    "checkout-assistant": 0.45,
    "support-copilot": 0.35,
    "fraud-review-agent": 0.2,
  },
  haiku: {
    "support-copilot": 0.55,
    "checkout-assistant": 0.3,
    "docs-chatbot": 0.15,
  },
  gpt4o: { "fraud-review-agent": 0.6, "checkout-assistant": 0.4 },
  geminiFlash: {
    "docs-chatbot": 0.5,
    "support-copilot": 0.3,
    "search-ranker": 0.2,
  },
  titanEmbed: { "search-ranker": 0.7, "docs-chatbot": 0.3 },
  rerank: { "search-ranker": 1 },
  llama70b: { "fraud-review-agent": 0.6, "checkout-assistant": 0.4 },
};

/** All service names appearing in {@link SERVICE_SHARE}, for reference. */
export const DEMO_SERVICES: string[] = [
  "checkout-assistant",
  "support-copilot",
  "fraud-review-agent",
  "search-ranker",
  "docs-chatbot",
];

// ---------------------------------------------------------------------------
// Main models table (useModels)
// ---------------------------------------------------------------------------

/** Raw per-model rows shaped exactly like `buildModelsQuery`'s result — fed
 *  through `useModels`' own aggregation/pricing loop, unchanged. */
export const DEMO_MODEL_RECORDS: ModelRecord[] = MODEL_KEYS.map((key) => {
  const m = MODEL_SEEDS[key];
  const errors = Math.round(m.requests * (m.errorRatePct / 100));
  const timeouts = Math.round(m.requests * (m.timeoutRatePct / 100));
  return {
    model: m.id,
    requests: m.requests,
    input_tokens: Math.round(m.requests * m.avgInputTokens),
    output_tokens: Math.round(m.requests * m.avgOutputTokens),
    avg_input_tokens: m.avgInputTokens,
    avg_output_tokens: m.avgOutputTokens,
    avg_ms: m.avgMs,
    p95_ms: m.p95Ms,
    p99_ms: m.p99Ms,
    errors,
    timeouts,
    has_status_code: m.requests,
    operation: m.operation,
    system: m.system,
    error_rate_pct: m.errorRatePct,
    timeout_rate_pct: m.timeoutRatePct,
  };
});

// ---------------------------------------------------------------------------
// Daily cost (useFinOps `daily`) — one array of per-model rows per day-offset,
// matching the per-day token query's one-scan-per-day result shape (see
// `finopsQueries.ts`, the per-day builder for the daily-cost bar).
// ---------------------------------------------------------------------------

const DAILY_DAYS = 7;

/** Index 0 = most recent 24h (dayOffset 0) … index 6 = 6 days ago, matching
 *  `useFinOps`'s `dailyResults[offset]` indexing exactly. */
export const DEMO_DAILY_RECORDS: DailyDayRecord[][] = Array.from(
  { length: DAILY_DAYS },
  (_, offset) =>
    MODEL_KEYS.map((key) => {
      const m = MODEL_SEEDS[key];
      const weights = weightsOf(DAILY_VARIANCE[key]);
      // distribute() returns oldest→newest; dayOffset 0 (newest) reads the
      // LAST bucket, dayOffset 6 (oldest) reads the FIRST.
      const inBuckets = distribute(m.requests * m.avgInputTokens, weights);
      const outBuckets = distribute(m.requests * m.avgOutputTokens, weights);
      const idx = DAILY_DAYS - 1 - offset;
      return {
        model: m.id,
        input_tokens: inBuckets[idx],
        output_tokens: outBuckets[idx],
      };
    }),
);

// ---------------------------------------------------------------------------
// Per-service breakdown (useFinOps `services`) — matching the (service,
// model) grouped result shape of the service-cost-breakdown query builder
// in `finopsQueries.ts`.
// ---------------------------------------------------------------------------

export const DEMO_SERVICE_COST_RECORDS: ServiceCostRecord[] = MODEL_KEYS.flatMap(
  (key) => {
    const m = MODEL_SEEDS[key];
    return Object.entries(SERVICE_SHARE[key]).map(([service, weight]) => ({
      service,
      model: m.id,
      input_tokens: Math.round(m.requests * m.avgInputTokens * weight),
      output_tokens: Math.round(m.requests * m.avgOutputTokens * weight),
      requests: Math.round(m.requests * weight),
    }));
  },
);

// ---------------------------------------------------------------------------
// Prompt cache & reported cost (useCacheCost) — a single flat summarize row
// over the broader AI-span population, folded from the SAME per-model totals.
// ---------------------------------------------------------------------------

const TOTAL_REQUESTS = sum(MODEL_KEYS.map((k) => MODEL_SEEDS[k].requests));
const TOTAL_INPUT_TOKENS = sum(
  DEMO_MODEL_RECORDS.map((r) => r.input_tokens ?? 0),
);
const TOTAL_OUTPUT_TOKENS = sum(
  DEMO_MODEL_RECORDS.map((r) => r.output_tokens ?? 0),
);

/** Target cache-hit rate for billable input (35% served from cache). */
const CACHE_HIT_RATE_TARGET = 0.35;
const CACHE_READ_TOKENS = Math.round(
  (TOTAL_INPUT_TOKENS * CACHE_HIT_RATE_TARGET) / (1 - CACHE_HIT_RATE_TARGET),
);
/** Cache writes are a smaller fraction — new prefixes being populated. */
const CACHE_WRITE_TOKENS = Math.round(CACHE_READ_TOKENS * 0.12);

/** Blended estimate across the whole fleet, via the SAME cost function every
 *  other cost figure on this page uses — so "SDK-reported" reads as a
 *  plausible, close-but-not-identical measurement of our own estimate. */
const FLEET_ESTIMATED_COST = sum(
  MODEL_KEYS.map((key) => {
    const m = MODEL_SEEDS[key];
    return costOf(m.requests * m.avgInputTokens, m.requests * m.avgOutputTokens, m.id);
  }),
);
const SDK_REPORTED_COST = FLEET_ESTIMATED_COST * 0.955;

/** Broader AI-span population also includes non-request spans (tool calls,
 *  retries), so span count runs a bit ahead of pure LLM-call requests. */
const TOTAL_SPANS = Math.round(TOTAL_REQUESTS * 1.15);

export const DEMO_CACHE_COST_RECORD: CacheRecord = {
  cache_read: CACHE_READ_TOKENS,
  cache_write: CACHE_WRITE_TOKENS,
  input: TOTAL_INPUT_TOKENS,
  output: TOTAL_OUTPUT_TOKENS,
  sdk_cost: SDK_REPORTED_COST,
  spans: TOTAL_SPANS,
};
