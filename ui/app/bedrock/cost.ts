import { computeCost } from "../data/pricing";
import { normalizeBedrockModelId } from "./model";

export interface DailyModelTokens {
  modelId: string;
  inTok: number;
  outTok: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface BedrockCostSummary {
  total: number;
  priced: number;
  estimated: number;
  savedByCache: number;
  estimatedModels: string[];
}

/** Actual cost (cache-aware) + the no-cache counterfactual (cache-read tokens
 *  re-priced at full input rate). The delta is the "ghost" savings. */
export const bedrockCostOfTokens = (
  t: DailyModelTokens,
): { cost: number; blended: boolean; noCacheCost: number } => {
  const actual = computeCost(
    { inputTokens: t.inTok, outputTokens: t.outTok, cacheReadTokens: t.cacheRead, cacheWriteTokens: t.cacheWrite },
    t.modelId,
    "aws_bedrock",
  );
  // Counterfactual: fold cacheRead back into full-price input, zero the cache tier.
  const noCache = computeCost(
    { inputTokens: t.inTok + t.cacheRead, outputTokens: t.outTok, cacheReadTokens: 0, cacheWriteTokens: t.cacheWrite },
    t.modelId,
    "aws_bedrock",
  );
  return { cost: actual.effectiveCost, blended: actual.blended, noCacheCost: noCache.effectiveCost };
};

export const bedrockCostSummary = (rows: DailyModelTokens[]): BedrockCostSummary => {
  let priced = 0, estimated = 0, savedByCache = 0;
  const estimatedModels = new Set<string>();
  for (const row of rows) {
    const { cost, blended, noCacheCost } = bedrockCostOfTokens(row);
    savedByCache += Math.max(0, noCacheCost - cost);
    if (blended) {
      estimated += cost;
      estimatedModels.add(normalizeBedrockModelId(row.modelId));
    } else {
      priced += cost;
    }
  }
  return { total: priced + estimated, priced, estimated, savedByCache, estimatedModels: [...estimatedModels] };
};
