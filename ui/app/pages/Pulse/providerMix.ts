import { toNum } from "../../data/format";

/**
 * One row of the provider-mix summarize query. Grail returns count() / sum()
 * longs as STRINGS, so the numeric fields are typed as number but read through
 * toNum() at every use.
 */
export interface ProviderRecord {
  provider?: string;
  requests?: number;
  tokens?: number;
  via_bedrock_count?: number;
  raw_providers?: Array<string | null>;
}

/**
 * Sum an extrapolated count/sum field across provider records. Grail returns
 * count() / sum() longs as STRINGS, so each value MUST be coerced to a number
 * before adding — a bare `+` would CONCATENATE the strings ("116731" + "6626"
 * = "1167316626") into a nonsensical 10^19-scale number. Multiply by the
 * sampling ratio to extrapolate back to the unsampled population.
 */
export const extrapolatedSum = (
  records: ProviderRecord[],
  pick: (r: ProviderRecord) => unknown,
  samplingRatio: number,
): number => {
  let sum = 0;
  for (const r of records) {
    const n = toNum(pick(r));
    // toNum returns NaN for missing / non-numeric values; a single NaN would
    // poison the whole sum, so skip it.
    if (Number.isFinite(n)) sum += n;
  }
  return sum * samplingRatio;
};
