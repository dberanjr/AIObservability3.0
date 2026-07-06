import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useResolvedServices, canQueryScope } from "../../scope/useResolvedServices";
import { useSampling } from "../../scope/SamplingContext";
import { toNum } from "../../data/format";
import { buildProviderMixQuery } from "./dataQueries";
import { extrapolatedSum, type ProviderRecord } from "./providerMix";
import {
  PROVIDER_COLOR,
  PROVIDER_DISPLAY,
  type ProviderId,
} from "../../detection/attributes";

export interface ProviderShare {
  provider: string;
  displayName: string;
  /** Raw gen_ai.provider.name values composing this slice (for click-to-filter). */
  rawProviders: string[];
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
  Boolean(Object.prototype.hasOwnProperty.call(PROVIDER_COLOR, p));

/**
 * Distinct fallback palette for non-canonical providers (custom proxies,
 * tenant-specific names like "sierra", etc.). Every entry MUST resolve to a
 * defined CSS custom property in ui/app/theme/tokens.ts — otherwise the SVG
 * fill falls back to the browser default and slices render white.
 *
 * Selected from the brand palette, avoiding the tokens already mapped to
 * canonical providers in detection/attributes.ts so unknowns don't visually
 * collide with known vendors.
 */
const FALLBACK_PALETTE = [
  "var(--pink)",
  "var(--blue-pale)",
  "var(--green-lime)",
  "var(--purple-dark)",
  "var(--red)",
  "var(--purple)",
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
    const totalRequests = extrapolatedSum(records, (r) => r.requests, samplingRatio);

    let bedrockProxyVolume = 0;
    let fallbackIdx = 0;
    const shares: ProviderShare[] = records
      .filter((r): r is Required<Pick<ProviderRecord, "provider">> & ProviderRecord =>
        typeof r.provider === "string" && r.provider.length > 0,
      )
      .map((r) => {
        const provider = r.provider.trim().toLowerCase();
        const requests = toNum(r.requests) * samplingRatio;
        const viaBedrock = toNum(r.via_bedrock_count) * samplingRatio;
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
          rawProviders: (r.raw_providers ?? []).filter(
            (p): p is string => typeof p === "string" && p.length > 0,
          ),
          requests,
          tokens: toNum(r.tokens) * samplingRatio,
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
