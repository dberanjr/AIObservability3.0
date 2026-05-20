import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useResolvedServices, canQueryScope } from "../../scope/useResolvedServices";
import {
  buildCostBaselineQuery,
  buildCostQuery,
  buildOperationalQuery,
  buildQualityPresenceQuery,
} from "./queries";
import type { Pillar, PulseHealth } from "./types";
import { QUALITY_EVAL_SETUP_GUIDE } from "./types";
import { toNum } from "../../data/format";

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

interface OperationalRecord {
  total?: number;
  errors?: number;
  p95_ms?: number;
  p50_ms?: number;
}

interface QualityRecord {
  total?: number;
  with_eval?: number;
  avg_score?: number | null;
}

interface CostRecord {
  requests?: number;
  input_tokens?: number;
  output_tokens?: number;
  distinct_models?: number;
}

interface CostBaselineRecord {
  requests_7d?: number;
  input_tokens_7d?: number;
  output_tokens_7d?: number;
}

const HOURS_PER_WEEK = 24 * 7;

const fmtNum = (n: number): string =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
      ? `${(n / 1_000).toFixed(1)}k`
      : String(Math.round(n));

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const round = (n: number): number => Math.round(n);

const operationalPillar = (rec: OperationalRecord | undefined): Pillar => {
  const total = num(rec?.total);
  if (!rec || total === 0) {
    return {
      key: "operational",
      label: "Operational",
      status: "no-data",
      score: null,
      reasons: [{ text: "No AI spans observed in the current scope." }],
    };
  }
  const errors = num(rec.errors);
  const p95 = num(rec.p95_ms);
  const errorRatePct = (errors / total) * 100;
  const latencyPenalty = clamp((p95 - 2000) / 100, 0, 60);
  const errorPenalty = clamp(errorRatePct * 10, 0, 40);
  const score = clamp(round(100 - latencyPenalty - errorPenalty), 0, 100);
  const status: Pillar["status"] =
    score >= 80 ? "good" : score >= 50 ? "warning" : "critical";

  const reasons: Pillar["reasons"] = [
    {
      text: `p95 latency ${p95.toFixed(0)} ms across ${fmtNum(total)} spans`,
      intent: p95 > 4000 ? "critical" : p95 > 2000 ? "warning" : "info",
    },
    {
      text: `Error rate ${errorRatePct.toFixed(2)}%`,
      intent:
        errorRatePct > 5 ? "critical" : errorRatePct > 1 ? "warning" : "info",
    },
    {
      text: "Active problems · pending Dynatrace Intelligence wire-up",
    },
  ];
  return { key: "operational", label: "Operational", status, score, reasons };
};

const qualityPillar = (rec: QualityRecord | undefined): Pillar => {
  const total = num(rec?.total);
  const withEval = num(rec?.with_eval);
  const setupCta = {
    label: "Setup eval pipeline",
    href: QUALITY_EVAL_SETUP_GUIDE,
  };

  if (total === 0) {
    return {
      key: "quality",
      label: "Quality",
      status: "no-data",
      score: null,
      reasons: [
        { text: "No LLM spans found in the current scope." },
        { text: "Quality scoring requires gen_ai.evaluation.* attributes." },
      ],
      cta: setupCta,
    };
  }

  if (withEval === 0) {
    return {
      key: "quality",
      label: "Quality",
      status: "no-data",
      score: null,
      reasons: [
        {
          text: `No gen_ai.evaluation.* attrs on ${fmtNum(total)} LLM spans`,
          intent: "warning",
        },
        { text: "Add evaluation attrs to LLM spans or run an LLM-as-judge workflow." },
      ],
      cta: setupCta,
    };
  }

  const coverage = (withEval / total) * 100;
  const rawAvg = toNum(rec?.avg_score);
  const avgScore = Number.isFinite(rawAvg) ? rawAvg : null;
  const score = avgScore != null ? clamp(round(avgScore * 100), 0, 100) : null;
  const status: Pillar["status"] =
    score == null
      ? "no-data"
      : score >= 80
        ? "good"
        : score >= 60
          ? "warning"
          : "critical";

  return {
    key: "quality",
    label: "Quality",
    status,
    score,
    reasons: [
      {
        text: `Eval coverage ${coverage.toFixed(0)}% (${fmtNum(withEval)} / ${fmtNum(total)} spans)`,
      },
      ...(avgScore != null
        ? [{ text: `Avg evaluation score ${avgScore.toFixed(2)}` }]
        : []),
    ],
    cta: setupCta,
  };
};

const costPillar = (
  current: CostRecord | undefined,
  baseline: CostBaselineRecord | undefined,
  scopeHours: number,
): Pillar => {
  const inputTokens = num(current?.input_tokens);
  const outputTokens = num(current?.output_tokens);
  const totalTokens = inputTokens + outputTokens;
  const requests = num(current?.requests);
  const distinctModels = num(current?.distinct_models);

  if (requests === 0 || totalTokens === 0) {
    return {
      key: "cost",
      label: "Cost",
      status: "no-data",
      score: null,
      reasons: [{ text: "No token usage observed in the current scope." }],
    };
  }

  const baselineTokens =
    num(baseline?.input_tokens_7d) + num(baseline?.output_tokens_7d);
  const baselinePerHour = baselineTokens / HOURS_PER_WEEK;
  const currentPerHour = scopeHours > 0 ? totalTokens / scopeHours : totalTokens;
  const ratio = baselinePerHour > 0 ? currentPerHour / baselinePerHour : 1;

  const variancePenalty = clamp(Math.abs(ratio - 1) * 40, 0, 60);
  const score = clamp(round(100 - variancePenalty), 0, 100);
  const status: Pillar["status"] =
    ratio > 1.5 ? "critical" : ratio > 1.2 ? "warning" : "good";

  const reasons: Pillar["reasons"] = [
    { text: `${fmtNum(totalTokens)} tokens across ${fmtNum(requests)} requests` },
    {
      text:
        baselinePerHour > 0
          ? `${ratio.toFixed(2)}× rolling 7d hourly baseline`
          : "7d baseline still warming up",
      intent: ratio > 1.5 ? "critical" : ratio > 1.2 ? "warning" : undefined,
    },
    {
      text: `${distinctModels} distinct models in scope`,
    },
  ];
  return { key: "cost", label: "Cost", status, score, reasons };
};

const parseScopeHours = (from: string): number => {
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

export const usePulseHealth = (): PulseHealth => {
  const { scope } = useScope();
  const _resolution = useResolvedServices();
  const { serviceIds, isLoading: servicesLoading } = _resolution;
  const canQuery = canQueryScope(_resolution);

  const opResult = useScopedDql<OperationalRecord>(
    canQuery ? buildOperationalQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );
  const qualityResult = useScopedDql<QualityRecord>(
    canQuery ? buildQualityPresenceQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );
  const costResult = useScopedDql<CostRecord>(
    canQuery ? buildCostQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );
  const costBaselineResult = useScopedDql<CostBaselineRecord>(
    canQuery ? buildCostBaselineQuery(serviceIds) : "",
    { enabled: canQuery, staleTime: 5 * 60_000 },
  );

  return useMemo<PulseHealth>(() => {
    const scopeHours = parseScopeHours(scope.timeframe.from);
    const operational = operationalPillar(opResult.data?.records?.[0]);
    const quality = qualityPillar(qualityResult.data?.records?.[0]);
    const cost = costPillar(
      costResult.data?.records?.[0],
      costBaselineResult.data?.records?.[0],
      scopeHours,
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
    };
  }, [
    scope.timeframe.from,
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
  ]);
};
