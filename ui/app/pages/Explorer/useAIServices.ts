import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useGlobalFilters } from "../../scope/GlobalFilterContext";
import { useResolvedServices, canQueryScope } from "../../scope/useResolvedServices";
import { AI_SERVICES_LIMIT, buildAIServicesQuery } from "./queries";
import {
  ALL_PROVIDER_IDS,
  PROVIDER_COLOR,
  PROVIDER_DISPLAY,
  type ProviderId,
} from "../../detection/attributes";
import { toService, type ServiceRecord, type AIService } from "./parseAIServices";
import { DEMO_SERVICE_RECORDS } from "./demoData";

// Re-exported so existing call sites keep importing the record/service shape
// and the pure parser from this hook module; the implementations live in the
// React-free ./parseAIServices so demoData.ts (and its test) can reuse the
// exact same parse function without pulling in React/DOM-dependent imports.
export { toService };
export type { ServiceRecord, AIService };

export interface ExplorerFacets {
  providers: Array<{ id: ProviderId; label: string; count: number; color: string }>;
  frameworks: Array<{ value: string; count: number }>;
  models: Array<{ value: string; count: number }>;
}

export interface ExplorerFilter {
  search?: string;
  providers?: ProviderId[];
  frameworks?: string[];
  models?: string[];
}

export interface UseAIServicesResult {
  services: AIService[];
  filtered: AIService[];
  facets: ExplorerFacets;
  /** True when the catalog query hit its row cap, so more services exist than shown. */
  truncated: boolean;
  isLoading: boolean;
  error?: Error;
}

const countFacet = <T>(rows: AIService[], pick: (s: AIService) => T[]) => {
  const counts = new Map<T, number>();
  for (const s of rows) {
    for (const v of pick(s)) {
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
  }
  return counts;
};

/**
 * `showExample` (defaulting to false so no existing call site changes
 * behaviour) forces the catalog to fold from the bundled demo fixtures
 * (`DEMO_SERVICE_RECORDS`) through the SAME `toService` parser real rows go
 * through, instead of querying Grail — used by ExplorerPage's Demo Mode /
 * no-telemetry fallback. Search/facet filtering below is unchanged and runs
 * identically over demo or real services, so the sidebar stays interactive
 * in demo mode too.
 */
export const useAIServices = (
  filter: ExplorerFilter = {},
  showExample = false,
): UseAIServicesResult => {
  const { scope } = useScope();
  const { filters } = useGlobalFilters();
  const _resolution = useResolvedServices();
  const { serviceIds, isLoading: servicesLoading } = _resolution;
  const canQuery = canQueryScope(_resolution);

  const { data, isLoading, error } = useScopedDql<ServiceRecord>(
    canQuery ? buildAIServicesQuery(serviceIds, scope.timeframe, filters) : "",
    { enabled: canQuery && !showExample, staleTime: 60_000 },
  );

  return useMemo<UseAIServicesResult>(() => {
    const rawRecords = showExample ? DEMO_SERVICE_RECORDS : (data?.records ?? []);
    const services: AIService[] = [];
    for (const r of rawRecords) {
      const s = toService(r);
      if (s) services.push(s);
    }

    // Provider facet: always show ALL providers (even with 0 count), per
    // Session 6 handoff item 1.
    const providerCounts = countFacet(services, (s) => s.providers);
    const providerOptions = ALL_PROVIDER_IDS.map((id) => ({
      id,
      label: PROVIDER_DISPLAY[id],
      count: providerCounts.get(id) ?? 0,
      color: PROVIDER_COLOR[id],
    }));

    const frameworkCounts = countFacet(services, (s) =>
      s.framework ? [s.framework] : [],
    );
    const modelCounts = countFacet(services, (s) => s.modelDisplay);

    const search = filter.search?.trim().toLowerCase() ?? "";
    const providerSet = new Set(filter.providers ?? []);
    const fwSet = new Set(filter.frameworks ?? []);
    const modelSet = new Set(filter.models ?? []);

    const matchesSearch = (s: AIService): boolean => {
      if (!search) return true;
      const hay = [
        s.service,
        s.framework ?? "",
        ...s.modelDisplay,
        ...s.agentNames,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(search);
    };

    const filtered = services.filter((s) => {
      if (!matchesSearch(s)) return false;
      if (providerSet.size > 0 && !s.providers.some((p) => providerSet.has(p)))
        return false;
      if (fwSet.size > 0 && (!s.framework || !fwSet.has(s.framework)))
        return false;
      if (modelSet.size > 0 && !s.modelDisplay.some((m) => modelSet.has(m)))
        return false;
      return true;
    });

    return {
      services,
      filtered,
      truncated: services.length >= AI_SERVICES_LIMIT,
      facets: {
        providers: providerOptions,
        frameworks: Array.from(frameworkCounts.entries())
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count),
        models: Array.from(modelCounts.entries())
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count),
      },
      isLoading: showExample ? false : servicesLoading || isLoading,
      error: showExample ? undefined : (error ?? undefined),
    };
  }, [
    showExample,
    data,
    isLoading,
    error,
    servicesLoading,
    filter.search,
    filter.providers,
    filter.frameworks,
    filter.models,
  ]);
};
