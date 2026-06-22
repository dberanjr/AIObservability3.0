import { toNum } from "../../data/format";

/** One summarize row returned by buildServiceModelDetailQuery.
 *  The DQL SDK hands `long` counts and `duration` percentiles back as STRINGS
 *  (only `double` aggregates arrive as JS numbers), so every field is widened to
 *  `number | string` and coerced with `toNum` before use. Reading these via
 *  `Number.isFinite` directly silently zeroed requests/errors/latency while the
 *  `double` token sums rendered fine — the exact contradiction this fixes. */
export interface DetailRow {
  requests?: number | string;
  in_tok?: number | string;
  out_tok?: number | string;
  errors?: number | string;
  logical_errors?: number | string;
  p50_ns?: number | string;
  p90_ns?: number | string;
  p95_ns?: number | string;
}

/** Folded, UI-ready metrics for one service×model pair. */
export interface ServiceModelMetrics {
  requests: number;
  inTok: number;
  outTok: number;
  errors: number;
  logicalErrors: number;
  errorRatePct: number;
  p50Ms: number;
  p90Ms: number;
  p95Ms: number;
  tokensPerReq: number;
}

const NS_PER_MS = 1_000_000;

/** Duration percentiles arrive as nanosecond STRINGS from the SDK — coerce via
 *  toNum (which parses strings) before scaling to ms. */
const nsToMs = (ns: number | string | undefined): number => {
  const n = toNum(ns);
  return Number.isFinite(n) ? n / NS_PER_MS : 0;
};

/** Coerce a possibly-undefined/string numeric field to a finite number. The SDK
 *  serialises `long` counts as strings, so a plain `Number.isFinite` guard would
 *  reject them; toNum parses the string first. */
const num = (v: number | string | undefined): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Fold one raw detail row into UI metrics, coercing the SDK's stringified
 * `long`/`duration` fields to numbers. Pure + exported (in a React-free module
 * so it imports cleanly under the node test runner) so the string-coercion
 * (the requests/latency=0 bug) is unit-testable.
 */
export const foldDetailMetrics = (row: DetailRow): ServiceModelMetrics => {
  const requests = num(row.requests);
  const inTok = num(row.in_tok);
  const outTok = num(row.out_tok);
  const errors = num(row.errors);
  const logicalErrors = num(row.logical_errors);
  return {
    requests,
    inTok,
    outTok,
    errors,
    logicalErrors,
    errorRatePct: requests > 0 ? (errors / requests) * 100 : 0,
    p50Ms: nsToMs(row.p50_ns),
    p90Ms: nsToMs(row.p90_ns),
    p95Ms: nsToMs(row.p95_ns),
    tokensPerReq: requests > 0 ? (inTok + outTok) / requests : 0,
  };
};
