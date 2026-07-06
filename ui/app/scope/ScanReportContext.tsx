import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import type { UseDqlResult } from "@dynatrace-sdk/react-hooks";

/**
 * Per-query scan telemetry captured from the DQL execution metadata Grail
 * returns on every response. Powers the (Tweaks-gated) scanned-data debug
 * badges on the Summary page and the page-wide scan total in the footer.
 */
export interface ScanEntry {
  /** The <ScanScope> group this query ran under (null = ungrouped). */
  group: string | null;
  /** The query text — the identity used to detect shared (inherited) queries. */
  query: string;
  /** Bytes Grail scanned to answer the query. */
  scannedBytes: number;
  /** Wall-clock execution time reported by Grail, in milliseconds. */
  executionMs: number;
  /** True when the query reached its scan-limit budget (results truncated). */
  limitHit: boolean;
}

/** Aggregate of one or more scan entries (a group, or the whole page). */
export interface ScanAggregate {
  scannedBytes: number;
  /** Longest single-query execution time in the set (queries run in parallel). */
  executionMs: number;
  limitHit: boolean;
  /** How many DQL queries contributed. */
  queryCount: number;
}

interface ScanReportDispatch {
  /** Register/update this query's scan entry, or clear it when `entry` is null. */
  report: (id: string, entry: ScanEntry | null) => void;
}

// Two contexts so the reporter (useScopedDql) can subscribe to a stable
// dispatch identity without re-rendering every time the entry map changes —
// only the badges/footer consume the mutable state.
const ScanReportDispatchContext = createContext<ScanReportDispatch | null>(null);
const ScanReportStateContext = createContext<Record<string, ScanEntry>>({});

export const ScanReportProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [entries, setEntries] = useState<Record<string, ScanEntry>>({});
  // Stable dispatch: identity never changes, so useScopedDql doesn't re-render
  // when the map updates.
  const dispatchRef = useRef<ScanReportDispatch>();
  if (!dispatchRef.current) {
    dispatchRef.current = {
      report: (id, entry) =>
        setEntries((prev) => {
          if (entry === null) {
            if (!(id in prev)) return prev;
            const next = { ...prev };
            delete next[id];
            return next;
          }
          const existing = prev[id];
          if (
            existing &&
            existing.group === entry.group &&
            existing.query === entry.query &&
            existing.scannedBytes === entry.scannedBytes &&
            existing.executionMs === entry.executionMs &&
            existing.limitHit === entry.limitHit
          ) {
            return prev; // no-op: identical entry
          }
          return { ...prev, [id]: entry };
        }),
    };
  }

  return (
    <ScanReportDispatchContext.Provider value={dispatchRef.current}>
      <ScanReportStateContext.Provider value={entries}>
        {children}
      </ScanReportStateContext.Provider>
    </ScanReportDispatchContext.Provider>
  );
};

/** The stable reporter (safe to call outside a provider — becomes a no-op). */
export const useScanReporter = (): ScanReportDispatch["report"] => {
  const dispatch = useContext(ScanReportDispatchContext);
  return useCallback(
    (id: string, entry: ScanEntry | null) => dispatch?.report(id, entry),
    [dispatch],
  );
};

/**
 * Aggregate a set of entries, deduplicating by query text first — two tiles
 * that read the same query (react-query serves the second from cache) share ONE
 * real scan, so counting it twice would inflate both the tile and the page
 * total. Execution time is the slowest single query (they run concurrently).
 */
const aggregate = (list: ScanEntry[]): ScanAggregate => {
  const byQuery = new Map<string, ScanEntry>();
  for (const e of list) {
    const cur = byQuery.get(e.query);
    if (!cur || e.scannedBytes > cur.scannedBytes) byQuery.set(e.query, e);
  }
  const uniq = [...byQuery.values()];
  return {
    scannedBytes: uniq.reduce((a, e) => a + e.scannedBytes, 0),
    executionMs: uniq.reduce((a, e) => Math.max(a, e.executionMs), 0),
    limitHit: uniq.some((e) => e.limitHit),
    queryCount: uniq.length,
  };
};

