/**
 * Canned Demo Mode dataset for the Pulse-domain hooks Summary's hero KPIs and
 * tiles reuse: usePulseSummary, usePulseHealth, useDailySpend,
 * useTokenEfficiency, useProviderMix, useAgentCosts, useActivityHistogram.
 * (`useAnomalies` has its own `anomalies/demoData.ts` — see that file's doc
 * comment for why it's hand-authored `Anomaly` objects instead.)
 *
 * Mirrors `ui/app/bedrock/demoData.ts`: small "raw record" fixtures shaped
 * exactly like each real DQL query's result rows, run through the SAME
 * `compute*` fold every hook calls (now factored into `./parse`, kept out of
 * the hook files themselves so this module doesn't create a circular import
 * — hook → demoData would be fine, but demoData → hook → demoData is not).
 * One small set of per-model "totals" is the single source of truth every
 * hook's demo constant is folded from, so cost/tokens/requests stay
 * internally consistent across every tile Summary and Pulse pull from this
 * domain.
 *
 * The dataset: 5 models across 4 providers (Anthropic via Bedrock proxy,
 * native AWS Bedrock/Amazon Nova, OpenAI, Google), ~18.4k requests, ~12.6M
 * tokens, a ~0.76% error rate, 5 agents with attributed cost, and a
 * business-hours-shaped 24-bucket activity curve.
 */

import { sum, distribute, weightsOf, seriesWithAvg } from "../../data/demoSeed";
import {
  computePulseSummaryCore,
  operationalPillar,
  qualityPillar,
  costPillar,
  computeDailySpend,
  computeTokenEfficiency,
  computeProviderMix,
  computeAgentCosts,
  computeActivityHistogram,
  type PulseSummaryCore,
} from "./parse";
import type { Pillar } from "./types";

/** Hand-tuned 24-bucket fractional-deviation shape (mean ≈ 0) — a mild
 *  business-hours wave so every per-bucket series shows real movement. */
const FLEET_SHAPE = [
  -0.30, -0.34, -0.28, -0.20, -0.10, 0.05, 0.18, 0.30, 0.38, 0.32, 0.24, 0.14,
  0.06, -0.02, 0.10, 0.22, 0.34, 0.40, 0.28, 0.14, 0.02, -0.12, -0.22, -0.28,
];

/** Raw Bedrock/direct model ids, as they'd appear on `gen_ai.request.model` —
 *  one Anthropic model fully routed via the Bedrock proxy (so the provider-mix
 *  "Bedrock proxy" sublabel exercises honestly), one native Bedrock (Amazon
 *  Nova), one OpenAI, one Google. */
const MODEL_ID = {
  sonnet: "us.anthropic.claude-sonnet-4-6-20260114-v1:0",
  haiku: "claude-haiku-4-5",
  gpt4o: "gpt-4o-2024-08-06",
  gemini: "gemini-2-5-flash",
  novaLite: "amazon.nova-lite-v1:0",
} as const;
type ModelKey = keyof typeof MODEL_ID;
const MODEL_KEYS = Object.keys(MODEL_ID) as ModelKey[];

/** Per-model window totals — the single source of truth every demo constant
 *  below is folded from. Lands the fleet around ~18.4k requests, ~12.6M
 *  tokens, ~0.76% error rate, 5 distinct models. */
const MODEL_TOTALS: Record<ModelKey, { requests: number; inTok: number; outTok: number; errors: number }> = {
  sonnet: { requests: 3200, inTok: 2_100_000, outTok: 4_600_000, errors: 38 },
  haiku: { requests: 6800, inTok: 1_400_000, outTok: 2_000_000, errors: 41 },
  gpt4o: { requests: 3400, inTok: 900_000, outTok: 380_000, errors: 27 },
  gemini: { requests: 2600, inTok: 520_000, outTok: 210_000, errors: 19 },
  novaLite: { requests: 2400, inTok: 310_000, outTok: 140_000, errors: 15 },
};
export const DEMO_TOTAL_REQUESTS: number = sum(MODEL_KEYS.map((k) => MODEL_TOTALS[k].requests));
const TOTAL_IN_TOK = sum(MODEL_KEYS.map((k) => MODEL_TOTALS[k].inTok));
const TOTAL_OUT_TOK = sum(MODEL_KEYS.map((k) => MODEL_TOTALS[k].outTok));
export const DEMO_TOTAL_TOKENS: number = TOTAL_IN_TOK + TOTAL_OUT_TOK;
const TOTAL_ERRORS = sum(MODEL_KEYS.map((k) => MODEL_TOTALS[k].errors));
const FLEET_P95_MS = 2100;

