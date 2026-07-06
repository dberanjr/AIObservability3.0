import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import {
  useResolvedServices,
  canQueryScope,
} from "../../scope/useResolvedServices";
import { usePulseHealth } from "../Pulse/usePulseHealth";
import type { Pillar } from "../Pulse/types";
import { buildFleetCountsQuery } from "./queries";
import { compositeTrust, scoreToGrade } from "./posture";

interface CountsRecord {
  services?: number;
  agents?: number;
}

export interface FleetPosture {
  /** Composite 0–100 trust index, or null when no pillar has data. */
  trustIndex: number | null;
  /** Letter grade for the index (null when index is null). */
  grade: string | null;
  /** One-word status word derived from the index. */
  status: string;
  /** Human headline: status + the weakest pillar, when one needs attention. */
  headline: string;
  serviceCount: number | null;
  agentCount: number | null;
  /** Number of health pillars in a warning/critical state (0–3). */
  attentionCount: number;
  pillarsTotal: number;
  /** The three scored health pillars (operational, quality, cost). */
  pillars: Pillar[];
  isLoading: boolean;
  error?: Error;
}

const statusWord = (index: number | null): string => {
  if (index == null) return "Awaiting data";
  if (index >= 85) return "Healthy";
  if (index >= 70) return "Stable";
  if (index >= 50) return "Needs attention";
  return "At risk";
};

const needsAttention = (p: Pillar): boolean =>
  p.status === "warning" || p.status === "critical";

export const useFleetPosture = (): FleetPosture => {
  const { scope } = useScope();
  const resolution = useResolvedServices();
  const { serviceIds } = resolution;
  const canQuery = canQueryScope(resolution);
  const health = usePulseHealth();

  const counts = useScopedDql<CountsRecord>(
    canQuery ? buildFleetCountsQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  return useMemo<FleetPosture>(() => {
    const trustIndex = compositeTrust({
      operational: health.operational.score,
      quality: health.quality.score,
      cost: health.cost.score,
    });
    const grade = trustIndex != null ? scoreToGrade(trustIndex) : null;
    const status = statusWord(trustIndex);

    // Weakest pillar drives the headline detail — critical outranks warning.
    const pillars: Pillar[] = [health.operational, health.quality, health.cost];
    const attention = pillars.filter(needsAttention);
    const worst =
      attention.find((p) => p.status === "critical") ?? attention[0] ?? null;
    const headline = worst
      ? `${status} — ${worst.label.toLowerCase()} needs attention.`
      : trustIndex != null
        ? `${status} across operational, quality, and cost.`
        : status;

    const row = counts.data?.records?.[0];

    return {
      trustIndex,
      grade,
      status,
      headline,
      serviceCount: row?.services ?? null,
      agentCount: row?.agents ?? null,
      attentionCount: attention.length,
      pillarsTotal: pillars.length,
      pillars,
      isLoading: health.isLoading || counts.isLoading,
      error: health.error ?? counts.error ?? undefined,
    };
  }, [
    health.operational,
    health.quality,
    health.cost,
    health.isLoading,
    health.error,
    counts.data,
    counts.isLoading,
    counts.error,
  ]);
};
