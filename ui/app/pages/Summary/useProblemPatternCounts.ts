import { useMemo } from "react";
import type { ResultRecord } from "@dynatrace-sdk/client-query";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import {
  useResolvedServices,
  canQueryScope,
} from "../../scope/useResolvedServices";
import { extrapolate, useSampling } from "../../scope/SamplingContext";
import {
  FOCUS_PREDICATES,
  CROSS_SPAN_FOCUS,
} from "../Prompts/focus";
import { buildSameSpanPatternCountsQuery, patternAlias } from "./queries";

/**
 * The 4 cross-span detectors, in a fixed order so their resolver queries map to
 * a fixed set of hook calls (hooks can't run in a loop). Each id also exists in
 * `CROSS_SPAN_FOCUS` — this array just pins call order.
 */
const CROSS_SPAN_IDS = [
  "tool-retry-storm",
  "agent-n1-tool-calls",
  "vdb-topk-over-retrieval",
  "mem-history-growth",
] as const;

/** Resolver row cap. Trace counts for these detectors sit in the tens/low
 *  hundreds on real tenants; a 2000 ceiling counts them exactly and only flags
 *  `truncated` in the (unrealistic) event it's exceeded. */
const COUNT_CAP = 2000;

export type PatternClass = "same-span" | "cross-span";

export interface ProblemPatternCount {
  /** The `?focus` id — drills to Prompts with this focus preset. */
  id: string;
  label: string;
  cls: PatternClass;
  count: number;
  /** Proxy signal (cross-span only) — surfaced with an "≈" marker. */
  approximate: boolean;
  /** The resolver hit the row cap — the count is a floor. */
  truncated: boolean;
}

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
 * scan-limit / filter apply. Clicking a pattern drills to Prompts with `?focus`.
 */
export const useProblemPatternCounts = (): UseProblemPatternCountsResult => {
  const { scope } = useScope();
  const { samplingRatio } = useSampling();
  const resolution = useResolvedServices();
  const { serviceIds } = resolution;
  const canQuery = canQueryScope(resolution);
  const opts = { enabled: canQuery, staleTime: 60_000 } as const;

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
    const patterns: ProblemPatternCount[] = [];

    // Same-span: one row per FOCUS_PREDICATES entry, count extrapolated for
    // sampling (countIf is a count aggregate).
    const sameRow = sameSpan.data?.records?.[0] as
      | Record<string, number>
      | undefined;
    for (const [id, preset] of Object.entries(FOCUS_PREDICATES)) {
      const raw = sameRow?.[patternAlias(id)];
      patterns.push({
        id,
        label: preset.label,
        cls: "same-span",
        count: Math.round(extrapolate(raw, samplingRatio) ?? 0),
        approximate: false,
        truncated: false,
      });
    }

    // Cross-span: count resolved traces (resolver returns cap+1 rows so we can
    // flag truncation). Trace counts aren't extrapolated — the resolver runs
    // over the trace population, and the ranking is what matters.
    for (const id of CROSS_SPAN_IDS) {
      const preset = CROSS_SPAN_FOCUS[id];
      const records = crossResults[id].data?.records ?? [];
      const truncated = records.length > COUNT_CAP;
      patterns.push({
        id,
        label: preset.label,
        cls: "cross-span",
        count: Math.min(records.length, COUNT_CAP),
        approximate: Boolean(preset.approximate),
        truncated,
      });
    }

    patterns.sort((a, b) => b.count - a.count);

    const isLoading =
      sameSpan.isLoading ||
      Object.values(crossResults).some((r) => r.isLoading);
    const error =
      sameSpan.error ??
      Object.values(crossResults).find((r) => r.error)?.error ??
      undefined;

    return { patterns, isLoading, error };
  }, [sameSpan.data, sameSpan.isLoading, sameSpan.error, crossResults, samplingRatio]);
};
