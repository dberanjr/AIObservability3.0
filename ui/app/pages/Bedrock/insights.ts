/**
 * Pure ranker for the Bedrock hero's narrative sentences. No hooks, no DOM —
 * just threshold-guarded arithmetic over already-computed rollups, so it's
 * cheap to unit test (insights.test.ts) without renderHook/RTL.
 *
 * Every division is guarded: an empty/zero-total input yields `[]`, never
 * NaN or Infinity in a sentence.
 */

import { fmtSecs1, fmtUSDPrecise } from "../../data/format";
import type { BedrockCostSummary } from "../../bedrock/cost";
import type { BedrockDailyCostPoint } from "../../bedrock/series";
import { normalizeBedrockModelId } from "../../bedrock/model";
import type { PerfByModelRow } from "../../bedrock/parse";

export interface Insight {
  tone: "warn" | "info" | "good";
  text: string;
  /**
   * Structured breakdown of the same insight, for callers that render it as a
   * distinct card (BedrockFindings' FindingCard) rather than inline narrative
   * prose (BedrockHero, which only reads `text`). Keeping both means neither
   * consumer has to parse the other's format back apart.
   */
  category: string;
  entity: string;
  metric: string;
}

export interface ComputeInsightsInput {
  summary: BedrockCostSummary;
  /** Total cost per model over the window (already-normalized model keys —
   *  must line up 1:1 with `invocationsByModel`/`perf`'s `model` keys). */
  costByModel: Record<string, number>;
  invocationsByModel: Record<string, number>;
  /** Structurally identical to `PerfByModelRow` (`parse.ts`) — reused
   *  directly rather than re-declared, since `useBedrockPerf`'s rows are
   *  exactly what flows in here via `buildInsightsInput`. */
  perf: PerfByModelRow[];
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
    category: "Cost concentration",
    entity: topModel,
    metric: `${Math.round(costShare * 100)}% of spend`,
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
    category: "Latency outlier",
    entity: slowest.model,
    metric: `~${Math.round(ratio)}× slower`,
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
    category: "Cache savings",
    entity: "Prompt caching",
    metric: fmtUSDPrecise(summary.savedByCache),
    text: `Prompt caching saved ~${fmtUSDPrecise(summary.savedByCache)} (${Math.round(share * 100)}% of would-be cost)`,
  };
};

/** Up to 3 threshold-guarded narrative sentences, most-actionable first:
 *  cost concentration (warn) → latency outlier (info) → cache savings (good). */
export const computeInsights = (input: ComputeInsightsInput): Insight[] =>
  [costConcentrationInsight(input), latencyOutlierInsight(input), cacheSavingsInsight(input)].filter(
    (i): i is Insight => i !== null,
  );

export interface InsightsSource {
  /** `useBedrockCost(scope).daily` — per-day cost by (shortModelName-keyed) model. */
  daily: BedrockDailyCostPoint[];
  /** `useBedrockCost(scope).summary`. */
  summary: BedrockCostSummary;
  /** `useBedrockPerf(scope).rows`. */
  perfRows: PerfByModelRow[];
}

/**
 * Builds `computeInsights`' input from the raw hook outputs
 * (`useBedrockCost` + `useBedrockPerf`). Originally inlined in BedrockHero
 * (D2); extracted here so BedrockFindings (D6) can build the identical input
 * without duplicating the model-key re-normalization.
 *
 * `costByModel` is built by summing `daily[].byModel` (keyed by
 * `shortModelName`, case- and date/version-suffix-preserving) and re-keying
 * through `normalizeBedrockModelId` so it lines up with `invocationsByModel`/
 * `perf`'s `model` field, which `useBedrockPerf` already normalizes the same
 * way. Without this re-key, a dated model id (e.g.
 * `anthropic.claude-3-5-sonnet-20241022-v2:0`) would land under two different
 * string keys in the two maps and the cost-concentration insight would never
 * find a matching invocation count.
 */
export const buildInsightsInput = ({ daily, summary, perfRows }: InsightsSource): ComputeInsightsInput => {
  const costByModel: Record<string, number> = {};
  for (const day of daily) {
    for (const [rawKey, value] of Object.entries(day.byModel)) {
      const key = normalizeBedrockModelId(rawKey);
      costByModel[key] = (costByModel[key] ?? 0) + value;
    }
  }

  const invocationsByModel: Record<string, number> = {};
  for (const row of perfRows) {
    invocationsByModel[row.model] = (invocationsByModel[row.model] ?? 0) + row.invocations;
  }

  return { summary, costByModel, invocationsByModel, perf: perfRows };
};
