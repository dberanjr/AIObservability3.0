/**
 * RAG / vector-database rollup for the Explorer RAG panel. Reads retrieval
 * attributes the app doesn't otherwise consume: db.system and vector_db.*
 * (query text, results, top_k). Query counts are extrapolated by the active
 * sampling ratio; avg top_k is sampling-invariant.
 */

import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useSampling } from "../../scope/SamplingContext";
import { dqlTimeArg } from "../../scope/queries";
import { dbSystemIsVectorStore } from "../../detection/attributeFields";
import { toNum } from "../../data/format";

interface RagRecord {
  system?: string;
  queries?: number | string;
  avg_top_k?: number | string;
}

export interface RagStore {
  system: string;
  queries: number;
  avgTopK: number;
}

export interface UseRagResult {
  stores: RagStore[];
  totalQueries: number;
  storeCount: number;
  avgTopK: number;
  isLoading: boolean;
  error?: Error;
}

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

const buildQuery = (from: string, to: string): string =>
  `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(from)}, to: ${dqlTimeArg(to)}
| filter ${dbSystemIsVectorStore()} or isNotNull(\`vector_db.query.text\`) or isNotNull(\`vector_db.results\`) or isNotNull(\`vector_db.query.top_k\`)
| summarize {
    queries = count(),
    avg_top_k = avg(toDouble(\`vector_db.query.top_k\`))
  }, by: { system = coalesce(toString(\`db.system\`), "unknown") }
| sort queries desc
| limit 8
`.trim();

export const useRag = (): UseRagResult => {
  const { scope } = useScope();
  const { samplingRatio } = useSampling();
  const from = scope.timeframe.from;
  const to = scope.timeframe.to ?? "now()";
  const { data, isLoading, error } = useScopedDql<RagRecord>(
    useMemo(() => buildQuery(from, to), [from, to]),
    { staleTime: 60_000 },
  );

  return useMemo<UseRagResult>(() => {
    const stores: RagStore[] = (data?.records ?? [])
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
      isLoading,
      error: error ?? undefined,
    };
  }, [data, isLoading, error, samplingRatio]);
};
