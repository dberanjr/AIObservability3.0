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
import { parseUpstreamRows, type UpstreamRecord, type UpstreamService } from "./parse";
import { DEMO_UPSTREAM_ROWS } from "./demoData";

export type { UpstreamService };

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
 *
 * @param showExample Demo Mode / no-telemetry fallback — see BedrockPage's
 * doc comment. Returns the canned `DEMO_UPSTREAM_ROWS` instead of querying
 * (skipping BOTH steps — Smartscape topology has no meaning against a fake
 * fleet, so the final row shape is what's canned, not a synthesized topology).
 */
export const useUpstreamServices = (
  showExample = false,
): UseUpstreamServicesResult => {
  const { scope } = useScope();
  const { filters } = useGlobalFilters();
  const resolution = useResolvedServices();
  const { serviceIds, isLoading: servicesLoading } = resolution;
  const canQuery = canQueryScope(resolution);

  // Step 1 — AI service entity IDs (scope/filter aware).
  const idsResult = useScopedDql<{ svc?: string }>(
    canQuery && !showExample ? buildAiServiceIdsQuery(serviceIds, scope.timeframe, filters) : "",
    { enabled: canQuery && !showExample, staleTime: 60_000 },
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
    !showExample && aiServiceIds.length > 0 ? buildUpstreamSmartscapeQuery(aiServiceIds) : "";
  const { data, isLoading, error } = useDql<UpstreamRecord>(upstreamQuery, {
    enabled: !showExample && aiServiceIds.length > 0,
    staleTime: 60_000,
  });

  return useMemo<UseUpstreamServicesResult>(() => {
    if (showExample) {
      return { rows: DEMO_UPSTREAM_ROWS, isLoading: false, error: undefined };
    }
    return {
      rows: parseUpstreamRows(data?.records ?? []),
      isLoading: servicesLoading || idsResult.isLoading || isLoading,
      error: error ?? idsResult.error ?? undefined,
    };
  }, [
    showExample,
    data,
    isLoading,
    error,
    idsResult.isLoading,
    idsResult.error,
    servicesLoading,
  ]);
};