// ---------------------------------------------------------------------------
// usePulseSummary — hero KPIs (tokens, requests, spend, p95, error rate, …)
// ---------------------------------------------------------------------------

export const DEMO_PULSE_SUMMARY: PulseSummaryCore = computePulseSummaryCore(
  {
    requests: DEMO_TOTAL_REQUESTS,
    input_tokens: TOTAL_IN_TOK,
    output_tokens: TOTAL_OUT_TOK,
    total_tokens: DEMO_TOTAL_TOKENS,
    p95_ms: FLEET_P95_MS,
    error_rate_pct: Number(((TOTAL_ERRORS / DEMO_TOTAL_REQUESTS) * 100).toFixed(2)),
    models: MODEL_KEYS.length,
    mcp_servers: 3,
    mcp_tools: 11,
    token_efficiency_pct: 58,
  },
  {
    tokens: distribute(DEMO_TOTAL_TOKENS, weightsOf(FLEET_SHAPE)),
    p95_ns: seriesWithAvg(FLEET_P95_MS, FLEET_SHAPE).map((ms) => ms * 1_000_000),
    errors: distribute(TOTAL_ERRORS, weightsOf(FLEET_SHAPE)),
    requests: distribute(DEMO_TOTAL_REQUESTS, weightsOf(FLEET_SHAPE)),
  },
  { mcp_servers: 3, mcp_tools: 11 },
  1,
  3600,
);

// ---------------------------------------------------------------------------
// usePulseHealth — the 3 fleet-posture pillars (useFleetPosture reuses these)
// ---------------------------------------------------------------------------

export const DEMO_PULSE_HEALTH: { operational: Pillar; quality: Pillar; cost: Pillar } = {
  operational: operationalPillar(
    { total: DEMO_TOTAL_REQUESTS, errors: TOTAL_ERRORS, p95_ms: FLEET_P95_MS, p50_ms: 640 },
    1,
  ),
  quality: qualityPillar(
    { total: DEMO_TOTAL_REQUESTS, with_eval: Math.round(DEMO_TOTAL_REQUESTS * 0.5), avg_score: 0.89 },
    1,
  ),
  cost: costPillar(
    { requests: DEMO_TOTAL_REQUESTS, input_tokens: TOTAL_IN_TOK, output_tokens: TOTAL_OUT_TOK, distinct_models: MODEL_KEYS.length },
    { requests_7d: Math.round(DEMO_TOTAL_REQUESTS * 6.5), input_tokens_7d: 24_000_000, output_tokens_7d: 26_000_000 },
    24,
    1,
  ),
};

// ---------------------------------------------------------------------------
// useDailySpend — the PostureBand "Spend · 30d proj" KPI + SpendGlance bars
// ---------------------------------------------------------------------------

/** 8-day fractional-deviation shape (mean ≈ 0), index 0 = most recent 24h —
 *  matches the real hook's per-day query order. */
const DAILY_SHAPE_NEWEST_FIRST = [0.18, 0.05, -0.08, 0.12, -0.15, 0.02, -0.10, 0.10];

export const DEMO_DAILY_SPEND = computeDailySpend(
  Array.from({ length: 8 }, (_, dayIdx) =>
    MODEL_KEYS.map((key) => {
      const t = MODEL_TOTALS[key];
      const weight = 1 + DAILY_SHAPE_NEWEST_FIRST[dayIdx];
      return {
        model: MODEL_ID[key],
        // Each day gets roughly this model's fleet-window share, spread
        // evenly across 8 days and lightly varied so bars aren't flat.
        in_tok: Math.round((t.inTok / 8) * weight),
        out_tok: Math.round((t.outTok / 8) * weight),
      };
    }),
  ),
  1,
);

// ---------------------------------------------------------------------------
// useTokenEfficiency — EfficiencyMixCard's efficiency gauge
// ---------------------------------------------------------------------------

