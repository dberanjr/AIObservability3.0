import { useMemo } from "react";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useGlobalFilters } from "../../scope/GlobalFilterContext";
import { useResolvedServices, canQueryScope } from "../../scope/useResolvedServices";
import {
  buildAiServiceIdsQuery,
  buildUpstreamSmartscapeQuery,
} from "./queries";

interface UpstreamRecord {
  upstream?: string;
  services?: number;
  targets?: Array<string | null>;
}

export interface UpstreamService {
  upstream: string;
  /** Distinct in-scope AI services this upstream calls. */
  services: number;
  /** Names of the AI services it calls (for tooltip). */
  targets: string[];
}

export interface UseUpstreamServicesResult {
  rows: UpstreamService[];
  isLoading: boolean;
  error?: Error;
}

/**
 * Upstream service callers of the in-scope AI services, sourced from
 * Smartscape topology (parent.service.name isn't emitted on spans). Two steps:
 *   1. resolve the AI services' entity IDs from spans,
 *   2. query smartscape `calls` edges that target those services.
 */
export const useUpstreamServices = (): UseUpstreamServicesResult => {
  const { scope } = useScope();
  const { filters } = useGlobalFilters();
  const resolution = useResolvedServices();
  const { serviceIds, isLoading: servicesLoading } = resolution;
  const canQuery = canQueryScope(resolution);

  // Step 1 — AI service entity IDs (scope/filter aware).
  const idsResult = useScopedDql<{ svc?: string }>(
    canQuery ? buildAiServiceIdsQuery(serviceIds, scope.timeframe, filters) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  const aiServiceIds = useMemo(
    () =>
      (idsResult.data?.records ?? [])
        .map((r) => r.svc)
        .filter((s): s is string => typeof s === "string" && s.length > 0),
    [idsResult.data],
  );

  // Step 2 — smartscape upstream callers (topology is global, not time-scoped,
  // so a plain useDql is correct here — no scope/segment injection needed).
  const upstreamQuery =
    aiServiceIds.length > 0 ? buildUpstreamSmartscapeQuery(aiServiceIds) : "";
  const { data, isLoading, error } = useDql<UpstreamRecord>(upstreamQuery, {
    enabled: aiServiceIds.length > 0,
    staleTime: 60_000,
  });

  return useMemo<UseUpstreamServicesResult>(() => {
    const rows: UpstreamService[] = [];
    for (const r of data?.records ?? []) {
      if (!r.upstream) continue;
      rows.push({
        upstream: r.upstream,
        services: r.services ?? 0,
        targets: (r.targets ?? []).filter(
          (t): t is string => typeof t === "string" && t.length > 0,
        ),
      });
    }
    return {
      rows,
      isLoading: servicesLoading || idsResult.isLoading || isLoading,
      error: error ?? idsResult.error ?? undefined,
    };
  }, [
    data,
    isLoading,
    error,
    idsResult.isLoading,
    idsResult.error,
    servicesLoading,
  ]);
};
