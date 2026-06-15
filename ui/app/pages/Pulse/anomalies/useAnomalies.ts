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
  buildWithinTraceGrowthQuery,
  buildModelMismatchQuery,
  buildTruncationQuery,
  buildRateLimitQuery,
  buildTtftDegradationQuery,
} from "./queries";
import {
  ANOMALY_LABELS,
  SEVERITY_RANK,
  THRESHOLDS,
  type Anomaly,
} from "./types";
import { DEFAULT_FINDING_INTENTS } from "../../../components/drawers/types";
import { useCapability } from "../../../scope/CapabilityContext";
import { normalizeModelKey, type NormalizedTokens } from "../../../data/pricing";
import {
  detectWithinTraceGrowth,
  WITHIN_TRACE_GROWTH_RATIO,
} from "./growthDetector";

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

interface GrowthRow {
  trace?: string;
  agent?: string | null;
  ins?: Array<number | string>;
  outs?: Array<number | string>;
  cacheReads?: Array<number | string>;
  cacheWrites?: Array<number | string>;
  n?: number;
}
interface MismatchRow {
  req?: string;
  resp?: string;
  requests?: number;
}
interface RatioRow {
  total?: number;
  truncated?: number;
  rate_limited?: number;
  current?: number;
  avg?: number;
  ratio?: number;
}

