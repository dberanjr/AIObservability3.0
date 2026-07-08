/**
 * Pure cost helpers for the service×model detail modal. No React — testable in
 * isolation. Three cost views are surfaced:
 *   - actual:        USD for the spans we actually observed (post-sampling).
 *   - extrapolated:  actual scaled back up to the full population by the
 *                    fraction of rows the sampling ratio let us observe.
 *   - monthlyRunRate: the extrapolated spend projected to a 30-day month, so a
 *                    short window reads as a comparable run-rate.
 */
import {
  costOf,
  getPricing,
  resolveModelPricing,
  type ModelPricing,
} from "../../data/pricing";

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

/** Estimated USD for one AI-services table row. */
export interface ServiceRowCost {
  usd: number;
  /**
   * True when the figure is an approximation rather than an exact billed sum:
   * the service spans more than one model (so the aggregate in/out token split
   * is priced at the mean of the models' rates) OR any model priced via the
   * blended fallback. A single known model prices exactly → false.
   */
  estimated: boolean;
}

/**
 * Estimate a service's spend from its aggregate input/output tokens and the set
 * of models it used. The AI-services query only carries per-service token sums
 * (not a per-model split), so with multiple models we price the aggregate at
 * the MEAN of the models' input/output rates — a deliberate estimate flagged via
 * `estimated`. A single known model prices exactly. Pure — unit-tested.
 */
export const estimateServiceRowCost = (row: {
  inTok: number;
  outTok: number;
  models: string[];
}): ServiceRowCost => {
  const inTok = finiteOrZero(row.inTok);
  const outTok = finiteOrZero(row.outTok);
  const models = (row.models ?? []).filter(
    (m): m is string => typeof m === "string" && m.length > 0,
  );
  if (models.length === 0) return { usd: 0, estimated: true };

  const priced = models.map((m) => resolveModelPricing(m));
  const anyBlended = priced.some((p) => p.blended === true);
  const avgIn = priced.reduce((s, p) => s + p.inputPerMTok, 0) / priced.length;
  const avgOut = priced.reduce((s, p) => s + p.outputPerMTok, 0) / priced.length;
  const usd = finiteOrZero((inTok * avgIn + outTok * avgOut) / 1_000_000);

  return { usd, estimated: anyBlended || models.length > 1 };
};

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
