import { useEffect, useId, useMemo } from "react";
import {
  useDql,
  type DqlQueryParams,
  type UseDqlOptions,
  type UseDqlResult,
} from "@dynatrace-sdk/react-hooks";
import { useSegments } from "@dynatrace/strato-components/filters";
import type { ResultRecord } from "@dynatrace-sdk/client-query";
import { useScanLimit } from "./ScanLimitContext";
import { useSampling } from "./SamplingContext";
import { useGlobalFilters } from "./GlobalFilterContext";
import { useTraceScope } from "./TraceScopeContext";
import {
  readScanMeta,
  useScanReporter,
  useScanScope,
} from "./ScanReportContext";
import { useTweaks } from "../tweaks/TweaksContext";
import {
  injectBucketFilter,
  injectGlobalFilters,
  injectTraceScope,
  parseBuckets,
  partitionConditions,
} from "./queries";
import { injectScanLimit } from "./dqlScanLimit";

const SAMPLING_RE = /samplingRatio:\s*\d+/g;
// Matches `fetch spans` / `fetch logs` followed by a comma, ONLY when the
// statement (up to the next `|` pipe) does not already declare a samplingRatio.
// Used to retro-inject samplingRatio into queries that forgot to include one.
const FETCH_NEEDS_SAMPLING_RE =
  /\bfetch\s+(spans|logs)\s*,(?![^|]*\bsamplingRatio\b)/g;

const applySampling = (query: string, samplingRatio: number): string => {
  if (!query) return query;
  // First inject `samplingRatio: 1` only where missing, then rewrite every
  // occurrence to the user-selected value. Two passes keep injection
  // idempotent against queries that already declare a sampling ratio.
  const injected = query.replace(
    FETCH_NEEDS_SAMPLING_RE,
    `fetch $1, samplingRatio: 1,`,
  );
  return injected.replace(SAMPLING_RE, `samplingRatio: ${samplingRatio}`);
};

/**
 * Extra options layered onto useDql's own options. The scan limit is ALWAYS the
 * toolbar selector (injected into every query) — there is no per-query opt-out,
 * so no query can hardcode or escape the user's scan-limit choice.
 */
export interface UseScopedDqlExtra {
  /**
   * Opt this query out of the global attribute filter injection. Use for
   * queries that must see unfiltered data (e.g. filter value discovery) or
   * where a span-level filter would break the query semantics (e.g. the agent
   * trace-join, whose first stage must keep both agent and LLM spans).
   */
  ignoreGlobalFilter?: boolean;
  /**
   * Opt this query out of the app-wide span-bucket filter tweak (the
   * `| filter in(dt.system.bucket, {...})` injection). Used by the AI-bucket
   * detection query, which must scan ALL buckets to find where AI spans live,
   * regardless of the user's current bucket selection.
   */
  ignoreBucketFilter?: boolean;
  /**
   * Opt this query out of the active platform Segments (the `filterSegments`
   * request param). Unlike `ignoreGlobalFilter`, this ALSO suppresses segments —
   * used by the bucket-detection query so it is immune to both the bucket tweak
   * and any active segment while still honouring timeframe/scan-limit/sampling.
   */
  ignoreSegments?: boolean;
  /**
   * Force this query's sampling ratio instead of the toolbar selection. Used by
   * heavy multi-window background estimates (e.g. the 8-day spend glance) that
   * scan multiple TB per window and cannot complete within the platform's query
   * execution-time limit at full fidelity on high-volume tenants. The caller is
   * responsible for extrapolating its sum/count aggregates by the same ratio.
   * Sum-aggregate estimates extrapolate cleanly; never use this for queries the
   * user expects at the exact fidelity they selected.
   */
  samplingRatioOverride?: number;
}

/**
 * Drop-in replacement for `useDql` that injects:
 *   - the global scan-limit (injected into every fetch; no query hardcodes it)
 *   - the global sampling ratio (rewrites `samplingRatio: N` in the query)
 *   - the active filter segments (passed as a request parameter, not in DQL)
 *
 * Same signature and return shape as `useDql`. Segments are only attached
 * when at least one is selected — otherwise the underlying call uses the
 * plain string form so query keys stay stable.
 */
