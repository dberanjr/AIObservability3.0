import { useEffect, useRef } from "react";
import { useScopedDql } from "../scope/useScopedDql";
import { useScope } from "./ScopeContext";
import { canQueryScope, useResolvedServices } from "./useResolvedServices";
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
  isFleetWide: boolean;
}

interface CountRecord {
  agents?: number;
  tools?: number;
  services?: number;
}

export const useResolvedCounts = (): ResolvedCounts => {
  const { scope } = useScope();
  const resolution = useResolvedServices();
  const canQuery = canQueryScope(resolution);

  const agentResult = useScopedDql<CountRecord>(
    canQuery ? buildAgentCountQuery(resolution.serviceIds, scope.timeframe) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );
  const toolResult = useScopedDql<CountRecord>(
    canQuery ? buildToolCountQuery(resolution.serviceIds, scope.timeframe) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  // Fleet-wide service count needs its own query — there's no resolved list.
  const fleetServiceResult = useScopedDql<CountRecord>(
    resolution.isFleetWide ? FLEET_SERVICE_COUNT_QUERY : "",
    { enabled: resolution.isFleetWide, staleTime: 60_000 },
  );

  const lastRefreshedRef = useRef<number | null>(null);
  const isFetching =
    agentResult.isFetching ||
    toolResult.isFetching ||
    fleetServiceResult.isFetching;
  useEffect(() => {
    if (
      !isFetching &&
      (agentResult.data || toolResult.data || fleetServiceResult.data)
    ) {
      lastRefreshedRef.current = Date.now();
    }
  }, [
    isFetching,
    agentResult.data,
    toolResult.data,
    fleetServiceResult.data,
  ]);

  const agents = agentResult.data?.records?.[0]?.agents ?? null;
  const tools = toolResult.data?.records?.[0]?.tools ?? null;

  const services = resolution.isFleetWide
    ? fleetServiceResult.data?.records?.[0]?.services ?? null
    : resolution.serviceIds?.length ?? 0;

  return {
    services,
    agents,
    tools,
    isLoading:
      resolution.isLoading ||
      agentResult.isLoading ||
      toolResult.isLoading ||
      fleetServiceResult.isLoading,
    isFetching,
    lastRefreshed: lastRefreshedRef.current,
    isFleetWide: resolution.isFleetWide,
  };
};
