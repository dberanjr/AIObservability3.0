/**
 * Pure cost helpers for the service×model detail modal. No React — testable in
 * isolation. Three cost views are surfaced:
 *   - actual:        USD for the spans we actually observed (post-sampling).
 *   - extrapolated:  actual scaled back up to the full population by the
 *                    fraction of rows the sampling ratio let us observe.
 *   - monthlyRunRate: the extrapolated spend projected to a 30-day month, so a
 *                    short window reads as a comparable run-rate.
 */
import { costOf, getPricing, type ModelPricing } from "../../data/pricing";

/** 30 days in milliseconds — the run-rate projection window. */
export const THIRTY_DAYS_MS = 30 * 24 * 3600 * 1000;

export interface ServiceModelCost {
  /** USD for the observed spans. */
  actual: number;
  /** USD scaled to the full population by the sampling ratio. */
  extrapolated: number;
  /** USD: the extrapolated spend projected to 30 days. */
  monthlyRunRate: number;
  /** Pricing record for the model (from getPricing). */
  pricing: ModelPricing;
}

/** Coerce anything non-finite (NaN / ±Infinity) to 0. */
const finiteOrZero = (n: number): number => (Number.isFinite(n) ? n : 0);

/**
 * Compute the three cost views for a single service×model pair.
 *
 * `samplingRatio` is the FRACTION of the population observed, in (0, 1]; 1
 * means no sampling. A toolbar ratio of "1 in N" maps to `1 / N`. We divide the
 * observed cost by the fraction to estimate the full-population cost; a fraction
 * of 0 (or non-finite) falls back to the observed cost rather than dividing by
 * zero.
 */
export const computeServiceModelCost = (args: {
  inTok: number;
  outTok: number;
  model: string;
  samplingRatio: number;
  timeframeMs: number;
}): ServiceModelCost => {
  const inTok = finiteOrZero(args.inTok);
  const outTok = finiteOrZero(args.outTok);

  const actual = finiteOrZero(costOf(inTok, outTok, args.model));

  const ratio = args.samplingRatio;
  const extrapolated =
    Number.isFinite(ratio) && ratio > 0 ? actual / ratio : actual;

  const tf = args.timeframeMs;
  const monthlyRunRate =
    Number.isFinite(tf) && tf > 0
      ? finiteOrZero(extrapolated * (THIRTY_DAYS_MS / tf))
      : 0;

  return {
    actual,
    extrapolated: finiteOrZero(extrapolated),
    monthlyRunRate,
    pricing: getPricing(args.model),
  };
};

/**
 * Decide whether the cost figures for this pair should carry an
 * "≈ estimated / blended rate" badge. True when the pricing was a blended
 * fallback (model missing from the table) OR the model resolved to the inert
 * Unknown provider (zero rates) — in both cases the dollar amounts are not a
 * real billed figure and the UI should say so. Pure so it can be unit-tested
 * without rendering.
 */
export const isEstimatedCost = (pricing: ModelPricing): boolean =>
  pricing.blended === true || pricing.provider === "Unknown";

/** A single labelled cost figure rendered as a stat in the modal. */
export interface CostStat {
  label: string;
  value: number;
  /** Optional sublabel under the figure (e.g. the sampling note). */
  sub?: string;
}

/**
 * Build the three labelled cost figures (Actual / Estimated full population /
 * Monthly run-rate). When sampling is active (ratio < 1, i.e. "1 in N" with
 * N > 1) the extrapolated figure gets a "scaled ×N" sublabel so users know it
 * was grossed up. `samplingRatio` is the FRACTION observed, matching
 * computeServiceModelCost. Pure — unit-tested.
 */
export const costTrioStats = (
  cost: ServiceModelCost,
  samplingRatio: number,
): CostStat[] => {
  const sampled =
    Number.isFinite(samplingRatio) && samplingRatio > 0 && samplingRatio < 1;
  const factor = sampled ? Math.round(1 / samplingRatio) : 1;
  return [
    { label: "Actual (observed)", value: cost.actual },
    {
      label: "Estimated (full population)",
      value: cost.extrapolated,
      sub: sampled ? `scaled ×${factor} for sampling` : undefined,
    },
    {
      label: "Monthly run-rate",
      value: cost.monthlyRunRate,
      sub: "projected to 30 days",
    },
  ];
};