export function useScopedDql<T = ResultRecord>(
  query: string,
  options?: UseDqlOptions<T> & UseScopedDqlExtra,
): UseDqlResult<T> {
  const { scanLimitGb } = useScanLimit();
  const { samplingRatio } = useSampling();
  const { segments } = useSegments();
  const { filters } = useGlobalFilters();
  const { traceIds, hasScopeConditions, isResolving } = useTraceScope();
  const { bucketFilterEnabled, bucketFilterText } = useTweaks().pageConfig;
  const ignoreGlobalFilter = Boolean(options?.ignoreGlobalFilter);
  const ignoreBucketFilter = Boolean(options?.ignoreBucketFilter);
  const ignoreSegments = Boolean(options?.ignoreSegments);
  // A per-query override wins over the toolbar ratio (used by heavy background
  // estimates that can't run at full fidelity — see UseScopedDqlExtra).
  const effectiveSampling = options?.samplingRatioOverride ?? samplingRatio;

  // Split the active conditions: the DIRECT subset (model/service/…) is injected
  // per span; the SCOPE subset (agent/tool) is resolved to trace.ids by
  // TraceScopeContext and injected as `in(trace.id, …)`.
  const directConditions = useMemo(
    () => partitionConditions(filters.conditions).direct,
    [filters.conditions],
  );
  const buckets = useMemo(
    () => parseBuckets(bucketFilterText),
    [bucketFilterText],
  );

  const queryInput = useMemo<string | DqlQueryParams>(() => {
    // Sampling first (may inject samplingRatio, adding the comma the scan-limit
    // injector keys on), then the scan limit, then the hybrid global filter.
    const sampled = applySampling(query, effectiveSampling);
    const scanned = injectScanLimit(sampled, scanLimitGb);
    // HYBRID injection (unless the caller opted out):
    //  - DIRECT subset → `| filter in(toString(attr), array(...))` on the
    //    page's own spans. Uncapped and exact, no trace-id materialisation, so
    //    no DQL expression-limit crash on busy attributes (model, service, …).
    //  - SCOPE subset → `| filter in(trace.id, array(toUid(...)))` from the
    //    resolved trace.ids, so a cross-span entity filter (agent/tool) reaches
    //    pages built on OTHER span types (e.g. agent → Prompts LLM spans).
    // Both AND together when both subsets are active.
    let rewritten = scanned;
    // App-wide span-bucket pruning (Tweaks). Injected right after the scan
    // limit so the `dt.system.bucket` partition filter sits directly on each
    // `fetch spans`, pruning the scan before any other pipe.
    if (bucketFilterEnabled && !ignoreBucketFilter && buckets.length > 0) {
      rewritten = injectBucketFilter(rewritten, buckets);
    }
    if (!ignoreGlobalFilter) {
      rewritten = injectGlobalFilters(rewritten, { conditions: directConditions });
      if (hasScopeConditions) {
        rewritten = injectTraceScope(rewritten, traceIds);
      }
    }
    if (!rewritten) return rewritten;
    if (ignoreSegments || !segments || segments.length === 0) return rewritten;
    return {
      query: rewritten,
      // Strato's useSegments returns QueryFilterSegment[] which is exactly
      // what ExecuteRequest.filterSegments expects.
      filterSegments: segments,
    };
  }, [
    query,
    scanLimitGb,
    effectiveSampling,
    segments,
    ignoreGlobalFilter,
    ignoreBucketFilter,
    ignoreSegments,
    bucketFilterEnabled,
    buckets,
    directConditions,
    hasScopeConditions,
    traceIds,
  ]);

  // The direct subset is synchronous (no resolver), so the common no-scope case
  // is never gated. Only gate while a SCOPE condition is actively resolving its
  // trace.ids — firing the page query before resolution would scope to the
  // wrong (stale/empty) id set. `ignoreGlobalFilter` queries are never gated.
  const callerEnabled = options?.enabled ?? true;
  const enabled =
    callerEnabled &&
    !(!ignoreGlobalFilter && hasScopeConditions && isResolving);

  // `ignoreGlobalFilter` is an extra key useDql ignores; forward options as-is.
  const result = useDql<T>(queryInput, { ...options, enabled });

  // Scan telemetry: report every query's Grail scan stats (scanned bytes, exec
  // time, and whether it reached the scan-limit budget) to the ScanReport
  // aggregator, tagged with the nearest ScanScope group. Collected ALWAYS — it's
  // cheap (the metadata rides along on the response we already have) — so the
  // footer can warn about truncated / partial results app-wide, not only when
  // the scan-debug toggle is on. The verbose per-tile badges and the neon page
  // pill still gate their DISPLAY on the scanStats tweak (see TileScanFooter /
  // PageScanTotal); this only ungates the underlying signal.
  const report = useScanReporter();
  const group = useScanScope();
  const queryId = useId();
  // The scan limit is injected onto EVERY fetch, so count the budgeted fetches
  // and compare the query's aggregate scannedBytes against the aggregate
  // (fetchCount x per-fetch) budget — otherwise a multi-fetch query (e.g. a
  // join) trips a false "scan limit hit" purely from its summed bytes.
  const injectedQuery =
    typeof queryInput === "string" ? queryInput : (queryInput?.query ?? "");
  const fetchCount = (injectedQuery.match(/scanLimitGBytes:/g) ?? []).length || 1;
  const meta = readScanMeta(result, scanLimitGb, fetchCount);
  const hasMeta = meta != null;
  const scannedBytes = meta?.scannedBytes ?? 0;
  const executionMs = meta?.executionMs ?? 0;
  const limitHit = meta?.limitHit ?? false;
  // Identity for dedup = the ACTUALLY-executed query (post sampling/scan-limit/
  // filter injection), not the raw builder text. Two tiles running the same
  // execution share react-query's cache (one real scan) and collapse to one
  // entry; two executions that differ only by an injected sampling ratio stay
  // distinct. Mirrors react-query's own key, so the scan total can't double- or
  // under-count.
  const executedQuery =
    typeof queryInput === "string" ? queryInput : (queryInput?.query ?? query);
  useEffect(() => {
    if (!hasMeta) {
      report(queryId, null);
      return;
    }
    report(queryId, { group, query: executedQuery, scannedBytes, executionMs, limitHit });
    return () => report(queryId, null);
  }, [hasMeta, group, executedQuery, scannedBytes, executionMs, limitHit, queryId, report]);

  return result;
}