export const DEMO_TOKEN_EFFICIENCY = computeTokenEfficiency(
  MODEL_KEYS.map((key) => {
    const t = MODEL_TOTALS[key];
    return {
      model: MODEL_ID[key],
      input_tokens: t.inTok,
      output_tokens: t.outTok,
      requests: t.requests,
      truncations: Math.round(t.requests * 0.015),
      eval_spans: Math.round(t.requests * 0.4),
      // Tuned so tokens/sec lands in a realistic 30-50 tok/s band per model.
      dur_s: t.outTok / 38,
    };
  }),
);

// ---------------------------------------------------------------------------
// useProviderMix — EfficiencyMixCard's provider-mix donut
// ---------------------------------------------------------------------------

export const DEMO_PROVIDER_MIX = computeProviderMix(
  [
    {
      // Fully Bedrock-routed — exercises the "Bedrock proxy" sublabel honestly.
      provider: "anthropic",
      requests: MODEL_TOTALS.sonnet.requests + MODEL_TOTALS.haiku.requests,
      tokens:
        MODEL_TOTALS.sonnet.inTok + MODEL_TOTALS.sonnet.outTok + MODEL_TOTALS.haiku.inTok + MODEL_TOTALS.haiku.outTok,
      via_bedrock_count: MODEL_TOTALS.sonnet.requests + MODEL_TOTALS.haiku.requests,
      raw_providers: ["anthropic"],
    },
    {
      provider: "openai",
      requests: MODEL_TOTALS.gpt4o.requests,
      tokens: MODEL_TOTALS.gpt4o.inTok + MODEL_TOTALS.gpt4o.outTok,
      via_bedrock_count: 0,
      raw_providers: ["openai"],
    },
    {
      provider: "google",
      requests: MODEL_TOTALS.gemini.requests,
      tokens: MODEL_TOTALS.gemini.inTok + MODEL_TOTALS.gemini.outTok,
      via_bedrock_count: 0,
      raw_providers: ["google"],
    },
    {
      provider: "aws-bedrock",
      requests: MODEL_TOTALS.novaLite.requests,
      tokens: MODEL_TOTALS.novaLite.inTok + MODEL_TOTALS.novaLite.outTok,
      via_bedrock_count: 0,
      raw_providers: ["aws-bedrock"],
    },
  ],
  1,
);

// ---------------------------------------------------------------------------
// useAgentCosts — TopAgentsCard
// ---------------------------------------------------------------------------

export const DEMO_AGENT_COSTS = computeAgentCosts(
  [
    { agent: "billing-assistant", models: [MODEL_ID.sonnet], linked_traces: 1400, input_tokens: 780_000, output_tokens: 1_650_000 },
    { agent: "support-copilot", models: [MODEL_ID.haiku], linked_traces: 2600, input_tokens: 520_000, output_tokens: 740_000 },
    { agent: "onboarding-agent", models: [MODEL_ID.gpt4o], linked_traces: 900, input_tokens: 260_000, output_tokens: 110_000 },
    { agent: "fraud-review-agent", models: [MODEL_ID.sonnet], linked_traces: 340, input_tokens: 410_000, output_tokens: 890_000 },
    { agent: "trip-planner-agent", models: [MODEL_ID.gemini, MODEL_ID.novaLite], linked_traces: 610, input_tokens: 180_000, output_tokens: 95_000 },
  ],
  1,
);

// ---------------------------------------------------------------------------
// useActivityHistogram — ActivityCard (fixed trailing-24h window)
// ---------------------------------------------------------------------------

export const DEMO_ACTIVITY_HISTOGRAM = computeActivityHistogram(
  { requests: distribute(DEMO_TOTAL_REQUESTS, weightsOf(FLEET_SHAPE)) },
  1,
);

// ---------------------------------------------------------------------------
// useTokenConsumption raw fixture — Pulse-only (Token consumption chart)
// ---------------------------------------------------------------------------

/** Same 24-bucket business-hours shape as the KPI spark / activity histogram
 *  above, so the three charts read as one consistent day rather than three
 *  independently-shaped curves. */
export const DEMO_TOKEN_SERIES_ROW = {
  tokens: distribute(DEMO_TOTAL_TOKENS, weightsOf(FLEET_SHAPE)),
};

// ---------------------------------------------------------------------------
// useHealthContributors raw fixtures — Pulse-only (Platform Health drilldown)
// ---------------------------------------------------------------------------

