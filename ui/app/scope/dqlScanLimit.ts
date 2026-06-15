/**
 * Pure scan-limit injection for DQL — no React/SDK imports so it's unit
 * testable in a node env. The toolbar scan-limit selector is the single source
 * of truth: useScopedDql injects the selected value into every fetch, so no
 * query builder hardcodes scanLimitGBytes (a hardcoded value would silently
 * ignore the user's choice).
 */

const SCAN_LIMIT_RE = /scanLimitGBytes:\s*-?\d+/g;
// Matches any `fetch <table>,` whose statement (up to the next pipe) does not
// already declare a scanLimitGBytes.
const FETCH_NEEDS_SCAN_LIMIT_RE =
  /\bfetch\s+([\w.]+)\s*,(?![^|]*\bscanLimitGBytes\b)/g;

/**
 * Inject the scan limit into every fetch that lacks one, then normalize any
 * explicit literal to the same value.
 */
export const injectScanLimit = (
  query: string,
  scanLimitGb: number,
): string => {
  if (!query) return query;
  const injected = query.replace(
    FETCH_NEEDS_SCAN_LIMIT_RE,
    `fetch $1, scanLimitGBytes: ${scanLimitGb},`,
  );
  return injected.replace(SCAN_LIMIT_RE, `scanLimitGBytes: ${scanLimitGb}`);
};
