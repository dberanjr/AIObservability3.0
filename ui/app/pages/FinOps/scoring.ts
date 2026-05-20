/**
 * FinOps comparison scoring engine (Session 12 handoff).
 *
 * All five dimensions return a 0-100 score; the comparison applies the use
 * case weights and reports a winner + margin + verdict strength.
 */

import type { ModelPricing } from "../../data/pricing";

export type ScoreDimension =
  | "latency"
  | "cost"
  | "quality"
  | "throughput"
  | "reliability";

export const DIMENSIONS: ScoreDimension[] = [
  "latency",
  "cost",
  "quality",
  "throughput",
  "reliability",
];

export const DIMENSION_LABEL: Record<ScoreDimension, string> = {
  latency: "Latency",
  cost: "Cost per request",
  quality: "Quality",
  throughput: "Throughput",
  reliability: "Reliability",
};

export type QualityTier = "low" | "mid" | "high" | "frontier";

const TIER_RANK: Record<QualityTier, number> = {
  low: 0,
  mid: 1,
  high: 2,
  frontier: 3,
};

const TIER_SCORE: Record<QualityTier, number> = {
  low: 70,
  mid: 78,
  high: 90,
  frontier: 97,
};

const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

/** Log-linear interpolation between (lo, scoreHi) and (hi, scoreLo). */
const logLinear = (
  value: number,
  lo: number,
  hi: number,
  scoreHi: number,
  scoreLo: number,
): number => {
  if (value <= lo) return scoreHi;
  if (value >= hi) return scoreLo;
  const ratio = (Math.log10(value) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo));
  return clamp(scoreHi - (scoreHi - scoreLo) * ratio, scoreLo, scoreHi);
};

export const scoreLatency = (avgMs: number): number =>
  logLinear(Math.max(1, avgMs), 200, 6000, 100, 0);

export const scoreCostPerRequest = (costPerRequest: number): number =>
  logLinear(Math.max(0.0001, costPerRequest), 0.0005, 0.05, 100, 0);

export const scoreQuality = (
  tier: QualityTier,
  realEvalScore: number | null,
): number => (realEvalScore != null ? clamp(realEvalScore, 0, 100) : TIER_SCORE[tier]);

export const scoreThroughput = (requests: number): number =>
  clamp(30 + 70 * (Math.log10(requests + 1) / Math.log10(10_000)), 0, 100);

export const scoreReliability = (errorRatePct: number): number =>
  clamp(100 - 20 * errorRatePct, 0, 100);

/** Use case profile: drives the weight vector and the hard quality floor. */
export interface UseCaseProfile {
  id: string;
  label: string;
  description: string;
  upstreamService: string;
  weights: Record<ScoreDimension, number>;
  minQuality: QualityTier;
}

export const USE_CASE_PROFILES: UseCaseProfile[] = [
  {
    id: "rag-qna",
    label: "RAG Q&A",
    description: "User-facing knowledge retrieval with citations expected.",
    upstreamService: "bos-sipe-qna-agentic",
    weights: { latency: 30, cost: 20, quality: 30, throughput: 10, reliability: 10 },
    minQuality: "high",
  },
  {
    id: "interactive",
    label: "Interactive chat",
    description: "Real-time chat where users feel each second.",
    upstreamService: "bos-ce-hhub-agent",
    weights: { latency: 45, cost: 15, quality: 20, throughput: 10, reliability: 10 },
    minQuality: "mid",
  },
  {
    id: "classification",
    label: "Classification",
    description: "Cheap, high-volume label-the-thing tasks.",
    upstreamService: "bos-adapt-ops-test",
    weights: { latency: 20, cost: 50, quality: 10, throughput: 15, reliability: 5 },
    minQuality: "low",
  },
  {
    id: "batch-analysis",
    label: "Batch analysis",
    description: "Async analytical workloads — cost matters most.",
    upstreamService: "bos-de-acars-agent",
    weights: { latency: 5, cost: 45, quality: 30, throughput: 15, reliability: 5 },
    minQuality: "high",
  },
  {
    id: "internal-tool",
    label: "Internal tool",
    description: "Developer-facing tools — balanced trade-offs.",
    upstreamService: "bos-ugpt-emp-exp-dev",
    weights: { latency: 20, cost: 25, quality: 25, throughput: 15, reliability: 15 },
    minQuality: "mid",
  },
  {
    id: "critical-policy",
    label: "Critical policy",
    description: "High-stakes policy or compliance decisions — quality dominates.",
    upstreamService: "bos-psacrt11m1-test",
    weights: { latency: 15, cost: 10, quality: 45, throughput: 5, reliability: 25 },
    minQuality: "frontier",
  },
];

export const findProfile = (id: string): UseCaseProfile =>
  USE_CASE_PROFILES.find((p) => p.id === id) ?? USE_CASE_PROFILES[0];

export interface ScoredModelInput {
  model: string;
  avgMs: number;
  costPerRequest: number;
  requests: number;
  errorRatePct: number;
  pricing: ModelPricing;
  /** Real evaluation score 0-100 when gen_ai.evaluation.* is wired up. */
  realEvalScore?: number | null;
}

export interface ScoredModel {
  model: string;
  scores: Record<ScoreDimension, number>;
  weightedTotal: number;
  disqualified: boolean;
  disqualifiedReason?: string;
}

