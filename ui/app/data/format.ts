/**
 * DQL responses occasionally hand back numeric fields as strings (especially
 * `toLong()` results and aggregate counts). Coerce defensively so we never
 * try to call `.toFixed` on a string.
 */
export const toNum = (v: unknown): number => {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim().length > 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
};

const finite = (v: unknown): number | null => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : null;
};

export const fmtTokens = (n: unknown): string => {
  const num = finite(n);
  if (num == null) return "—";
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
  return String(Math.round(num));
};

export const fmtUSD = (n: unknown): string => {
  const num = finite(n);
  if (num == null) return "—";
  if (num >= 1000) return `$${Math.round(num).toLocaleString()}`;
  if (num >= 100) return `$${num.toFixed(0)}`;
  if (num >= 10) return `$${num.toFixed(1)}`;
  if (num >= 1) return `$${num.toFixed(2)}`;
  if (num >= 0.01) return `$${num.toFixed(3)}`;
  return `$${num.toFixed(4)}`;
};

export const fmtUSDCompact = (n: unknown): string => {
  const num = finite(n);
  if (num == null) return "—";
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}k`;
  return fmtUSD(num);
};

export const fmtMs = (n: unknown): string => {
  const num = finite(n);
  if (num == null) return "—";
  if (num >= 60_000) return `${(num / 60_000).toFixed(1)}m`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}s`;
  return `${Math.round(num)}ms`;
};

export const fmtPercent = (n: unknown, digits = 1): string => {
  const num = finite(n);
  if (num == null) return "—";
  return `${num.toFixed(digits)}%`;
};

export const fmtCount = (n: unknown): string => {
  const num = finite(n);
  if (num == null) return "—";
  return Math.round(num).toLocaleString();
};

/**
 * Scanned-bytes in the same decimal (1000-based) units Grail's
 * `scanLimitGBytes` uses, so a "5 TB" limit reads as "5.0 TB" here. One
 * decimal place; sub-MB scans round up to "0.1 MB" so a real query never reads
 * as "0 MB".
 */
export const fmtScanBytes = (n: unknown): string => {
  const num = finite(n);
  if (num == null) return "—";
  if (num >= 1e12) return `${(num / 1e12).toFixed(1)} TB`;
  if (num >= 1e9) return `${(num / 1e9).toFixed(1)} GB`;
  const mb = num / 1e6;
  return `${(mb < 0.1 && num > 0 ? 0.1 : mb).toFixed(1)} MB`;
};

/** Seconds with a single decimal (e.g. "1.4s") — for query response times. */
export const fmtSecs1 = (ms: unknown): string => {
  const num = finite(ms);
  if (num == null) return "—";
  return `${(num / 1000).toFixed(1)}s`;
};

/**
 * A page's scan budget is the per-fetch scan limit (GB, decimal) times the
 * number of DQL queries the page ran — every query is injected with the same
 * per-fetch cap, so the page's aggregate budget scales with the query count.
 * Returns the FRACTION of that budget the page actually scanned, or null when
 * the budget is unlimited (`scanLimitGb <= 0`) or nothing has run yet.
 *
 * NOTE: this is a coarse page-level severity signal, not an exact per-query
 * truncation measure — a single multi-fetch query (e.g. a join) can legitimately
 * scan more than one per-fetch cap, so the fraction can exceed 1.
 */
export const scanBudgetFraction = (
  scannedBytes: unknown,
  scanLimitGb: number,
  queryCount: number,
): number | null => {
  const scanned = finite(scannedBytes);
  if (scanned == null) return null;
  if (!(scanLimitGb > 0) || !(queryCount > 0)) return null;
  const budgetBytes = scanLimitGb * 1e9 * queryCount;
  if (!(budgetBytes > 0)) return null;
  return scanned / budgetBytes;
};

export type ScanBudgetSeverity = "ok" | "warn" | "crit";

/**
 * Coarse severity band for a page's scan-vs-budget fraction. Drives the calm
 * neutral → amber coloring of the status-line scan readout (both warn and crit
 * render amber; the split is kept so callers can escalate further if needed). A
 * null fraction (unlimited budget) reads as "ok".
 */
export const scanBudgetSeverity = (
  fraction: number | null,
): ScanBudgetSeverity => {
  if (fraction == null) return "ok";
  if (fraction >= 1) return "crit";
  if (fraction >= 0.8) return "warn";
  return "ok";
};

/** Whole-percent label for a budget fraction, e.g. "34%" (empty for null). */
export const fmtBudgetPct = (fraction: number | null): string =>
  fraction == null ? "" : `${Math.round(fraction * 100)}%`;

/**
 * Short-form count (e.g. 77.01M, 2.68M, 1.5k) for tight spaces like donut
 * centers and tile values where the full comma-separated number would
 * overflow.
 */
export const fmtCountCompact = (n: unknown): string => {
  const num = finite(n);
  if (num == null) return "—";
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
  return Math.round(num).toLocaleString();
};
