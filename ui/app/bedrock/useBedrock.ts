/**
 * Bedrock data hooks: an existence probe (used to gate the Bedrock nav/page)
 * and the overview totals hook for the top-of-page summary card.
 *
 * Both queries are log queries with no `gen_ai.*` span attributes, so they
 * bypass the span-only injectors (global filter, bucket-filter tweak,
 * segments) via the three `ignore*` flags — mirrors the pattern in
 * useGuardrails.ts, whose queries are metric timeseries for the same reason.
 */

import { useMemo } from "react";
import type { ResultRecord } from "@dynatrace-sdk/client-query";
import { useScopedDql } from "../scope/useScopedDql";
import { useScope } from "../scope/ScopeContext";
import type { BedrockScope } from "./types";
import { buildBedrockOverviewQuery } from "./queries";
import { parseOverview, type OverviewTotals } from "./parse";

const IGNORE = { ignoreGlobalFilter: true, ignoreBucketFilter: true, ignoreSegments: true, staleTime: 60_000 } as const;

/** Cheap existence probe: any bedrock log group in the last 24h. */
export const useBedrockAvailable = (): { available: boolean; isLoading: boolean } => {
  const q = `fetch logs, from: now()-24h\n| filter contains(dt.da.aws.log_group, "bedrock")\n| limit 1\n| fields timestamp`;
  const res = useScopedDql<ResultRecord>(q, IGNORE);
  return { available: (res.data?.records?.length ?? 0) > 0, isLoading: res.isLoading };
};

export const useBedrockOverview = (
  scope: BedrockScope,
): { totals: OverviewTotals; isLoading: boolean; error?: Error } => {
  const res = useScopedDql<ResultRecord>(buildBedrockOverviewQuery(scope), IGNORE);
  return useMemo(
    () => ({
      totals: parseOverview(res.data?.records ?? []),
      isLoading: res.isLoading,
      error: res.error ?? undefined,
    }),
    [res.data, res.isLoading, res.error],
  );
};

export { useScope }; // re-export for page convenience
