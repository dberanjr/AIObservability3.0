export interface UseResolvedServicesResult {
  /**
   * Resolved service ids for the current scope. Now permanently `null`
   * (fleet-wide) since the AppCI / Application dropdowns were retired in
   * favour of Dynatrace platform Segments — those carry the entity scope
   * via filterSegments on the underlying DqlQueryParams, not via a
   * service-id list embedded in the DQL string.
   *
   * Hook signature is preserved so existing page hooks keep working
   * without changes; build*Query(null, ...) already emits no filter via
   * scopeFilterClause(null) → "".
   */
  serviceIds: string[] | null;
  serviceNames: string[];
  isLoading: boolean;
  error?: Error;
  isFleetWide: boolean;
}

/**
 * Returns a stable fleet-wide stub. Kept as a hook (vs a constant) so call
 * sites' dependency arrays stay correct — and so we can re-introduce
 * scope-derived service resolution later without changing all callers.
 */
export const useResolvedServices = (): UseResolvedServicesResult => ({
  serviceIds: null,
  serviceNames: [],
  isLoading: false,
  error: undefined,
  isFleetWide: true,
});

/** Always true now — segments handle scoping at the request level. */
export const canQueryScope = (_result: UseResolvedServicesResult): boolean =>
  true;