/** Same agent cast as `DEMO_AGENT_COSTS`'s fixture — fraud-review-agent reads
 *  as the fleet's slowest + highest-error contributor, a realistic "what's
 *  dragging platform health down" story. */
export const DEMO_SLOW_AGENT_RECORDS = [
  { name: "fraud-review-agent", p95_ms: 8200, calls: 340, errors: 14, error_rate_pct: 4.1 },
  { name: "trip-planner-agent", p95_ms: 5400, calls: 610, errors: 9, error_rate_pct: 1.5 },
  { name: "billing-assistant", p95_ms: 3100, calls: 1400, errors: 6, error_rate_pct: 0.4 },
  { name: "onboarding-agent", p95_ms: 2200, calls: 900, errors: 2, error_rate_pct: 0.2 },
  { name: "support-copilot", p95_ms: 1400, calls: 2600, errors: 3, error_rate_pct: 0.1 },
];
export const DEMO_SLOW_MODEL_RECORDS = MODEL_KEYS.map((key) => ({
  name: MODEL_ID[key],
  p95_ms: Math.round(FLEET_P95_MS * (0.4 + MODEL_TOTALS[key].outTok / TOTAL_OUT_TOK)),
  calls: MODEL_TOTALS[key].requests,
}));

// ---------------------------------------------------------------------------
// useSafety raw fixtures — Pulse-only (Safety & guardrails panel)
// ---------------------------------------------------------------------------

export const DEMO_SAFETY_COUNTS = { spans: 4_200, guardrail: 3_100, pii: 340 };
export const DEMO_SAFETY_ACTIONS = [
  { action: "NONE", n: 2_800 },
  { action: "MASKED", n: 180 },
  { action: "BLOCKED", n: 120 },
];

// ---------------------------------------------------------------------------
// useFeedback raw fixtures — Pulse-only (Feedback & prompt versions panel)
// ---------------------------------------------------------------------------

export const DEMO_FEEDBACK_COUNTS = { n: 860, avg_rating: 4.2 };
export const DEMO_FEEDBACK_LABELS = [
  { label: "helpful", n: 520 },
  { label: "unhelpful", n: 110 },
  { label: "incorrect", n: 80 },
  { label: "other", n: 150 },
];
export const DEMO_PROMPT_VERSIONS = { versions: 14, prompts: 6 };

// ---------------------------------------------------------------------------
// useTileBreakdowns raw fixtures — Pulse-only (Models/MCP donut breakdowns)
// ---------------------------------------------------------------------------

/** Same per-model totals as the KPI row / token efficiency, so the Models
 *  donut's per-model split reconciles with the Tokens tile. */
export const DEMO_TILE_MODEL_RECORDS = MODEL_KEYS.map((key) => {
  const t = MODEL_TOTALS[key];
  return {
    model: MODEL_ID[key],
    requests: t.requests,
    input_tokens: t.inTok,
    output_tokens: t.outTok,
  };
});
export const DEMO_TILE_SERVER_RECORDS = [
  { server: "billing.mcp", requests: 1_400, avg_ms: 120, p50_ms: 95, p95_ms: 280, p99_ms: 410, span_errors: 3, tool_errors: 8 },
  { server: "support.mcp", requests: 2_200, avg_ms: 90, p50_ms: 70, p95_ms: 210, p99_ms: 340, span_errors: 2, tool_errors: 5 },
  { server: "docs.mcp", requests: 900, avg_ms: 150, p50_ms: 110, p95_ms: 340, p99_ms: 520, span_errors: 1, tool_errors: 3 },
];
export const DEMO_TILE_TOOL_RECORDS = [
  { tool: "lookup_order", calls: 1_600, avg_ms: 80, p50_ms: 60, p95_ms: 180, p99_ms: 260, span_errors: 2, tool_errors: 6 },
  { tool: "issue_refund", calls: 740, avg_ms: 140, p50_ms: 110, p95_ms: 300, p99_ms: 410, span_errors: 1, tool_errors: 4 },
  { tool: "search_kb", calls: 1_200, avg_ms: 60, p50_ms: 45, p95_ms: 130, p99_ms: 190, span_errors: 0, tool_errors: 1 },
  { tool: "update_ticket", calls: 560, avg_ms: 100, p50_ms: 80, p95_ms: 220, p99_ms: 310, span_errors: 1, tool_errors: 2 },
];
