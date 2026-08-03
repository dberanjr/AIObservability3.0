import { useCallback, useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useResolvedServices, canQueryScope } from "../../scope/useResolvedServices";
import { useSampling } from "../../scope/SamplingContext";
import {
  buildCostBaselineQuery,
  buildCostQuery,
  buildOperationalQuery,
  buildQualityPresenceQuery,
} from "./queries";
import type { PulseHealth } from "./types";
import {
  operationalPillar,
  qualityPillar,
  costPillar,
  type OperationalRecord,
  type QualityRecord,
  type CostRecord,
  type CostBaselineRecord,
} from "./parse";
import { DEMO_PULSE_HEALTH } from "./demoData";

export type { OperationalRecord, QualityRecord, CostRecord, CostBaselineRecord };
export { operationalPillar, qualityPillar, costPillar };

export const parseScopeHours = (from: string): number => {
  const match = /now\(\)\s*-\s*(\d+)([mhd])/i.exec(from);
  if (!match) return 24;
  const n = Number(match[1]);
  switch (match[2].toLowerCase()) {
    case "m":
      return n / 60;
    case "h":
      return n;
    case "d":
      return n * 24;
    default:
      return 24;
  }
};

/**
 * `showExample` (default false, mirrors useGuardrails.ts) renders the Demo
 * Mode dataset instead of querying Grail — used by the Summary page's
 * `useFleetPosture`. Pulse itself never passes it, so its own behavior is
 * unchanged. The pillar scoring itself (`operationalPillar` / `qualityPillar`
 * / `costPillar`) lives in `./parse`, shared with `demoData.ts`'s
 * `DEMO_PULSE_HEALTH`.
 */
export const usePulseHealth = (showExample = false): PulseHealth => {
  const { scope } = useScope();
  const { samplingRatio } = useSampling();
  const _resolution = useResolvedServices();
  const { serviceIds, isLoading: servicesLoading } = _resolution;
  const canQuery = canQueryScope(_resolution);

  const opResult = useScopedDql<OperationalRecord>(
    canQuery ? buildOperationalQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery && !showExample, staleTime: 60_000 },
  );
  const qualityResult = useScopedDql<QualityRecord>(
    canQuery ? buildQualityPresenceQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery && !showExample, staleTime: 60_000 },
  );
  const costResult = useScopedDql<CostRecord>(
    canQuery ? buildCostQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery && !showExample, staleTime: 60_000 },
  );
  const costBaselineResult = useScopedDql<CostBaselineRecord>(
    canQuery ? buildCostBaselineQuery(serviceIds) : "",
    { enabled: canQuery && !showExample, staleTime: 5 * 60_000 },
  );

  const refetch = useCallback(() => {
    void opResult.refetch();
    void qualityResult.refetch();
    void costResult.refetch();
    void costBaselineResult.refetch();
    // react-query refetch identities are stable; depending on the whole result
    // objects would rebuild this callback every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    opResult.refetch,
    qualityResult.refetch,
    costResult.refetch,
    costBaselineResult.refetch,
  ]);

  return useMemo<PulseHealth>(() => {
    if (showExample) {
      return { ...DEMO_PULSE_HEALTH, isLoading: false, error: undefined, refetch };
    }
    const scopeHours = parseScopeHours(scope.timeframe.from);
    const operational = operationalPillar(
      opResult.data?.records?.[0],
      samplingRatio,
    );
    const quality = qualityPillar(
      qualityResult.data?.records?.[0],
      samplingRatio,
    );
    const cost = costPillar(
      costResult.data?.records?.[0],
      costBaselineResult.data?.records?.[0],
      scopeHours,
      samplingRatio,
    );
    const error =
      opResult.error ??
      qualityResult.error ??
      costResult.error ??
      costBaselineResult.error ??
      undefined;
    return {
      operational,
      quality,
      cost,
      isLoading:
        servicesLoading ||
        opResult.isLoading ||
        qualityResult.isLoading ||
        costResult.isLoading,
      error: error ?? undefined,
      refetch,
    };
  }, [
    showExample,
    scope.timeframe.from,
    samplingRatio,
    servicesLoading,
    opResult.data,
    opResult.error,
    opResult.isLoading,
    qualityResult.data,
    qualityResult.error,
    qualityResult.isLoading,
    costResult.data,
    costResult.error,
    costResult.isLoading,
    costBaselineResult.data,
    costBaselineResult.error,
    refetch,
  ]);
};
