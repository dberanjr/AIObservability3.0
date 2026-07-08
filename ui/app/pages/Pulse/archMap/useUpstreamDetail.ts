/**
 * Data for the "upstream services" detail modal: every monitored caller of
 * the in-scope AI footprint, their RED metrics, a per-caller P90 latency
 * timeseries, and the AI services (with their agent/tool/model components)
 * each caller reaches. Mirrors useClientUpstream's query-wiring pattern but
 * assembles a richer caller↔service graph (via assembleUpstreamGraph) instead
 * of a flat service list.
 *
 * Chain: AI service ids (scope-aware spans) → Smartscape caller↔service edge
 * PAIRS (so the graph can draw per-edge fan-out, not just a caller count) →
 * RED + P90 timeseries for those caller ids, plus a components rollup per AI
 * service (filtered by id, so plain useDql — same reasoning as
 * useClientUpstream: injecting the AI scope filter would exclude callers).
 */
import { useMemo } from "react";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { useScopedDql } from "../../../scope/useScopedDql";
import { useScope } from "../../../scope/ScopeContext";
import { useGlobalFilters } from "../../../scope/GlobalFilterContext";
import {
  useResolvedServices,
  canQueryScope,
} from "../../../scope/useResolvedServices";
import { useScanGroup, useScanScope } from "../../../scope/ScanReportContext";
import { parseScopeMs } from "../../../scope/chartInterval";
import { buildAiServiceIdsQuery } from "../../Agents/queries";
import { buildUpstreamRedQuery } from "./clientUpstreamQueries";
import {
  buildUpstreamEdgePairsQuery,
  buildUpstreamP90SeriesQuery,
  buildServiceComponentsQuery,
} from "./upstreamDetailQueries";
import { assembleUpstreamGraph, type UpstreamGraph } from "./upstreamGraph";

export interface UpstreamDetail {
  graph: UpstreamGraph;
  p90Series: Map<string, (number | null)[]>;
  labels: string[];
  isLoading: boolean;
  error?: Error;
  limitHit: boolean;
}

interface IdRec {
  svc?: string;
}
interface EdgeRec {
  upstreamId?: string;
  upstream?: string;
  aiServiceId?: string;
  aiService?: string;
}
interface RedRec {
  svcId?: string;
  svc?: string;
  requests?: number;
  errors?: number;
  p90ns?: number;
  p95ns?: number;
}
interface P90Rec {
  svcId?: string;
  p90ns?: (number | null)[] | null;
}
interface CompRec {
  svcId?: string;
  agents?: (string | null)[];
  tools?: (string | null)[];
  models?: (string | null)[];
}

const EMPTY_GRAPH: UpstreamGraph = { callers: [], services: [], edges: [] };

/**
 * Relative-time x-axis labels ("just now" / "Xm ago" / "Xh ago" / "Xd ago")
 * for the P90-over-time chart. Replicates the historical-position formatting
 * of `buildLabels` in TokenConsumptionChart.tsx (that helper isn't exported,
 * and this hook has no forecast concept, so only the historical half is
 * needed here) — bucket `i` is `totalMs - i * intervalMs` ago, with the
 * newest bucket last.
 */
const buildRelativeLabels = (bucketCount: number, intervalMs: number): string[] => {
  const totalMs = bucketCount * intervalMs;
  const out: string[] = [];
  for (let i = 0; i < bucketCount; i++) {
    const agoMs = totalMs - i * intervalMs;
    if (agoMs < 60_000) out.push("just now");
    else if (agoMs < 3_600_000) out.push(`${Math.round(agoMs / 60_000)}m ago`);
    else if (agoMs < 86_400_000) out.push(`${Math.round(agoMs / 3_600_000)}h ago`);
    else out.push(`${Math.round(agoMs / 86_400_000)}d ago`);
  }
  return out;
};

