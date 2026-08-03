import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import {
  canQueryScope,
  useResolvedServices,
} from "../../scope/useResolvedServices";
import { buildTokenEfficiencyQuery } from "./dataQueries";
import { computeTokenEfficiency, type TokenEfficiencyRecord, type TokenEfficiencyCore } from "./parse";
import { DEMO_TOKEN_EFFICIENCY } from "./demoData";

export type { TokenEfficiencyRecord };

export interface TokenEfficiency extends TokenEfficiencyCore {
  isLoading: boolean;
  error?: Error;
}

/**
 * `showExample` (default false, mirrors useGuardrails.ts) renders the Demo
 * Mode dataset instead of querying Grail — used by the Summary page's
 * EfficiencyMixCard. Pulse's own TokenEfficiencyTiles never passes it, so its
 * behavior is unchanged. The fold itself (`computeTokenEfficiency`) lives in
 * `./parse`, shared with `demoData.ts`'s `DEMO_TOKEN_EFFICIENCY`.
 */
export const useTokenEfficiency = (showExample = false): TokenEfficiency => {
  const { scope } = useScope();
  const resolution = useResolvedServices();
  const canQuery = canQueryScope(resolution);

  const { data, isLoading, error } = useScopedDql<TokenEfficiencyRecord>(
    canQuery
      ? buildTokenEfficiencyQuery(resolution.serviceIds, scope.timeframe)
      : "",
    { enabled: canQuery && !showExample, staleTime: 60_000 },
  );

  return useMemo<TokenEfficiency>(() => {
    if (showExample) {
      return { ...DEMO_TOKEN_EFFICIENCY, isLoading: false, error: undefined };
    }
    const core = computeTokenEfficiency(data?.records ?? []);
    return {
      ...core,
      isLoading: resolution.isLoading || isLoading,
      error: error ?? undefined,
    };
  }, [showExample, data, isLoading, error, resolution.isLoading]);
};
