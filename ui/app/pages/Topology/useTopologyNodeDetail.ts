import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useSampling, extrapolate } from "../../scope/SamplingContext";
import { toNum } from "../../data/format";
import { pickChartIntervalSec } from "../../scope/chartInterval";
import { buildNodeRedQuery, buildNodeSeriesQuery, nodeFilterExpr } from "./aggregateQueries";
import type { AggNode } from "./useAggregateTopology";

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};
const toNumArr = (arr: unknown): number[] =>
  Array.isArray(arr) ? arr.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : 0)) : [];

interface RedRecord {
  calls?: number | string;
  errors?: number | string;
  p50?: number | string;
  p90?: number | string;
  p99?: number | string;
}
interface SeriesRecord {
  calls?: (number | null)[] | null;
  p90?: (number | null)[] | null;
  timeframe?: { start?: string; end?: string };
}

export interface NodeRed {
  calls: number;
  errors: number;
  errorRatePct: number;
  p50Ms: number;
  p90Ms: number;
  p99Ms: number;
}
export interface NodeSeries {
  labels: string[];
  calls: number[];
  p90Ms: number[];
  intervalLabel: string;
}
export interface UseNodeDetailResult {
  red: NodeRed;
  series: NodeSeries;
  isLoading: boolean;
}

const intervalLabel = (sec: number): string =>
  sec < 60 ? `${sec}s` : sec < 3600 ? `${Math.round(sec / 60)}m` : sec < 86400 ? `${Math.round(sec / 3600)}h` : `${Math.round(sec / 86400)}d`;

const buildLabels = (count: number, row: SeriesRecord | undefined, intervalSec: number): string[] => {
  if (count === 0) return [];
  const intervalMs = intervalSec * 1000;
  const startMs = row?.timeframe?.start ? Date.parse(row.timeframe.start) : Date.now() - count * intervalMs;
  const base = Number.isFinite(startMs) ? startMs : Date.now() - count * intervalMs;
  const multiDay = count * intervalMs >= 24 * 60 * 60 * 1000;
  const fmt = new Intl.DateTimeFormat(undefined, multiDay
    ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
    : { hour: "numeric", minute: "2-digit" });
  return Array.from({ length: count }, (_, i) => fmt.format(new Date(base + i * intervalMs)));
};

/** RED metrics + volume/p90 series for a selected topology node. */
export const useTopologyNodeDetail = (node: AggNode | null): UseNodeDetailResult => {
  const { scope } = useScope();
  const { samplingRatio } = useSampling();
  const intervalSec = pickChartIntervalSec(scope.timeframe.from);
  const expr = node ? nodeFilterExpr(node.tier, node.label) : "";

  const redRes = useScopedDql<RedRecord>(
    node ? buildNodeRedQuery(expr, scope.timeframe) : "",
    { enabled: !!node, staleTime: 60_000, ignoreGlobalFilter: true },
  );
  const seriesRes = useScopedDql<SeriesRecord>(
    node ? buildNodeSeriesQuery(expr, scope.timeframe, intervalSec) : "",
    { enabled: !!node, staleTime: 60_000, ignoreGlobalFilter: true },
  );

  return useMemo<UseNodeDetailResult>(() => {
    const r = redRes.data?.records?.[0];
    const ex = (v: unknown): number => Math.round(extrapolate(num(v), samplingRatio) ?? 0);
    const calls = ex(r?.calls);
    const errors = ex(r?.errors);
    const red: NodeRed = {
      calls,
      errors,
      errorRatePct: calls > 0 ? (errors / calls) * 100 : 0,
      p50Ms: num(r?.p50) / 1_000_000,
      p90Ms: num(r?.p90) / 1_000_000,
      p99Ms: num(r?.p99) / 1_000_000,
    };

    const srow = seriesRes.data?.records?.[0];
    const callsArr = toNumArr(srow?.calls).map((v) => Math.round(extrapolate(v, samplingRatio) ?? 0));
    const p90Ms = toNumArr(srow?.p90).map((ns) => ns / 1_000_000);
    const labels = buildLabels(Math.max(callsArr.length, p90Ms.length), srow, intervalSec);

    return {
      red,
      series: { labels, calls: callsArr, p90Ms, intervalLabel: intervalLabel(intervalSec) },
      isLoading: redRes.isLoading || seriesRes.isLoading,
    };
  }, [redRes.data, redRes.isLoading, seriesRes.data, seriesRes.isLoading, samplingRatio, intervalSec]);
};
