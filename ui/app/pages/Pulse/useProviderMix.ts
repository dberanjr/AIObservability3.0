import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useResolvedServices, canQueryScope } from "../../scope/useResolvedServices";
import { useSampling } from "../../scope/SamplingContext";
import { buildProviderMixQuery } from "./dataQueries";
import {
  PROVIDER_COLOR,
  PROVIDER_DISPLAY,
  type ProviderId,
} from "../../detection/attributes";

interface ProviderRecord {
  provider?: string;
  requests?: number;
  tokens?: number;
  via_bedrock_count?: number;
}

export interface ProviderShare {
  provider: string;
  displayName: string;
  requests: number;
  tokens: number;
  sharePct: number;
  color: string;
  /** True when this provider is a Bedrock-proxied reseller (i.e. anthropic via AWS). */
  isBedrockProxy: boolean;
}

export interface UseProviderMixResult {
  shares: ProviderShare[];
  totalRequests: number;
  bedrockProxyCount: number;
  isLoading: boolean;
  error?: Error;
}

const isKnownProvider = (p: string): p is ProviderId =>
  Object.prototype.hasOwnProperty.call(PROVIDER_COLOR, p);

/**
 * Distinct fallback palette for non-canonical providers (custom proxies,
 * tenant-specific names like "sierra", etc.). Picked from Strato tokens that
 * don't collide with the canonical PROVIDER_COLOR entries.
 */
const FALLBACK_PALETTE = [
  "var(--magenta)",
  "var(--teal)",
  "var(--orange)",
  "var(--lime)",
  "var(--indigo)",
  "var(--pink)",
  "var(--yellow)",
  "var(--red)",
] as const;

/**
 * Pretty-print a non-canonical provider key. "aws_bedrock" → "Aws Bedrock",
 * "sierra" → "Sierra". Replaces underscores/hyphens with spaces and title-cases.
 */
const prettifyUnknown = (provider: string): string =>
  provider
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");

export const useProviderMix = (): UseProviderMixResult => {
  const { scope } = useScope();
  const { samplingRatio } = useSampling();
  const _resolution = useResolvedServices();
  const { serviceIds, isLoading: servicesLoading } = _resolution;
  const canQuery = canQueryScope(_resolution);

  const { data, isLoading, error } = useScopedDql<ProviderRecord>(
    canQuery ? buildProviderMixQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  return useMemo<UseProviderMixResult>(() => {
    const records = data?.records ?? [];
    // Per-provider request counts and token sums need extrapolation. Shares
    // (sharePct) are ratios and unaffected, but the displayed center value
    // and the legend's per-provider request counts both need to reflect the
    // unsampled population.
    const totalRequests =
      records.reduce((acc, r) => acc + (r.requests ?? 0), 0) * samplingRatio;

    let bedrockProxyVolume = 0;
    let fallbackIdx = 0;
    const shares: ProviderShare[] = records
      .filter((r): r is Required<Pick<ProviderRecord, "provider">> & ProviderRecord =>
        typeof r.provider === "string" && r.provider.length > 0,
      )
      .map((r) => {
        const provider = r.provider.trim().toLowerCase();
        const requests = (r.requests ?? 0) * samplingRatio;
        const viaBedrock = (r.via_bedrock_count ?? 0) * samplingRatio;
        bedrockProxyVolume += viaBedrock;

        const known = isKnownProvider(provider);
        const color = known
          ? PROVIDER_COLOR[provider]
          : FALLBACK_PALETTE[fallbackIdx++ % FALLBACK_PALETTE.length];
        const display = known
          ? PROVIDER_DISPLAY[provider]
          : prettifyUnknown(provider);

        return {
          provider,
          displayName: display,
          requests,
          tokens: (r.tokens ?? 0) * samplingRatio,
          sharePct:
            totalRequests > 0 ? (requests / totalRequests) * 100 : 0,
          color,
          // Bedrock-proxy flag: either the canonical key is aws-bedrock, or
          // every request for this provider arrived via the Bedrock proxy
          // (signal for the "via Bedrock proxy" sublabel).
          isBedrockProxy:
            provider === "aws-bedrock" ||
            (viaBedrock > 0 && viaBedrock === requests),
        };
      });

    const bedrockProxyCount = bedrockProxyVolume > 0
      ? shares.filter((s) => s.isBedrockProxy).length
      : 0;

    return {
      shares,
      totalRequests,
      bedrockProxyCount,
      isLoading: servicesLoading || isLoading,
      error: error ?? undefined,
    };
  }, [data, isLoading, error, servicesLoading, samplingRatio]);
};
