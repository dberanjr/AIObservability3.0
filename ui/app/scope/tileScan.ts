import type { ScanEntry, ScanAggregate } from "./ScanReportContext";

/**
 * How a tile-scan report resolves group titles and ownership priority.
 *
 * The defaults make ownership deterministic WITHOUT any page-specific table:
 * the inherited-from title is the raw group name and ties break by group name
 * (so any page can adopt scan pills by wrapping tiles in a uniquely-named
 * ScanScope). The Summary page passes its curated titles + priority — see
 * `pages/Summary/summaryScanGroups.ts` — to keep its hand-tuned attribution.
 */
export interface TileScanOpts {
  /** group id -> human title, used in the "inherits from …" note. */
  titleOf?: (group: string) => string;
  /** group id -> ownership priority; the lowest owns a shared query. */
  priorityOf?: (group: string) => number;
  /** what an ungrouped (null-group) query is attributed to; default: nothing. */
  ungroupedAs?: string;
}

/**
 * Aggregate scan entries, deduplicating by query text first — two tiles that
 * read the same query (react-query serves the second from cache) share ONE real
 * scan, so counting it twice would inflate the tile and page totals. Execution
 * time is the slowest single query (they run concurrently).
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

export interface TileScanReport {
  /** Scan stats for the queries this tile OWNS (null if it owns none). */
  owned: ScanAggregate | null;
  /** Titles of the tiles this tile inherits shared query results from. */
  inheritedFrom: string[];
  /** True if any query behind this tile hit its scan-limit budget. */
  limitHit: boolean;
}

/**
 * Split a tile's queries into the ones it owns (unique to it, or highest
 * priority) and the ones it inherits from another tile via the shared query
 * cache. Drives the per-tile scan badge (owned) and the "inherits from …" note
 * (inherited). Ownership is a pure function of the entry set + opts, so the
 * per-tile owned bytes partition the deduplicated page total exactly.
 */
export const computeTileReport = (
  entries: ScanEntry[],
  group: string | null,
  opts?: TileScanOpts,
): TileScanReport => {
  if (!group) return { owned: null, inheritedFrom: [], limitHit: false };
  const titleOf = opts?.titleOf ?? ((g: string) => g);
  const priorityOf = opts?.priorityOf ?? (() => 0);
  const ungroupedAs = opts?.ungroupedAs ?? "";
  const normGroup = (g: string | null): string => g ?? ungroupedAs;

  // Which groups use each query, and therefore who can own it.
  const usersOf = new Map<string, Set<string>>();
  for (const e of entries) {
    const g = normGroup(e.group);
    if (!g) continue; // ungrouped and no ungroupedAs → attributed to no tile
    if (!usersOf.has(e.query)) usersOf.set(e.query, new Set());
    usersOf.get(e.query)!.add(g);
  }
  const ownerOf = new Map<string, string>();
  for (const [q, users] of usersOf) {
    let owner = "";
    let bestP = Infinity;
    for (const g of users) {
      const p = priorityOf(g);
      // Lowest priority owns; ties break by smallest group id (deterministic).
      if (owner === "" || p < bestP || (p === bestP && g < owner)) {
        bestP = p;
        owner = g;
      }
    }
    ownerOf.set(q, owner);
  }

  const mine = entries.filter((e) => normGroup(e.group) === group);
  const ownedEntries = mine.filter((e) => ownerOf.get(e.query) === group);
  const inheritedOwners = [
    ...new Set(
      mine
        .filter((e) => ownerOf.get(e.query) !== group)
        .map((e) => ownerOf.get(e.query)!)
        .filter((g) => g && g !== group),
    ),
  ];

  return {
    owned: ownedEntries.length > 0 ? aggregate(ownedEntries) : null,
    inheritedFrom: inheritedOwners.map((g) => titleOf(g)),
    limitHit: mine.some((e) => e.limitHit),
  };
};
