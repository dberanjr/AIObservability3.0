import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useResolvedServices, canQueryScope } from "../../scope/useResolvedServices";
import { buildProviderMixQuery } from "./dataQueries";

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

const PROVIDER_COLOR: Record<string, string> = {
  anthropic: "var(--purple-2)",
  openai: "var(--green-2)",
  bedrock: "var(--cyan)",
  google: "var(--green-2)",
  azure: "var(--blue)",
  unknown: "var(--text-4)",
};

const colorFor = (provider: string): string => {
  const key = provider.trim().toLowerCase();
  return PROVIDER_COLOR[key] ?? "var(--text-4)";
};

const displayName = (provider: string): string => {
  const map: Record<string, string> = {
    anthropic: "Anthropic",
    openai: "OpenAI",
    bedrock: "AWS Bedrock",
    "aws-bedrock": "AWS Bedrock",
    google: "Google",
    azure: "Azure",
  };
  const key = provider.trim().toLowerCase();
  return map[key] ?? provider;
};

export const useProviderMix = (): UseProviderMixResult => {
  const { scope } = useScope();
  const _resolution = useResolvedServices();
  const { serviceIds, isLoading: servicesLoading } = _resolution;
  const canQuery = canQueryScope(_resolution);

  const { data, isLoading, error } = useScopedDql<ProviderRecord>(
    canQuery ? buildProviderMixQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  return useMemo<UseProviderMixResult>(() => {
    const records = data?.records ?? [];
    const totalRequests = records.reduce(
      (acc, r) => acc + (r.requests ?? 0),
      0,
    );

    let bedrockProxyVolume = 0;
    const shares: ProviderShare[] = records
      .filter((r): r is Required<Pick<ProviderRecord, "provider">> & ProviderRecord =>
        typeof r.provider === "string" && r.provider.length > 0,
      )
      .map((r) => {
        const provider = r.provider;
        const requests = r.requests ?? 0;
        const viaBedrock = r.via_bedrock_count ?? 0;
        bedrockProxyVolume += viaBedrock;
        return {
          provider,
          displayName: displayName(provider),
          requests,
          tokens: r.tokens ?? 0,
          sharePct:
            totalRequests > 0 ? (requests / totalRequests) * 100 : 0,
          color: colorFor(provider),
          // True when ALL of this provider's volume came in via Bedrock,
          // or when the provider key itself is "aws-bedrock".
          isBedrockProxy:
            /bedrock/i.test(provider) ||
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
  }, [data, isLoading, error, servicesLoading]);
};
