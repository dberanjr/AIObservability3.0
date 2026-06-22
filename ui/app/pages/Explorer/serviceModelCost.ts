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
