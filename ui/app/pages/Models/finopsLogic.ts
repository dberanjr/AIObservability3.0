/**
 * Pure FinOps / model-type helpers for the Models / FinOps tab. Kept free of
 * React so the calculation-heavy pieces (within-type downgrade comparison,
 * within-type savings, cost-concentration segmentation, provider-keyed series
 * colours) are unit-testable in isolation. useModels re-exports the model-type
 * primitives so the rest of the page keeps importing them from there.
 */
import { PROVIDER_COLOR, normalizeProvider } from "../../detection/attributes";

export type ModelType = "generative" | "embedding" | "reranking";

export const MODEL_TYPE_LABEL: Record<ModelType, string> = {
  generative: "Generative",
  embedding: "Embedding",
  reranking: "Reranking",
};

/**
 * Per Session 11 handoff: infer type from gen_ai.operation.name first, then
 * model-name substring. gen_ai.operation.name is not consistently set in BOS
 * data so the name-based fallback is load-bearing.
 */
export const inferModelType = (
  modelName: string,
  operationName?: string | null,
): ModelType => {
  const op = (operationName ?? "").trim().toLowerCase();
  if (op === "embeddings" || op === "embedding") return "embedding";
  if (op === "rerank" || op === "reranking") return "reranking";
  const m = modelName.toLowerCase();
  if (m.includes("embed")) return "embedding";
  if (m.includes("rerank")) return "reranking";
  return "generative";
};

export interface PricedModelLike {
  modelKey: string;
  type: ModelType;
  costPerMTok: number;
  pricingUnknown: boolean;
}

export interface DowngradePair<T> {
  expensive: T;
  cheap: T;
  ratio: number;
}

/**
 * Find the strongest *same-type* downgrade pair: the most-expensive and
 * cheapest priced models that share a ModelType, when the price ratio exceeds
 * `minRatio`. Comparing only within a type stops the incoherent
 * embedding-vs-Opus swap — embeddings are ~$0.02/MTok and frontier generative
 * models ~$15/MTok, so a cross-type ratio test fires almost always and yields
 * nonsense advice ("pilot <embedding> on <Opus>'s prompts").
 */
export const pickWithinTypeDowngrade = <T extends PricedModelLike>(
  models: T[],
  minRatio = 3,
): DowngradePair<T> | null => {
  const priced = models.filter((m) => !m.pricingUnknown && m.costPerMTok > 0);
  const byType = new Map<ModelType, T[]>();
  for (const m of priced) {
    const arr = byType.get(m.type) ?? [];
    arr.push(m);
    byType.set(m.type, arr);
  }
  let best: DowngradePair<T> | null = null;
  for (const group of byType.values()) {
    if (group.length < 2) continue;
    let expensive = group[0];
    let cheap = group[0];
    for (const m of group) {
      if (m.costPerMTok > expensive.costPerMTok) expensive = m;
      if (m.costPerMTok < cheap.costPerMTok) cheap = m;
    }
    if (expensive.modelKey === cheap.modelKey) continue;
    const ratio = expensive.costPerMTok / cheap.costPerMTok;
    if (ratio > minRatio && (!best || ratio > best.ratio)) {
      best = { expensive, cheap, ratio };
    }
  }
  return best;
};

export interface ServiceCostLike {
  costPerMTok: number;
  tokens: number;
  cost: number;
  topModel: string | null;
}

/**
 * Estimate savings if expensive services shifted toward their cheaper *same-type*
 * peer. Each service's type is inferred from its dominant model, so an embedding
 * service (cheap by nature) is never used as the "cheap baseline" for a
 * generative service. Within each type: if a service's blended $/MTok is > 3× the
 * cheapest same-type service, assume it could halve its blended rate, and sum
 * those half-savings.
 */
export const computePossibleSavings = (services: ServiceCostLike[]): number => {
  const priced = services.filter((s) => s.costPerMTok > 0);
  const byType = new Map<ModelType, ServiceCostLike[]>();
  for (const s of priced) {
    const type = inferModelType(s.topModel ?? "");
    const arr = byType.get(type) ?? [];
    arr.push(s);
    byType.set(type, arr);
  }
  let savings = 0;
  for (const group of byType.values()) {
    if (group.length < 2) continue;
    const cheapest = group.reduce((best, s) =>
      s.costPerMTok < best.costPerMTok ? s : best,
    );
    for (const svc of group) {
      if (svc.costPerMTok > cheapest.costPerMTok * 3) {
        const targetCost = (svc.tokens / 1_000_000) * cheapest.costPerMTok * 2;
        savings += Math.max(0, svc.cost - targetCost);
      }
    }
  }
  return savings;
};

export const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
};

export interface ConcentrationInput {
  service: string;
  cost: number;
  topModel: string | null;
}

export interface ConcentrationSegment<T> {
  /** The underlying service, or null for the rolled-up "Other" segment. */
  service: T | null;
  label: string;
  cost: number;
  /** Percentage of total priced spend, 0-100. */
  share: number;
  color: string;
  isOther: boolean;
}

/**
 * Build cost-concentration segments where each segment's `share` is exactly its
 * fraction of total spend — so a 100%-stacked bar renders area proportional to
 * cost (the old slice-and-dice treemap always gave the top service the left
 * half regardless of its real share). Colour keys off the dominant model's
 * provider so identity matches the rest of the page's provider palette.
 */
export const buildConcentrationSegments = <T extends ConcentrationInput>(
  services: T[],
  topN = 8,
): ConcentrationSegment<T>[] => {
  const priced = services
    .filter((s) => s.cost > 0)
    .sort((a, b) => b.cost - a.cost);
  const total = priced.reduce((acc, s) => acc + s.cost, 0);
  if (total === 0) return [];
  const head = priced.slice(0, topN);
  const tail = priced.slice(topN);
  const segments: ConcentrationSegment<T>[] = head.map((s) => ({
    service: s,
    label: s.service,
    cost: s.cost,
    share: (s.cost / total) * 100,
    color: PROVIDER_COLOR[normalizeProvider(null, s.topModel).id],
    isOther: false,
  }));
  if (tail.length > 0) {
    const otherCost = tail.reduce((acc, s) => acc + s.cost, 0);
    segments.push({
      service: null,
      label: `Other (${tail.length})`,
      cost: otherCost,
      share: (otherCost / total) * 100,
      color: "var(--text-4)",
      isOther: true,
    });
  }
  return segments;
};

/**
 * Assign each daily-cost model series a colour keyed off its provider, so a
 * model reads the same hue here as in the bubble chart / table / donut. When a
 * provider contributes multiple series, later series get a deterministic
 * lighter shade of the same hue so they stay distinguishable without losing the
 * provider identity. "Other" gets a neutral colour.
 */
export const assignSeriesColors = (models: string[]): Map<string, string> => {
  const map = new Map<string, string>();
  const providerSeen = new Map<string, number>();
  for (const modelName of models) {
    if (modelName === "Other") {
      map.set(modelName, "var(--text-4)");
      continue;
    }
    const id = normalizeProvider(null, modelName).id;
    const base = PROVIDER_COLOR[id];
    const seen = providerSeen.get(id) ?? 0;
    providerSeen.set(id, seen + 1);
    const color =
      seen === 0
        ? base
        : `color-mix(in oklab, ${base} ${Math.max(24, 100 - seen * 22)}%, var(--surface))`;
    map.set(modelName, color);
  }
  return map;
};
