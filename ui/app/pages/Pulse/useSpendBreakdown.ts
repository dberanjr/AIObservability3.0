/**
 * Splits fleet spend into ACTUAL (models priced from pricing.ts) vs ESTIMATED
 * (models missing from the table, costed at the blended fallback rate). Reuses
 * the per-model rows from useModels (already loaded on Pulse) — each row carries
 * an exact `cost` and a `pricingUnknown` flag — so no extra query is needed.
 *
 * This lets the Pulse cost surfaces show "actual + estimated" instead of
 * labelling everything "Blended est." when only a few models are unpriced.
 */
import { useMemo } from "react";
import { useModels } from "../Models/useModels";

export interface SpendBreakdown {
  /** Spend from models with real rates in pricing.ts. */
  actual: number;
  /** Spend from models priced at the blended fallback (not in the table). */
  estimated: number;
  total: number;
  /** True when at least one model fell back to the blended rate. */
  hasEstimated: boolean;
  /** Names of the unpriced (estimated) models. */
  estimatedModels: string[];
  isLoading: boolean;
}

/**
 * `showExample` defaults to false (mirrors useGuardrails.ts) and is passed
 * through to the shared `useModels` hook, whose own `showExample` branch
 * folds its canned `DEMO_MODEL_RECORDS` through the SAME aggregation —
 * nothing here needs its own demo dataset.
 */
export const useSpendBreakdown = (showExample = false): SpendBreakdown => {
  const { models, isLoading } = useModels(null, showExample);
  return useMemo<SpendBreakdown>(() => {
    let actual = 0;
    let estimated = 0;
    const estimatedModels: string[] = [];
    for (const m of models) {
      if (m.pricingUnknown) {
        estimated += m.cost;
        estimatedModels.push(m.model);
      } else {
        actual += m.cost;
      }
    }
    return {
      actual,
      estimated,
      total: actual + estimated,
      hasEstimated: estimatedModels.length > 0,
      estimatedModels,
      isLoading,
    };
  }, [models, isLoading]);
};