/** Every registered scan entry (for callers computing custom attribution). */
export const useScanEntries = (): ScanEntry[] => {
  const entries = useContext(ScanReportStateContext);
  return useMemo(() => Object.values(entries), [entries]);
};

/** Aggregate scan stats for one <ScanScope> group (null until any query lands). */
export const useScanGroup = (group: string | null): ScanAggregate | null => {
  const entries = useContext(ScanReportStateContext);
  return useMemo(() => {
    if (!group) return null;
    const list = Object.values(entries).filter((e) => e.group === group);
    return list.length > 0 ? aggregate(list) : null;
  }, [entries, group]);
};

/** Aggregate scan stats across every registered query (the page total). */
export const useScanTotal = (): ScanAggregate | null => {
  const entries = useContext(ScanReportStateContext);
  return useMemo(() => {
    const list = Object.values(entries);
    return list.length > 0 ? aggregate(list) : null;
  }, [entries]);
};

// --- ScanScope: tags every useScopedDql call in its subtree with a group ----

const ScanScopeContext = createContext<string | null>(null);

/** The group name any useScopedDql call in the subtree tags its scan entry with. */
export const useScanScope = (): string | null => useContext(ScanScopeContext);

/**
 * Names the scan group for every DQL query rendered beneath it, so a card's
 * scanned-data badge can sum exactly the queries that fed it. Wrap the card
 * *element* (not its inner chrome) so the card's data hooks — which run during
 * the card's own render — read this scope.
 */
export const ScanScope = ({
  name,
  children,
}: {
  name: string;
  children: React.ReactNode;
}) => (
  <ScanScopeContext.Provider value={name}>{children}</ScanScopeContext.Provider>
);

/**
 * Extract scan telemetry from a useScopedDql/useDql result. The scan limit is
 * injected PER FETCH, so a query with `fetchCount` budgeted fetches has an
 * aggregate budget of `fetchCount * scanLimitGb`. Grail reports one aggregate
 * `scannedBytes` across all fetches, so comparing it against a SINGLE-fetch
 * budget would falsely flag a multi-fetch query (e.g. a join) as truncated when
 * no individual fetch actually hit its cap. `scanLimitGb<=0` means unlimited; a
 * query that scanned ~all of its aggregate budget — or that Grail explicitly
 * flagged with a scan-limit notification — is treated as truncated.
 */
export const readScanMeta = (
  result: Pick<UseDqlResult<unknown>, "data">,
  scanLimitGb: number,
  fetchCount = 1,
): { scannedBytes: number; executionMs: number; limitHit: boolean } | null => {
  const grail = (
    result.data as
      | {
          metadata?: {
            grail?: {
              scannedBytes?: number;
              executionTimeMilliseconds?: number;
              notifications?: { notificationType?: string; severity?: string }[];
            };
          };
        }
      | undefined
  )?.metadata?.grail;
  if (!grail) return null;
  const scannedBytes = Number(grail.scannedBytes ?? 0);
  const executionMs = Number(grail.executionTimeMilliseconds ?? 0);
  const perFetchLimitBytes =
    scanLimitGb > 0 ? scanLimitGb * 1_000_000_000 : Infinity;
  const aggregateLimitBytes = Number.isFinite(perFetchLimitBytes)
    ? perFetchLimitBytes * Math.max(1, fetchCount)
    : Infinity;
  // Only a genuine scan-limit notification is authoritative — match 'scan'
  // specifically so an unrelated limit notification (e.g. maxResultRecords)
  // can't masquerade as a truncated scan.
  const notifiedScanLimit = (grail.notifications ?? []).some((n) =>
    /scan/i.test(n.notificationType ?? ""),
  );
  const limitHit =
    notifiedScanLimit ||
    (Number.isFinite(aggregateLimitBytes) &&
      scannedBytes >= aggregateLimitBytes * 0.98);
  return { scannedBytes, executionMs, limitHit };
};
