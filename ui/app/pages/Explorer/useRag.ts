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
import { foldRagRecords, type RagRecord, type RagStore } from "./parseRag";
import { DEMO_RAG_RECORDS } from "./demoData";

// Re-exported so existing call sites keep importing the record/store shape
// and the pure fold from this hook module; the implementation lives in the
// React-free ./parseRag so demoData.ts (and its test) can reuse the exact
// same fold function without pulling in React/DOM-dependent imports.
export type { RagRecord, RagStore };

export interface UseRagResult {
  stores: RagStore[];
  totalQueries: number;
  storeCount: number;
  avgTopK: number;
  isLoading: boolean;
  error?: Error;
}

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

/**
 * `showExample` defaults to false so the Agents page's
 * `AgentContextStoresSubview` (the other caller of this shared hook) is
 * completely unaffected — only Explorer's RAG panel passes it, computed from
 * ExplorerPage's own Demo Mode / no-telemetry `showExample` flag (mirrors
 * `useGuardrails`' `showExample` parameter).
 */
export const useRag = (showExample = false): UseRagResult => {
  const { scope } = useScope();
  const { samplingRatio } = useSampling();
  const from = scope.timeframe.from;
  const to = scope.timeframe.to ?? "now()";
  const { data, isLoading, error } = useScopedDql<RagRecord>(
    useMemo(() => buildQuery(from, to), [from, to]),
    { staleTime: 60_000, enabled: !showExample },
  );

  return useMemo<UseRagResult>(() => {
    // Demo fixtures fold at a fixed ratio of 1 (no sampling) so the canned
    // dataset stays deterministic regardless of the toolbar's sampling
    // selector — mirrors Bedrock's demoData samplingRatioOverride:1 trick.
    const folded = showExample
      ? foldRagRecords(DEMO_RAG_RECORDS, 1)
      : foldRagRecords(data?.records ?? [], samplingRatio);
    return {
      ...folded,
      isLoading: showExample ? false : isLoading,
      error: showExample ? undefined : (error ?? undefined),
    };
  }, [showExample, data, isLoading, error, samplingRatio]);
};
