/**
 * Pure record → {stores, totals} folding for the RAG/vector-database panel
 * (`useRag`'s query). Extracted into its own React-free module so both the
 * hook AND `demoData.ts` / its test can import the exact same fold function —
 * mirrors `foldHeatmap.ts` / `parseAIServices.ts` in this same directory.
 */

import { toNum } from "../../data/format";

/** One row returned by the RAG rollup query. */
export interface RagRecord {
  system?: string;
  queries?: number | string;
  avg_top_k?: number | string;
}

export interface RagStore {
  system: string;
  queries: number;
  avgTopK: number;
}

export interface FoldedRag {
  stores: RagStore[];
  totalQueries: number;
  storeCount: number;
  avgTopK: number;
}

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

/** Fold raw RAG rollup rows into UI-ready stores + fleet totals. `queries` is
 *  extrapolated by `samplingRatio` (1 = no sampling); `avgTopK` is
 *  sampling-invariant. Pure — reused by both `useRag` (real data) and
 *  `demoData.ts` (canned fixtures). */
export const foldRagRecords = (
  records: RagRecord[],
  samplingRatio: number,
): FoldedRag => {
  const stores: RagStore[] = records
    .filter((r) => r.system)
    .map((r) => ({
      system: r.system as string,
      queries: num(r.queries) * samplingRatio,
      avgTopK: num(r.avg_top_k),
    }));
  const totalQueries = stores.reduce((a, s) => a + s.queries, 0);
  const weightedTopK = stores.reduce((a, s) => a + s.avgTopK * s.queries, 0);
  return {
    stores,
    totalQueries,
    storeCount: stores.length,
    avgTopK: totalQueries > 0 ? weightedTopK / totalQueries : 0,
  };
};
