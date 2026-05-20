import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useResolvedServices, canQueryScope } from "../../scope/useResolvedServices";
import { buildUpstreamServicesQuery } from "./queries";

interface UpstreamRecord {
  upstream?: string;
  calls?: number;
  agents?: number;
}

export interface UpstreamService {
  upstream: string;
  calls: number;
  agents: number;
}

export interface UseUpstreamServicesResult {
  rows: UpstreamService[];
  isLoading: boolean;
  error?: Error;
}

export const useUpstreamServices = (): UseUpstreamServicesResult => {
  const { scope } = useScope();
  const _resolution = useResolvedServices();
  const { serviceIds, isLoading: servicesLoading } = _resolution;
  const canQuery = canQueryScope(_resolution);

  const { data, isLoading, error } = useScopedDql<UpstreamRecord>(
    canQuery ? buildUpstreamServicesQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  return useMemo<UseUpstreamServicesResult>(() => {
    const rows: UpstreamService[] = [];
    for (const r of data?.records ?? []) {
      if (!r.upstream) continue;
      rows.push({
        upstream: r.upstream,
        calls: r.calls ?? 0,
        agents: r.agents ?? 0,
      });
    }
    return {
      rows,
      isLoading: servicesLoading || isLoading,
      error: error ?? undefined,
    };
  }, [data, isLoading, error, servicesLoading]);
};
