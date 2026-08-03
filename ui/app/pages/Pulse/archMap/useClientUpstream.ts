/**
 * Client tier data: the upstream services that call the in-scope AI services,
 * with per-service RED metrics + a throughput sparkline. Powers the Client node
 * headline/chips and its drawer drill-down (each row filters the whole app).
 *
 * Chain: AI service ids (scope-aware spans) → Smartscape callers (id+name) →
 * RED + timeseries for those caller ids (filtered by id, so plain useDql).
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
import { buildAiServiceIdsQuery } from "../../Agents/queries";
import {
  buildClientUpstreamQuery,
  buildUpstreamRedQuery,
  buildUpstreamSeriesQuery,
} from "./clientUpstreamQueries";
import { toNum } from "../../../data/format";

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

export interface ClientUpstreamService {
  id: string;
  name: string;
  requests: number;
  errPct: number;
  p90Ms: number;
  series: number[];
}

export interface ClientUpstream {
  /** Number of distinct upstream caller services. */
  count: number;
  totalRequests: number;
  /** Aggregate error rate across all upstream callers (%). */
  errPct: number;
  /** Worst per-service p90 latency (ms) across the callers. */
  p90Ms: number;
  services: ClientUpstreamService[];
  isLoading: boolean;
}

interface IdRec { svc?: string }
interface UpRec { upstreamId?: string; upstream?: string; aiServices?: number }
interface RedRec { svcId?: string; svc?: string; requests?: number; errors?: number; p90ns?: number }
interface SeriesRec { svcId?: string; throughput?: (number | null)[] | null }

/** Canned upstream-caller set — used when `showExample` is set (global Demo
 *  Mode Tweak or the app-wide "no AI telemetry yet" fallback). Hand-built
 *  (rather than fixture-plus-fold) since this hook's real pipeline is a
 *  4-query Smartscape-topology join with no single reusable fold function;
 *  every number below is nonetheless internally consistent (errPct = errors /
 *  requests, p90Ms = worst caller). */
const DEMO_CLIENT_UPSTREAM: ClientUpstream = {
  count: 3,
  totalRequests: 48_600,
  errPct: 1.4,
  p90Ms: 340,
  services: [
    { id: "SERVICE-checkout-web", name: "checkout-web", requests: 26_400, errPct: 0.9, p90Ms: 210, series: [820, 860, 910, 875, 940, 990, 1020, 980, 1050, 1110, 1080, 1140, 1190, 1160] },
    { id: "SERVICE-mobile-bff", name: "mobile-bff", requests: 15_800, errPct: 1.8, p90Ms: 340, series: [480, 510, 495, 520, 540, 560, 555, 585, 600, 610, 590, 620, 640, 630] },
    { id: "SERVICE-partner-api-gateway", name: "partner-api-gateway", requests: 6_400, errPct: 2.6, p90Ms: 290, series: [190, 205, 198, 210, 220, 215, 230, 225, 240, 235, 245, 250, 248, 255] },
  ],
  isLoading: false,
};

export const useClientUpstream = (showExample = false): ClientUpstream => {
  const { scope } = useScope();
  const { filters } = useGlobalFilters();
  const resolution = useResolvedServices();
  const canQuery = canQueryScope(resolution) && !showExample;

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

  // 2 — Smartscape callers (id + name). Topology is global → plain useDql.
  const upstreamResult = useDql<UpRec>(
    aiServiceIds.length > 0 ? buildClientUpstreamQuery(aiServiceIds) : "",
    { enabled: aiServiceIds.length > 0, staleTime: 60_000 },
  );
  const upstreamIds = useMemo(
    () =>
      (upstreamResult.data?.records ?? [])
        .map((r) => r.upstreamId)
        .filter((s): s is string => typeof s === "string" && s.length > 0),
    [upstreamResult.data],
  );
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of upstreamResult.data?.records ?? []) {
      if (r.upstreamId) m.set(r.upstreamId, r.upstream ?? r.upstreamId);
    }
    return m;
  }, [upstreamResult.data]);

  // 3 — RED metrics per caller (filtered by id → plain useDql).
  const redResult = useDql<RedRec>(
    upstreamIds.length > 0
      ? buildUpstreamRedQuery(upstreamIds, scope.timeframe)
      : "",
    { enabled: upstreamIds.length > 0, staleTime: 60_000 },
  );

  // 4 — throughput timeseries per caller.
  const seriesResult = useDql<SeriesRec>(
    upstreamIds.length > 0
      ? buildUpstreamSeriesQuery(upstreamIds, scope.timeframe)
      : "",
    { enabled: upstreamIds.length > 0, staleTime: 60_000 },
  );

  return useMemo<ClientUpstream>(() => {
    if (showExample) return DEMO_CLIENT_UPSTREAM;
    const seriesById = new Map<string, number[]>();
    for (const r of seriesResult.data?.records ?? []) {
      if (!r.svcId) continue;
      seriesById.set(r.svcId, (r.throughput ?? []).map((v) => num(v)));
    }

    const services: ClientUpstreamService[] = [];
    for (const r of redResult.data?.records ?? []) {
      if (!r.svcId) continue;
      const requests = num(r.requests);
      const errors = num(r.errors);
      services.push({
        id: r.svcId,
        name: r.svc || nameById.get(r.svcId) || r.svcId,
        requests,
        errPct: requests > 0 ? (errors / requests) * 100 : 0,
        p90Ms: num(r.p90ns) / 1_000_000,
        series: seriesById.get(r.svcId) ?? [],
      });
    }
    services.sort((a, b) => b.requests - a.requests);

    const totalRequests = services.reduce((acc, s) => acc + s.requests, 0);
    const totalErrors = services.reduce(
      (acc, s) => acc + (s.errPct / 100) * s.requests,
      0,
    );
    const p90Ms = services.reduce((acc, s) => Math.max(acc, s.p90Ms), 0);

    // Count callers from the topology result (RED can lag if a caller went
    // quiet in the window); fall back to the RED rows.
    const count = upstreamIds.length || services.length;

    return {
      count,
      totalRequests,
      errPct: totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0,
      p90Ms,
      services,
      isLoading:
        idsResult.isLoading ||
        upstreamResult.isLoading ||
        redResult.isLoading,
    };
  }, [
    showExample,
    redResult.data,
    redResult.isLoading,
    seriesResult.data,
    upstreamResult.isLoading,
    upstreamIds,
    nameById,
    idsResult.isLoading,
  ]);
};
