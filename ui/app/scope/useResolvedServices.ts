import { useMemo } from "react";
import { useScopedDql } from "../scope/useScopedDql";
import { useScope } from "./ScopeContext";
import { buildResolvedServicesQuery } from "./queries";

interface ResolvedServiceRecord {
  id?: string;
  "entity.name"?: string;
}

export interface UseResolvedServicesResult {
  /**
   * Resolved service ids for the current AppCI/env scope. `null` means
   * "no AppCI selected — query fleet-wide". An empty array means "AppCI set
   * but the resolution is still loading or returned no matches".
   */
  serviceIds: string[] | null;
  serviceNames: string[];
  isLoading: boolean;
  error?: Error;
  /** Convenience flag: true when the app is running without an AppCI filter. */
  isFleetWide: boolean;
}

export const useResolvedServices = (): UseResolvedServicesResult => {
  const { scope } = useScope();
  const isFleetWide = !scope.appCi;
  const query = scope.appCi
    ? buildResolvedServicesQuery(scope.appCi, scope.env)
    : "";

  const { data, isLoading, error } = useScopedDql<ResolvedServiceRecord>(query, {
    enabled: !isFleetWide,
    staleTime: 60_000,
  });

  return useMemo<UseResolvedServicesResult>(() => {
    if (isFleetWide) {
      return {
        serviceIds: null,
        serviceNames: [],
        isLoading: false,
        error: undefined,
        isFleetWide: true,
      };
    }
    const records = data?.records ?? [];
    const serviceIds = records
      .map((r) => r.id)
      .filter((v): v is string => typeof v === "string" && v.length > 0);
    const serviceNames = records
      .map((r) => r["entity.name"])
      .filter((v): v is string => typeof v === "string" && v.length > 0);
    return {
      serviceIds,
      serviceNames,
      isLoading,
      error: error ?? undefined,
      isFleetWide: false,
    };
  }, [isFleetWide, data, isLoading, error]);
};

/**
 * True when downstream page queries are safe to fire:
 *   - Fleet-wide mode: always safe.
 *   - Resolved mode: only after the resolution query finishes and yields ids.
 */
export const canQueryScope = (result: UseResolvedServicesResult): boolean =>
  result.isFleetWide ||
  (!result.isLoading && (result.serviceIds?.length ?? 0) > 0);
