import { useMemo } from "react";
import { useScopedDql } from "../../../scope/useScopedDql";
import { useScope } from "../../../scope/ScopeContext";
import { useResolvedServices, canQueryScope } from "../../../scope/useResolvedServices";
import { useSampling } from "../../../scope/SamplingContext";
import {
  buildCostSpikeQuery,
  buildLatencySpikeQuery,
  buildRunawayAgentQuery,
  buildTokenSurgeQuery,
} from "./queries";
import {
  ANOMALY_LABELS,
  SEVERITY_RANK,
  THRESHOLDS,
  type Anomaly,
} from "./types";
import { DEFAULT_FINDING_INTENTS } from "../../../components/drawers/types";

interface LatencyRow {
  service?: string;
  service_id?: string;
  service_p95_ms?: number;
  span_count?: number;
}

/** Median of an array of numbers. Returns 0 for an empty input. */
const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
};

interface CostRow {
  current?: number;
  avg?: number;
  ratio?: number;
}

interface TokenSurgeRow {
  service?: string;
  service_id?: string;
  current?: number;
  avg?: number;
  ratio?: number;
}

interface RunawayRow {
  agent?: string;
  service?: string;
  p90_ms?: number;
  invocations?: number;
}

import { fmtMs, fmtTokens, toNum } from "../../../data/format";

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

const ratioSeverity = (
  ratio: number,
  warningAt: number,
  criticalAt: number,
): "warning" | "critical" => (ratio >= criticalAt ? "critical" : "warning");

export interface UseAnomaliesResult {
  anomalies: Anomaly[];
  isLoading: boolean;
  error?: Error;
}

export const useAnomalies = (): UseAnomaliesResult => {
  const { scope } = useScope();
  const { samplingRatio } = useSampling();
  const _resolution = useResolvedServices();
  const { serviceIds, isLoading: servicesLoading } = _resolution;
  const canQuery = canQueryScope(_resolution);

  const latency = useScopedDql<LatencyRow>(
    canQuery ? buildLatencySpikeQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );
  const cost = useScopedDql<CostRow>(
    canQuery ? buildCostSpikeQuery(serviceIds) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );
  const tokenSurge = useScopedDql<TokenSurgeRow>(
    canQuery ? buildTokenSurgeQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );
  const runaway = useScopedDql<RunawayRow>(
    canQuery ? buildRunawayAgentQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  return useMemo<UseAnomaliesResult>(() => {
    const anomalies: Anomaly[] = [];

    // Fleet baseline is computed client-side: DQL doesn't allow a subquery
    // inside fieldsAdd, so we take the median of the returned per-service P95s.
    const latencyRecords = latency.data?.records ?? [];
    const fleetBaselineMs = median(
      latencyRecords
        .map((r) => num(r.service_p95_ms))
        .filter((v) => v > 0),
    );
    for (const r of latencyRecords) {
      const servicePerf = num(r.service_p95_ms);
      // p95 latency is sampling-invariant; spanCount is a count() that needs
      // extrapolation for the displayed "across X spans" detail.
      const spanCount = num(r.span_count) * samplingRatio;
      const ratio = fleetBaselineMs > 0 ? servicePerf / fleetBaselineMs : 0;
      if (!r.service || ratio <= THRESHOLDS.latencySpikeRatio) continue;
      anomalies.push({
        id: `latency-${r.service_id ?? r.service}`,
        type: "latency-spike",
        severity: ratioSeverity(ratio, 2.5, 4),
        category: ANOMALY_LABELS["latency-spike"],
        entity: r.service,
        metric: `p95 ${fmtMs(servicePerf)}`,
        context: `${ratio.toFixed(1)}× fleet baseline (${fmtMs(fleetBaselineMs)})`,
        detail: `Service p95 latency for AI spans is ${ratio.toFixed(1)}× the fleet median (across ${latencyRecords.length} services) over ${spanCount} spans.`,
        intents: DEFAULT_FINDING_INTENTS,
      });
    }

    const costRow = cost.data?.records?.[0];
    const costRatio = num(costRow?.ratio);
    if (costRow && costRatio > THRESHOLDS.costSpikeRatio) {
      // ratio is invariant; absolute hourly token counts need extrapolation.
      const current = num(costRow.current) * samplingRatio;
      const avg = num(costRow.avg) * samplingRatio;
      anomalies.push({
        id: "cost-spike",
        type: "cost-spike",
        severity: ratioSeverity(costRatio, 4, 6),
        category: ANOMALY_LABELS["cost-spike"],
        entity: "Fleet",
        metric: `${fmtTokens(current)} tokens / hour`,
        context: `${costRatio.toFixed(1)}× rolling 6h avg (${fmtTokens(avg)}/h)`,
        detail:
          "Hourly token volume across the fleet has spiked relative to the rolling 6h average. Token volume is a stand-in for $-cost until pricing.ts lands (Session 11).",
        intents: DEFAULT_FINDING_INTENTS,
      });
    }

    for (const r of tokenSurge.data?.records ?? []) {
      const ratio = num(r.ratio);
      if (!r.service || ratio <= THRESHOLDS.tokenSurgeRatio) continue;
      anomalies.push({
        id: `token-surge-${r.service_id ?? r.service}`,
        type: "token-surge",
        severity: ratioSeverity(ratio, 15, 25),
        category: ANOMALY_LABELS["token-surge"],
        entity: r.service,
        metric: `${fmtTokens(num(r.current) * samplingRatio)} tokens / hour`,
        context: `${ratio.toFixed(1)}× hourly avg (${fmtTokens(num(r.avg) * samplingRatio)}/h)`,
        detail: `Per-service token volume has surged in the latest hour relative to its own rolling average.`,
        intents: DEFAULT_FINDING_INTENTS,
      });
    }

    for (const r of runaway.data?.records ?? []) {
      const p90 = num(r.p90_ms);
      if (!r.agent || p90 <= THRESHOLDS.runawayAgentP90Ms) continue;
      anomalies.push({
        id: `runaway-${r.service ?? "?"}-${r.agent}`,
        type: "runaway-agent",
        severity: p90 >= 1_200_000 ? "critical" : "warning",
        category: ANOMALY_LABELS["runaway-agent"],
        entity: `${r.agent}${r.service ? ` · ${r.service}` : ""}`,
        metric: `p90 ${fmtMs(p90)}`,
        context: `Above the ${fmtMs(THRESHOLDS.runawayAgentP90Ms)} runaway threshold across ${Math.round((r.invocations ?? 0) * samplingRatio)} invocations`,
        detail: `Agent invocations are running longer than the 10-minute runaway threshold. Likely candidates: unbounded tool loops, retry storms, or a tool that hangs without timeout.`,
        intents: DEFAULT_FINDING_INTENTS,
      });
    }

    anomalies.sort(
      (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
    );

    return {
      anomalies,
      isLoading:
        servicesLoading ||
        latency.isLoading ||
        cost.isLoading ||
        tokenSurge.isLoading ||
        runaway.isLoading,
      error:
        latency.error ??
        cost.error ??
        tokenSurge.error ??
        runaway.error ??
        undefined,
    };
  }, [
    samplingRatio,
    servicesLoading,
    latency.data,
    latency.error,
    latency.isLoading,
    cost.data,
    cost.error,
    cost.isLoading,
    tokenSurge.data,
    tokenSurge.error,
    tokenSurge.isLoading,
    runaway.data,
    runaway.error,
    runaway.isLoading,
  ]);
};