import { fmtMs, fmtTokens, fmtPercent, toNum } from "../../../data/format";

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
  const cap = useCapability();
  const growth = useScopedDql<GrowthRow>(
    canQuery ? buildWithinTraceGrowthQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );
  const mismatch = useScopedDql<MismatchRow>(
    canQuery ? buildModelMismatchQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );
  const truncation = useScopedDql<RatioRow>(
    canQuery ? buildTruncationQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );
  const rateLimit = useScopedDql<RatioRow>(
    canQuery ? buildRateLimitQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );
  // TTFT degradation only queries when a TTFT attribute is actually emitted.
  const ttftPresent = cap.has("ttft");
  const ttft = useScopedDql<RatioRow>(
    canQuery && ttftPresent
      ? buildTtftDegradationQuery(serviceIds, scope.timeframe)
      : "",
    { enabled: canQuery && ttftPresent, staleTime: 60_000 },
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
          "Hourly token volume across the fleet has spiked relative to the rolling 6h average. Cost is priced through the cache-aware cost model.",
        intents: DEFAULT_FINDING_INTENTS,
        layer: "llm",
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
        layer: "llm",
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
        layer: "agent",
      });
    }

    // I.1 — within-trace billable-token growth (agent / orchestrator).
    let growthTraces = 0;
    let worstGrowth = 0;
    let worstGrowthAgent: string | null = null;
    for (const r of growth.data?.records ?? []) {
      const ins = r.ins ?? [];
      const outs = r.outs ?? [];
      const reads = r.cacheReads ?? [];
      const writes = r.cacheWrites ?? [];
      const len = Math.min(ins.length, outs.length);
      if (len < 3) continue;
      const calls: NormalizedTokens[] = [];
      for (let i = 0; i < len; i++) {
        calls.push({
          inputTokens: num(ins[i]),
          outputTokens: num(outs[i]),
          cacheReadTokens: num(reads[i]),
          cacheWriteTokens: num(writes[i]),
        });
      }
      const res = detectWithinTraceGrowth(calls);
      if (res.fired) {
        growthTraces++;
        if (res.growthRatio > worstGrowth) {
          worstGrowth = res.growthRatio;
          worstGrowthAgent = r.agent ?? null;
        }
      }
    }
    if (growthTraces > 0) {
      anomalies.push({
        id: "within-trace-growth",
        type: "within-trace-growth",
        severity:
          worstGrowth >= 2 * WITHIN_TRACE_GROWTH_RATIO ? "critical" : "warning",
        category: ANOMALY_LABELS["within-trace-growth"],
        entity: worstGrowthAgent ?? "Fleet",
        metric: `${growthTraces} trace${growthTraces === 1 ? "" : "s"}`,
        context: `Billable tokens climbing up to ${worstGrowth.toFixed(1)}× within a trace`,
        detail:
          "Sequential LLM calls in a trace re-send an accumulating scratchpad/history, so billable tokens (cache reads excluded) climb iteration over iteration — the classic agent token runaway. Trim history, summarize, or cache the stable prefix.",
        intents: DEFAULT_FINDING_INTENTS,
        layer: "orchestrator",
      });
    }

    // I.4 — model fallback / request-vs-response mismatch (version-normalized).
    let mismatched = 0;
    let mismatchTotal = 0;
    for (const r of mismatch.data?.records ?? []) {
      const c = num(r.requests);
      mismatchTotal += c;
      if (
        r.req &&
        r.resp &&
        normalizeModelKey(r.req) !== normalizeModelKey(r.resp)
      )
        mismatched += c;
    }
    const mismatchRatio = mismatchTotal > 0 ? mismatched / mismatchTotal : 0;
    if (mismatchRatio > THRESHOLDS.modelMismatchRatio) {
      anomalies.push({
        id: "model-mismatch",
        type: "model-mismatch",
        severity: mismatchRatio >= 0.5 ? "warning" : "info",
        category: ANOMALY_LABELS["model-mismatch"],
        entity: "Fleet",
        metric: fmtPercent(mismatchRatio * 100),
        context:
          "Requests served by a different model than requested (version suffixes normalized out)",
        detail:
          "The provider returned a different model than requested on a meaningful share of calls — a fallback/routing change that can shift cost and quality. Version-only differences (dated snapshots) are not counted.",
        intents: DEFAULT_FINDING_INTENTS,
        layer: "llm",
      });
    }

    // Max-token truncation / context-window exhaustion.
    const truncRow = truncation.data?.records?.[0];
    const truncRatio = num(truncRow?.ratio);
    if (truncRow && truncRatio > THRESHOLDS.truncationRatio) {
      anomalies.push({
        id: "truncation",
        type: "truncation",
        severity: truncRatio >= 0.1 ? "critical" : "warning",
        category: ANOMALY_LABELS.truncation,
        entity: "Fleet",
        metric: fmtPercent(truncRatio * 100),
        context: "Responses truncated for length (finish_reason max_tokens / length)",
        detail:
          "A share of generations hit the output/context limit and were cut off, returning incomplete answers. Raise max_tokens, shorten prompts, or chunk the work.",
        intents: DEFAULT_FINDING_INTENTS,
        layer: "llm",
      });
    }

    // I.3 — provider rate-limit / backoff.
    const rlRow = rateLimit.data?.records?.[0];
    const rlRatio = num(rlRow?.ratio);
    if (rlRow && num(rlRow.rate_limited) > 0 && rlRatio > THRESHOLDS.rateLimitRatio) {
      anomalies.push({
        id: "rate-limit",
        type: "rate-limit",
        severity: rlRatio >= 0.05 ? "critical" : "warning",
        category: ANOMALY_LABELS["rate-limit"],
        entity: "Fleet",
        metric: fmtPercent(rlRatio * 100),
        context: "429 / throttling responses at the LLM boundary",
        detail:
          "The provider rate-limited a share of requests. Look for retry storms with exponential backoff, smooth burst traffic, or raise the provider quota.",
        intents: DEFAULT_FINDING_INTENTS,
        layer: "llm",
      });
    }

    // I.5 — TTFT degradation (only when a TTFT attribute is emitted).
    if (ttftPresent) {
      const tRow = ttft.data?.records?.[0];
      const tRatio = num(tRow?.ratio);
      if (tRow && tRatio > THRESHOLDS.ttftDegradationRatio) {
        anomalies.push({
          id: "ttft-degradation",
          type: "ttft-degradation",
          severity: tRatio >= 2 ? "critical" : "warning",
          category: ANOMALY_LABELS["ttft-degradation"],
          entity: "Fleet",
          metric: `${tRatio.toFixed(1)}× baseline`,
          context: `Latest-hour time-to-first-token vs rolling average (${fmtMs(num(tRow.avg))})`,
          detail:
            "Streaming responses are taking longer to start than their recent baseline — a provider-side or queueing regression users feel immediately.",
          intents: DEFAULT_FINDING_INTENTS,
          layer: "llm",
        });
      }
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
        runaway.isLoading ||
        growth.isLoading ||
        mismatch.isLoading ||
        truncation.isLoading ||
        rateLimit.isLoading ||
        ttft.isLoading,
      error:
        latency.error ??
        cost.error ??
        tokenSurge.error ??
        runaway.error ??
        growth.error ??
        mismatch.error ??
        truncation.error ??
        rateLimit.error ??
        ttft.error ??
        undefined,
    };
  }, [
    samplingRatio,
    servicesLoading,
    ttftPresent,
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
    growth.data,
    growth.error,
    growth.isLoading,
    mismatch.data,
    mismatch.error,
    mismatch.isLoading,
    truncation.data,
    truncation.error,
    truncation.isLoading,
    rateLimit.data,
    rateLimit.error,
    rateLimit.isLoading,
    ttft.data,
    ttft.error,
    ttft.isLoading,
  ]);
};
