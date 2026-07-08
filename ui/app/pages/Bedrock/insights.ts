/**
 * Pure ranker for the Bedrock hero's narrative sentences. No hooks, no DOM —
 * just threshold-guarded arithmetic over already-computed rollups, so it's
 * cheap to unit test (insights.test.ts) without renderHook/RTL.
 *
 * Every division is guarded: an empty/zero-total input yields `[]`, never
 * NaN or Infinity in a sentence.
 */

import { fmtSecs1, fmtUSD } from "../../data/format";
import type { BedrockCostSummary } from "../../bedrock/cost";

export interface Insight {
  tone: "warn" | "info" | "good";
  text: string;
}

export interface PerfRowLike {
  model: string;
  latencyMs: number;
  ttftMs: number;
  invocations: number;
}

export interface ComputeInsightsInput {
  summary: BedrockCostSummary;
  /** Total cost per model over the window (already-normalized model keys —
   *  must line up 1:1 with `invocationsByModel`/`perf`'s `model` keys). */
  costByModel: Record<string, number>;
  invocationsByModel: Record<string, number>;
  perf: PerfRowLike[];
}

/** A model's spend share of total cost at/above this is "concentrated". */
const COST_CONCENTRATION_SHARE = 0.4;
/** Slowest-vs-fastest latency ratio at/above this reads as a latency outlier. */
const LATENCY_OUTLIER_RATIO = 2;
/** Cache savings share of total cost at/above this is worth calling out. */
const CACHE_SAVINGS_SHARE = 0.05;

const sumValues = (m: Record<string, number>): number =>
  Object.values(m).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);

/** Cost concentration: the top-spend model's share of `summary.total`, paired
 *  with its share of total invocations (from `invocationsByModel`) so the
 *  sentence can contrast "most of the spend, little of the traffic". */
const costConcentrationInsight = (input: ComputeInsightsInput): Insight | null => {
  const { summary, costByModel, invocationsByModel } = input;
  if (!(summary.total > 0)) return null;

  const entries = Object.entries(costByModel).filter(([, v]) => Number.isFinite(v) && v > 0);
  if (entries.length === 0) return null;

  const [topModel, topCost] = entries.reduce((best, cur) => (cur[1] > best[1] ? cur : best));
  const costShare = topCost / summary.total;
  if (costShare < COST_CONCENTRATION_SHARE) return null;

  const totalInvocations = sumValues(invocationsByModel);
  const invShare = totalInvocations > 0 ? (invocationsByModel[topModel] ?? 0) / totalInvocations : 0;

  return {
    tone: "warn",
    text: `${topModel} drives ${Math.round(costShare * 100)}% of spend on ${Math.round(invShare * 100)}% of calls`,
  };
};

/** Latency outlier: the slowest model (by latencyMs) vs. the fastest, among
 *  models with real traffic (invocations > 0). `latencyMs` is an avg (see
 *  metricQueries.ts — falls back to avg where no percentile is ingested), so
 *  the sentence says "latency", not "p95", to avoid overclaiming precision. */
const latencyOutlierInsight = (input: ComputeInsightsInput): Insight | null => {
  const active = input.perf.filter((p) => p.invocations > 0 && Number.isFinite(p.latencyMs) && p.latencyMs > 0);
  if (active.length < 2) return null;

  const sorted = [...active].sort((a, b) => a.latencyMs - b.latencyMs);
  const fastest = sorted[0];
  const slowest = sorted[sorted.length - 1];
  if (!(fastest.latencyMs > 0) || slowest === fastest) return null;

  const ratio = slowest.latencyMs / fastest.latencyMs;
  if (ratio < LATENCY_OUTLIER_RATIO) return null;

  return {
    tone: "info",
    text: `${slowest.model} is ~${Math.round(ratio)}× slower — latency ${fmtSecs1(slowest.latencyMs)} vs ${fmtSecs1(fastest.latencyMs)}`,
  };
};

/** Cache savings: the ghost (no-cache counterfactual) savings as a share of
 *  actual total cost — only worth a sentence once it's a material chunk. */
const cacheSavingsInsight = (input: ComputeInsightsInput): Insight | null => {
  const { summary } = input;
  if (!(summary.total > 0) || !(summary.savedByCache > 0)) return null;

  const share = summary.savedByCache / summary.total;
  if (share < CACHE_SAVINGS_SHARE) return null;

  return {
    tone: "good",
    text: `Prompt caching saved ~${fmtUSD(summary.savedByCache)} (${Math.round(share * 100)}% of would-be cost)`,
  };
};

/** Up to 3 threshold-guarded narrative sentences, most-actionable first:
 *  cost concentration (warn) → latency outlier (info) → cache savings (good). */
export const computeInsights = (input: ComputeInsightsInput): Insight[] =>
  [costConcentrationInsight(input), latencyOutlierInsight(input), cacheSavingsInsight(input)].filter(
    (i): i is Insight => i !== null,
  );
