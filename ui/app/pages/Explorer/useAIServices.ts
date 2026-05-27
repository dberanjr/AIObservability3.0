import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useGlobalFilters } from "../../scope/GlobalFilterContext";
import { useResolvedServices, canQueryScope } from "../../scope/useResolvedServices";
import { buildAIServicesQuery } from "./queries";
import {
  ALL_PROVIDER_IDS,
  PROVIDER_COLOR,
  PROVIDER_DISPLAY,
  normalizeProvider,
  stripModelVersion,
  type ProviderId,
} from "../../detection/attributes";
import { toNum } from "../../data/format";

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

interface ServiceRecord {
  service?: string;
  service_id?: string;
  requests?: number;
  tokens?: number;
  errors?: number;
  logical_errors?: number;
  agents?: number;
  models?: string[];
  framework?: string;
  tok_per_req?: number;
  error_rate_pct?: number;
}

export interface AIService {
  serviceId: string;
  service: string;
  framework: string | null;
  models: string[];
  modelDisplay: string[];
  providers: ProviderId[];
  requests: number;
  tokens: number;
  tokPerReq: number;
  agents: number;
  errors: number;
  errorRatePct: number;
  logicalErrors: number;
}

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
  isLoading: boolean;
  error?: Error;
}

const toService = (r: ServiceRecord): AIService | null => {
  if (!r.service || !r.service_id) return null;
  // DQL's collectDistinct(gen_ai.request.model) can include nulls for spans
  // that have an agent but no model — strip them before any string ops.
  const models = (r.models ?? []).filter(
    (m): m is string => typeof m === "string" && m.length > 0,
  );
  const providers = Array.from(
    new Set(models.map((m) => normalizeProvider(undefined, m).id)),
  );
  return {
    serviceId: r.service_id,
    service: r.service,
    framework: r.framework ?? null,
    models,
    modelDisplay: models.map(stripModelVersion),
    providers,
    requests: num(r.requests),
    tokens: num(r.tokens),
    tokPerReq: num(r.tok_per_req),
    agents: num(r.agents),
    errors: num(r.errors),
    errorRatePct: num(r.error_rate_pct),
    logicalErrors: num(r.logical_errors),
  };
};

const countFacet = <T>(rows: AIService[], pick: (s: AIService) => T[]) => {
  const counts = new Map<T, number>();
  for (const s of rows) {
    for (const v of pick(s)) {
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
  }
  return counts;
};

export const useAIServices = (filter: ExplorerFilter = {}): UseAIServicesResult => {
  const { scope } = useScope();
  const { filters } = useGlobalFilters();
  const _resolution = useResolvedServices();
  const { serviceIds, isLoading: servicesLoading } = _resolution;
  const canQuery = canQueryScope(_resolution);

  const { data, isLoading, error } = useScopedDql<ServiceRecord>(
    canQuery ? buildAIServicesQuery(serviceIds, scope.timeframe, filters) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  return useMemo<UseAIServicesResult>(() => {
    const services: AIService[] = [];
    for (const r of data?.records ?? []) {
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

    const filtered = services.filter((s) => {
      if (search && !s.service.toLowerCase().includes(search)) return false;
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
      facets: {
        providers: providerOptions,
        frameworks: Array.from(frameworkCounts.entries())
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count),
        models: Array.from(modelCounts.entries())
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count),
      },
      isLoading: servicesLoading || isLoading,
      error: error ?? undefined,
    };
  }, [
    data,
    isLoading,
    error,
    servicesLoading,
    filter.search,
    filter.providers,
    filter.frameworks,
    filter.models,
    filters,
  ]);
};
