import { useMemo } from "react";
import { useScopedDql } from "./useScopedDql";
import { useScope } from "./ScopeContext";
import { useResolvedServices } from "./useResolvedServices";
import { buildFilterOptionsQuery } from "./queries";

interface FilterOptionsRecord {
  agents?: Array<{ value: string }>;
  models?: Array<{ value: string }>;
  providers?: Array<{ value: string }>;
}

export interface UseFilterOptionsResult {
  agents: string[];
  models: string[];
  providers: string[];
  isLoading: boolean;
  error?: Error;
}

export const useFilterOptions = (): UseFilterOptionsResult => {
  const { scope } = useScope();
  const resolution = useResolvedServices();
  const canQuery = resolution.isLoading === false;

  const query = useMemo(
    () => (canQuery ? buildFilterOptionsQuery(resolution.serviceIds, scope.timeframe) : ""),
    [canQuery, resolution.serviceIds, scope.timeframe],
  );

  const { data, isLoading, error } = useScopedDql<FilterOptionsRecord>(query, {
    enabled: canQuery,
    staleTime: 60_000,
  });

  return useMemo<UseFilterOptionsResult>(() => {
    const record = data?.records?.[0];
    return {
      agents: (record?.agents ?? []).filter((a): a is { value: string } => !!a?.value).map((a) => a.value),
      models: (record?.models ?? []).filter((m): m is { value: string } => !!m?.value).map((m) => m.value),
      providers: (record?.providers ?? []).filter((p): p is { value: string } => !!p?.value).map((p) => p.value),
      isLoading,
      error: error ?? undefined,
    };
  }, [data, isLoading, error]);
};
