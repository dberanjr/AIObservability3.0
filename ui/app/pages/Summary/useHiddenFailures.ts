import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import {
  useResolvedServices,
  canQueryScope,
} from "../../scope/useResolvedServices";
import { useSampling } from "../../scope/SamplingContext";
import { buildHiddenFailuresQuery } from "./queries";
import { computeHiddenFailures, type HiddenRecord, type HiddenCategory } from "./parse";
import { DEMO_HIDDEN_FAILURES } from "./demoData";

export type { HiddenRecord, HiddenCategory };

export interface HiddenFailures {
  categories: HiddenCategory[];
  total: number;
  isLoading: boolean;
  error?: Error;
}

/**
 * The "Hidden · 200-OK" donut source: HTTP-200 responses that are really
 * failures, split into refusals / max-token truncation / content-filter blocks
 * (plus an "other" provider/guardrail bucket when present). Counts are sampled
 * aggregates, so they extrapolate back to the unsampled population like the rest
 * of the app. Routes through useScopedDql → global timeframe, segments,
 * scan-limit, and the global trace filter all apply. Drills to Explorer. The
 * fold itself (`computeHiddenFailures`) lives in `./parse`, shared with
 * `demoData.ts`'s `DEMO_HIDDEN_FAILURES`.
 *
 * `showExample` (default false, mirrors useGuardrails.ts) renders the Demo
 * Mode dataset instead of querying Grail — passed down from the Summary page
 * (both HiddenFailuresCard and PostureBand call this hook).
 */
export const useHiddenFailures = (showExample = false): HiddenFailures => {
  const { scope } = useScope();
  const { samplingRatio } = useSampling();
  const resolution = useResolvedServices();
  const { serviceIds } = resolution;
  const canQuery = canQueryScope(resolution);

  const q = useScopedDql<HiddenRecord>(
    canQuery ? buildHiddenFailuresQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery && !showExample, staleTime: 60_000 },
  );

  return useMemo<HiddenFailures>(() => {
    if (showExample) {
      return { ...DEMO_HIDDEN_FAILURES, isLoading: false, error: undefined };
    }
    const core = computeHiddenFailures(q.data?.records?.[0], samplingRatio);
    return {
      ...core,
      isLoading: q.isLoading,
      error: q.error ?? undefined,
    };
  }, [showExample, q.data, q.isLoading, q.error, samplingRatio]);
};
