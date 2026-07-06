import { useMemo } from "react";
import { useModels } from "../Models/useModels";
import { CATEGORICAL } from "../../theme/palette";

// Shared, perceptually-spaced categorical ramp (theme/palette.ts). Fixed hexes
// so the accent Tweak can't collapse the concentration donut into duplicate
// hues (UX report Chart-3/4).
const SLICE_COLORS = CATEGORICAL;

export interface ConcentrationSlice {
  key: string;
  label: string;
  cost: number;
  sharePct: number;
  color: string;
  /** Raw model values behind this slice, for click-to-filter. */
  rawModels: string[];
}

export interface ModelConcentration {
  slices: ConcentrationSlice[];
  totalCost: number;
  /** Top model's share of total spend (0–100) — the concentration-risk number. */
  topSharePct: number;
  modelCount: number;
  isLoading: boolean;
  error?: Error;
}

/**
 * Cost-concentration donut for the FinOps tile: top models by effective spend
 * (through the cache-aware cost model, via useModels' `cost`), the rest folded
 * into "Others". There is no model-level concentration hook in the app —
 * useFinOps.concentrationPct is service-level — so this derives it from the
 * already-priced ModelRow set with no extra query. Drills to Models / FinOps.
 */
export const useModelConcentration = (topN = 4): ModelConcentration => {
  const { models, isLoading, error } = useModels();

  return useMemo<ModelConcentration>(() => {
    const priced = models
      .filter((m) => m.cost > 0)
      .sort((a, b) => b.cost - a.cost);
    const totalCost = priced.reduce((a, m) => a + m.cost, 0);

    const head = priced.slice(0, topN);
    const tail = priced.slice(topN);

    const slices: ConcentrationSlice[] = head.map((m, i) => ({
      key: m.modelKey,
      label: m.model,
      cost: m.cost,
      sharePct: totalCost > 0 ? (m.cost / totalCost) * 100 : 0,
      color: SLICE_COLORS[i % SLICE_COLORS.length],
      rawModels: m.rawModels,
    }));

    if (tail.length > 0) {
      const tailCost = tail.reduce((a, m) => a + m.cost, 0);
      slices.push({
        key: "__others__",
        label: `Others · ${tail.length} model${tail.length === 1 ? "" : "s"}`,
        cost: tailCost,
        sharePct: totalCost > 0 ? (tailCost / totalCost) * 100 : 0,
        color: "var(--text-4)",
        rawModels: tail.flatMap((m) => m.rawModels),
      });
    }

    return {
      slices,
      totalCost,
      topSharePct: slices[0]?.sharePct ?? 0,
      modelCount: priced.length,
      isLoading,
      error,
    };
  }, [models, isLoading, error, topN]);
};