export const scoreModelFor = (
  input: ScoredModelInput,
  profile: UseCaseProfile,
): ScoredModel => {
  const tier = input.pricing.tier;
  const scores: Record<ScoreDimension, number> = {
    latency: scoreLatency(input.avgMs),
    cost: scoreCostPerRequest(input.costPerRequest),
    quality: scoreQuality(tier, input.realEvalScore ?? null),
    throughput: scoreThroughput(input.requests),
    reliability: scoreReliability(input.errorRatePct),
  };

  const weightSum =
    profile.weights.latency +
    profile.weights.cost +
    profile.weights.quality +
    profile.weights.throughput +
    profile.weights.reliability;
  const weightedTotal =
    weightSum > 0
      ? (scores.latency * profile.weights.latency +
          scores.cost * profile.weights.cost +
          scores.quality * profile.weights.quality +
          scores.throughput * profile.weights.throughput +
          scores.reliability * profile.weights.reliability) /
        weightSum
      : 0;

  const disqualified = TIER_RANK[tier] < TIER_RANK[profile.minQuality];

  return {
    model: input.model,
    scores,
    weightedTotal,
    disqualified,
    disqualifiedReason: disqualified
      ? `Model tier "${tier}" is below the "${profile.minQuality}" minimum quality floor for this use case.`
      : undefined,
  };
};

export type VerdictStrength = "strong" | "moderate" | "narrow";

export const verdictStrengthFor = (margin: number): VerdictStrength => {
  if (margin > 12) return "strong";
  if (margin > 5) return "moderate";
  return "narrow";
};

export const VERDICT_LABEL: Record<VerdictStrength, string> = {
  strong: "Strong recommendation",
  moderate: "Moderate recommendation",
  narrow: "Narrow recommendation",
};

export const VERDICT_COLOR: Record<VerdictStrength, string> = {
  strong: "var(--green-2)",
  moderate: "var(--amber)",
  narrow: "var(--text-3)",
};

export interface ComparisonResult {
  profile: UseCaseProfile;
  a: ScoredModel;
  b: ScoredModel;
  winner: "a" | "b" | "tie";
  margin: number;
  verdict: VerdictStrength;
  reasoning: string;
  /** Estimated monthly savings if all volume swapped from loser → winner. */
  estimatedMonthlySavings: number;
}

const fmtCurrencyShort = (v: number): string => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
  return `$${Math.round(v).toLocaleString()}`;
};

/**
 * Phrase the recommendation reasoning. The copy avoids the word "Davis" per
 * Session 12 handoff item 6 — always uses "Dynatrace Intelligence".
 */
const buildReasoning = (
  profile: UseCaseProfile,
  winner: ScoredModel,
  loser: ScoredModel,
  margin: number,
): string => {
  if (winner.disqualified && loser.disqualified) {
    return `Both candidates miss the "${profile.minQuality}" quality floor for this use case. Pick a higher-tier model before A/B comparing.`;
  }
  if (loser.disqualified) {
    return `${winner.model} clears the quality floor for ${profile.label.toLowerCase()}; the alternative does not.`;
  }
  const topGains: Array<{ dim: string; delta: number }> = [];
  for (const dim of DIMENSIONS) {
    const delta = winner.scores[dim] - loser.scores[dim];
    if (delta > 5) topGains.push({ dim: DIMENSION_LABEL[dim], delta });
  }
  topGains.sort((a, b) => b.delta - a.delta);
  if (topGains.length === 0) {
    return `Scores are tightly grouped. Margin of ${margin.toFixed(1)} points — comfortable but not decisive.`;
  }
  const top = topGains.slice(0, 2).map((g) => g.dim.toLowerCase()).join(" and ");
  return `${winner.model} wins on ${top} for this profile. Margin ${margin.toFixed(1)} points across the weighted dimensions.`;
};

/**
 * Compare two scored model inputs against a profile and return the
 * recommendation payload consumed by the IntelligenceRecommendationPanel.
 */
export const compareModels = (
  profile: UseCaseProfile,
  aInput: ScoredModelInput,
  bInput: ScoredModelInput,
  /** Per-month volume estimate (requests). Used for projected savings. */
  monthlyRequests: number,
): ComparisonResult => {
  const a = scoreModelFor(aInput, profile);
  const b = scoreModelFor(bInput, profile);

  // Tie-break: if both qualified, higher weighted total wins. If only one
  // qualifies, that one wins. If neither, weighted total still picks the
  // less-bad option but the verdict is "narrow" by definition.
  let winner: "a" | "b" | "tie";
  if (a.disqualified && !b.disqualified) winner = "b";
  else if (b.disqualified && !a.disqualified) winner = "a";
  else if (a.weightedTotal > b.weightedTotal) winner = "a";
  else if (b.weightedTotal > a.weightedTotal) winner = "b";
  else winner = "tie";

  const margin = Math.abs(a.weightedTotal - b.weightedTotal);
  const verdict =
    winner === "tie" ? "narrow" : verdictStrengthFor(margin);

  const winnerInput = winner === "a" ? aInput : bInput;
  const loserInput = winner === "a" ? bInput : aInput;
  const winnerModel = winner === "a" ? a : b;
  const loserModel = winner === "a" ? b : a;

  // Projected monthly savings: (loser per-request - winner per-request) × monthlyRequests.
  // Negative numbers (winner is more expensive) are clamped to 0; we don't claim "spending more saves you money".
  const perRequestDelta = loserInput.costPerRequest - winnerInput.costPerRequest;
  const estimatedMonthlySavings = Math.max(0, perRequestDelta * monthlyRequests);

  return {
    profile,
    a,
    b,
    winner,
    margin,
    verdict,
    reasoning: buildReasoning(profile, winnerModel, loserModel, margin),
    estimatedMonthlySavings,
  };
};

export const formatSavings = fmtCurrencyShort;