export const useUpstreamDetail = (enabled: boolean): UpstreamDetail => {
  const { scope } = useScope();
  const { filters } = useGlobalFilters();
  const resolution = useResolvedServices();
  const canQuery = enabled && canQueryScope(resolution);
  const limitHit = useScanGroup(useScanScope())?.limitHit ?? false;

  // 1 — AI service entity ids (scope/filter aware).
  const idsResult = useScopedDql<IdRec>(
    canQuery
      ? buildAiServiceIdsQuery(resolution.serviceIds, scope.timeframe, filters)
      : "",
    { enabled: canQuery, staleTime: 60_000 },
  );
  const aiServiceIds = useMemo(
    () =>
      (idsResult.data?.records ?? [])
        .map((r) => r.svc)
        .filter((s): s is string => typeof s === "string" && s.length > 0),
    [idsResult.data],
  );

  // 2 — Smartscape caller→AI-service edge pairs. Topology is global → plain useDql.
  const edgesEnabled = enabled && aiServiceIds.length > 0;
  const edgesResult = useDql<EdgeRec>(
    edgesEnabled ? buildUpstreamEdgePairsQuery(aiServiceIds) : "",
    { enabled: edgesEnabled, staleTime: 60_000 },
  );
  const callerIds = useMemo(
    () =>
      Array.from(
        new Set(
          (edgesResult.data?.records ?? [])
            .map((r) => r.upstreamId)
            .filter((s): s is string => typeof s === "string" && s.length > 0),
        ),
      ),
    [edgesResult.data],
  );

  // 3 — RED metrics per caller (filtered by id → plain useDql).
  const callersEnabled = enabled && callerIds.length > 0;
  const redResult = useDql<RedRec>(
    callersEnabled ? buildUpstreamRedQuery(callerIds, scope.timeframe) : "",
    { enabled: callersEnabled, staleTime: 60_000 },
  );

  // 4 — P90 latency timeseries per caller.
  const p90Result = useDql<P90Rec>(
    callersEnabled
      ? buildUpstreamP90SeriesQuery(callerIds, scope.timeframe)
      : "",
    { enabled: callersEnabled, staleTime: 60_000 },
  );

  // 5 — per-AI-service component rollup (agents / tools / models).
  const componentsEnabled = enabled && aiServiceIds.length > 0;
  const componentsResult = useDql<CompRec>(
    componentsEnabled
      ? buildServiceComponentsQuery(aiServiceIds, scope.timeframe)
      : "",
    { enabled: componentsEnabled, staleTime: 60_000 },
  );

  // windowMinutes: length of the scope window, reusing the same relative-
  // expression parser ("now()-24h", "now()-7d", …) every other Pulse/Agents
  // chart uses for its bucket sizing — Date.parse(scope.timeframe.from) would
  // return NaN for the common relative-preset case, so this is the correct
  // helper here (not a literal ISO Date.parse of `from`/`to`).
  const windowMinutes = useMemo(
    () => Math.max(1, parseScopeMs(scope.timeframe.from) / 60_000),
    [scope.timeframe.from],
  );

  // Window span in ms, same parseScopeMs basis as windowMinutes above, so the
  // P90 chart's x-axis labels and the golden-signals throughput figure agree
  // on the length of the scope window.
  const windowMs = useMemo(
    () => Math.max(1, parseScopeMs(scope.timeframe.from)),
    [scope.timeframe.from],
  );

  return useMemo<UpstreamDetail>(() => {
    const graph =
      aiServiceIds.length === 0
        ? EMPTY_GRAPH
        : assembleUpstreamGraph({
            reds: redResult.data?.records ?? [],
            edges: edgesResult.data?.records ?? [],
            components: componentsResult.data?.records ?? [],
            windowMinutes,
          });

    const p90Series = new Map<string, (number | null)[]>();
    for (const r of p90Result.data?.records ?? []) {
      if (!r.svcId) continue;
      p90Series.set(
        r.svcId,
        (r.p90ns ?? []).map((v) =>
          typeof v === "number" && Number.isFinite(v) ? v : null,
        ),
      );
    }

    // NB: the p90 makeTimeseries is grouped `by: { svcId }`, so there's no
    // single shared `timeframe`/`interval` record to derive x-axis labels
    // from the way usePulseSeries does (its bucket helpers are also private,
    // unexported). Instead, derive the bucket count from any non-empty
    // per-caller p90 series (every caller shares the same bucket count from
    // the underlying makeTimeseries) and spread the scope window evenly
    // across them.
    let bucketCount = 0;
    for (const series of p90Series.values()) {
      if (series.length > 0) {
        bucketCount = series.length;
        break;
      }
    }
    const labels: string[] =
      bucketCount > 0 ? buildRelativeLabels(bucketCount, windowMs / bucketCount) : [];

    return {
      graph,
      p90Series,
      labels,
      isLoading:
        idsResult.isLoading ||
        edgesResult.isLoading ||
        redResult.isLoading ||
        p90Result.isLoading ||
        componentsResult.isLoading,
      error:
        idsResult.error ??
        edgesResult.error ??
        redResult.error ??
        p90Result.error ??
        componentsResult.error ??
        undefined,
      limitHit,
    };
  }, [
    aiServiceIds,
    redResult.data,
    redResult.isLoading,
    redResult.error,
    edgesResult.data,
    edgesResult.isLoading,
    edgesResult.error,
    componentsResult.data,
    componentsResult.isLoading,
    componentsResult.error,
    p90Result.data,
    p90Result.isLoading,
    p90Result.error,
    idsResult.isLoading,
    idsResult.error,
    windowMinutes,
    windowMs,
    limitHit,
  ]);
};
