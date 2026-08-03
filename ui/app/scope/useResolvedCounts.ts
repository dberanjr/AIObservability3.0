import { useEffect, useRef } from "react";
import { useScopedDql } from "../scope/useScopedDql";
import { useScope } from "./ScopeContext";
import { useGlobalFilters } from "./GlobalFilterContext";
import {
  FLEET_SERVICE_COUNT_QUERY,
  buildAgentCountQuery,
  buildToolCountQuery,
} from "./queries";

export interface ResolvedCounts {
  services: number | null;
  agents: number | null;
  tools: number | null;
  isLoading: boolean;
  isFetching: boolean;
  lastRefreshed: number | null;
}

interface CountRecord {
  agents?: number;
  tools?: number;
  services?: number;
}

/** Canned demo counts — used when `showExample` is set (global Demo Mode Tweak
 *  or the app-wide "no AI telemetry yet" fallback), so the Pulse map's scope
 *  chips and status line read realistically instead of "—". */
const DEMO_COUNTS: Pick<ResolvedCounts, "services" | "agents" | "tools"> = {
  services: 14,
  agents: 9,
  tools: 23,
};

/**
 * Fleet-wide rollups for the status line. AppCI / Application scoping was
 * removed in favour of platform Segments — those filter the underlying
 * queries via filterSegments rather than a service-id list, so all three
 * counts (services / agents / tools) are simple fleet-wide aggregations.
 */
export const useResolvedCounts = (showExample = false): ResolvedCounts => {
  const { scope } = useScope();
  const { filters } = useGlobalFilters();

  const agentResult = useScopedDql<CountRecord>(
    buildAgentCountQuery(null, scope.timeframe, filters),
    { staleTime: 60_000, enabled: !showExample },
  );
  const toolResult = useScopedDql<CountRecord>(
    buildToolCountQuery(null, scope.timeframe, filters),
    { staleTime: 60_000, enabled: !showExample },
  );
  const serviceResult = useScopedDql<CountRecord>(FLEET_SERVICE_COUNT_QUERY, {
    staleTime: 60_000,
    enabled: !showExample,
  });

  const lastRefreshedRef = useRef<number | null>(null);
  const isFetching =
    agentResult.isFetching ||
    toolResult.isFetching ||
    serviceResult.isFetching;
  useEffect(() => {
    if (!isFetching && (agentResult.data || toolResult.data || serviceResult.data)) {
      lastRefreshedRef.current = Date.now();
    }
  }, [isFetching, agentResult.data, toolResult.data, serviceResult.data]);

  if (showExample) {
    return {
      ...DEMO_COUNTS,
      isLoading: false,
      isFetching: false,
      lastRefreshed: Date.now(),
    };
  }

  return {
    services: serviceResult.data?.records?.[0]?.services ?? null,
    agents: agentResult.data?.records?.[0]?.agents ?? null,
    tools: toolResult.data?.records?.[0]?.tools ?? null,
    isLoading:
      agentResult.isLoading || toolResult.isLoading || serviceResult.isLoading,
    isFetching,
    lastRefreshed: lastRefreshedRef.current,
  };
};
