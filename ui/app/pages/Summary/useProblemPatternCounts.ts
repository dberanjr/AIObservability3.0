import { useMemo } from "react";
import type { ResultRecord } from "@dynatrace-sdk/client-query";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import {
  useResolvedServices,
  canQueryScope,
} from "../../scope/useResolvedServices";
import { useSampling } from "../../scope/SamplingContext";
import { CROSS_SPAN_FOCUS } from "../Prompts/focus";
import { buildSameSpanPatternCountsQuery } from "./queries";
import {
  computeProblemPatternCounts,
  CROSS_SPAN_IDS,
  type ProblemPatternCount,
  type PatternClass,
} from "./parse";
import { DEMO_PROBLEM_PATTERNS } from "./demoData";

export type { ProblemPatternCount, PatternClass };

/** Resolver row cap — mirrors `./parse`'s `COUNT_CAP` (kept private there). */
const COUNT_CAP = 2000;

export interface UseProblemPatternCountsResult {
  patterns: ProblemPatternCount[];
  isLoading: boolean;
  error?: Error;
}

/**
 * Match counts for every architecture problem pattern, ranked by volume — the
 * data behind the Summary "Problem patterns" detector list. Reuses the REAL
 * detector definitions so nothing drifts from the Prompts sidebar / Pulse
 * drill-downs:
 *   - the 7 same-span predicates are counted in one `countIf` scan built from
 *     `FOCUS_PREDICATES`;
 *   - the 4 cross-span detectors are counted by running their own trace
 *     resolvers from the CROSS_SPAN_FOCUS registry (thresholds and signals
 *     unchanged) and counting the resolved traces.
 * All queries route through useScopedDql → global timeframe / segments /
 * scan-limit / filter apply. Clicking a pattern drills to Prompts with
 * `?focus`. The fold itself (`computeProblemPatternCounts`) lives in
 * `./parse`, shared with `demoData.ts`'s `DEMO_PROBLEM_PATTERNS`.
 *
 * `showExample` (default false, mirrors useGuardrails.ts) renders the Demo
 * Mode dataset instead of querying Grail — passed down from the Summary page.
 * No other page calls this Summary-only hook.
 */
export const useProblemPatternCounts = (
  showExample = false,
): UseProblemPatternCountsResult => {
  const { scope } = useScope();
  const { samplingRatio } = useSampling();
  const resolution = useResolvedServices();
  const { serviceIds } = resolution;
  const canQuery = canQueryScope(resolution);
  const opts = { enabled: canQuery && !showExample, staleTime: 60_000 } as const;

  const sameSpan = useScopedDql<ResultRecord>(
    canQuery ? buildSameSpanPatternCountsQuery(serviceIds, scope.timeframe) : "",
    opts,
  );

  // One useScopedDql per cross-span resolver (fixed order → fixed hook calls).
  const retryStorm = useScopedDql<ResultRecord>(
    canQuery
      ? CROSS_SPAN_FOCUS["tool-retry-storm"].buildResolveQuery(
          scope.timeframe,
          COUNT_CAP,
        )
      : "",
    opts,
  );
  const n1Calls = useScopedDql<ResultRecord>(
    canQuery
      ? CROSS_SPAN_FOCUS["agent-n1-tool-calls"].buildResolveQuery(
          scope.timeframe,
          COUNT_CAP,
        )
      : "",
    opts,
  );
  const topK = useScopedDql<ResultRecord>(
    canQuery
      ? CROSS_SPAN_FOCUS["vdb-topk-over-retrieval"].buildResolveQuery(
          scope.timeframe,
          COUNT_CAP,
        )
      : "",
    opts,
  );
  const historyGrowth = useScopedDql<ResultRecord>(
    canQuery
      ? CROSS_SPAN_FOCUS["mem-history-growth"].buildResolveQuery(
          scope.timeframe,
          COUNT_CAP,
        )
      : "",
    opts,
  );

  const crossResults = useMemo(
    () => ({
      "tool-retry-storm": retryStorm,
      "agent-n1-tool-calls": n1Calls,
      "vdb-topk-over-retrieval": topK,
      "mem-history-growth": historyGrowth,
    }),
    [retryStorm, n1Calls, topK, historyGrowth],
  );

  return useMemo<UseProblemPatternCountsResult>(() => {
    if (showExample) {
      return { patterns: DEMO_PROBLEM_PATTERNS, isLoading: false, error: undefined };
    }
    const sameRow = sameSpan.data?.records?.[0] as
      | Record<string, number>
      | undefined;
    const crossSpanCounts = Object.fromEntries(
      CROSS_SPAN_IDS.map((id) => [id, crossResults[id].data?.records?.length ?? 0]),
    );
    const patterns = computeProblemPatternCounts(sameRow, crossSpanCounts, samplingRatio);

    const isLoading =
      sameSpan.isLoading ||
      Object.values(crossResults).some((r) => r.isLoading);
    const error =
      sameSpan.error ??
      Object.values(crossResults).find((r) => r.error)?.error ??
      undefined;

    return { patterns, isLoading, error };
  }, [showExample, sameSpan.data, sameSpan.isLoading, sameSpan.error, crossResults, samplingRatio]);
};
