import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useResolvedServices, canQueryScope } from "../../scope/useResolvedServices";
import { useSampling } from "../../scope/SamplingContext";
import { buildProviderMixQuery } from "./dataQueries";
import type { ProviderRecord } from "./providerMix";
import { computeProviderMix, type ProviderShare } from "./parse";
import { DEMO_PROVIDER_MIX } from "./demoData";

export type { ProviderShare };

export interface UseProviderMixResult {
  shares: ProviderShare[];
  totalRequests: number;
  bedrockProxyCount: number;
  isLoading: boolean;
  error?: Error;
}

/**
 * `showExample` (default false, mirrors useGuardrails.ts) renders the Demo
 * Mode dataset instead of querying Grail — used by the Summary page's
 * EfficiencyMixCard. Pulse's own ProviderMixDonut never passes it, so its
 * behavior is unchanged. The fold itself (`computeProviderMix`) lives in
 * `./parse`, shared with `demoData.ts`'s `DEMO_PROVIDER_MIX`.
 */
export const useProviderMix = (showExample = false): UseProviderMixResult => {
  const { scope } = useScope();
  const { samplingRatio } = useSampling();
  const _resolution = useResolvedServices();
  const { serviceIds, isLoading: servicesLoading } = _resolution;
  const canQuery = canQueryScope(_resolution);

  const { data, isLoading, error } = useScopedDql<ProviderRecord>(
    canQuery ? buildProviderMixQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery && !showExample, staleTime: 60_000 },
  );

  return useMemo<UseProviderMixResult>(() => {
    if (showExample) {
      return { ...DEMO_PROVIDER_MIX, isLoading: false, error: undefined };
    }
    const core = computeProviderMix(data?.records ?? [], samplingRatio);
    return {
      ...core,
      isLoading: servicesLoading || isLoading,
      error: error ?? undefined,
    };
  }, [showExample, data, isLoading, error, servicesLoading, samplingRatio]);
};
