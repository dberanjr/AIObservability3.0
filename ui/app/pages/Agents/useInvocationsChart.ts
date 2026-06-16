import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import {
  canQueryScope,
  useResolvedServices,
} from "../../scope/useResolvedServices";
import {
  parseScopeMs,
  pickChartBucket,
  intervalPhraseFromMs,
} from "../../scope/chartInterval";
import type {
  AxisTick,
  ChartTimeDomain,
  ForecastBand,
} from "../../components/charts/AreaChart";
import type { ChartStat } from "../../components/charts/ChartExpander";
import { fmtCount } from "../../data/format";
import { buildInvocationsSeriesQuery } from "./queries";
import { useInvocationsForecast } from "./useInvocationsForecast";

interface SeriesRecord {
  invocations?: (number | null)[] | null;
  /** makeTimeseries echoes the actual (snapped) interval in nanoseconds. */
  interval?: string | number | null;
  /** ...and the actual analysed window. */
  timeframe?: { start?: string; end?: string } | null;
}

const buildLabels = (
  startMs: number,
  endMs: number,
  intervalMs: number,
  historicalCount: number,
  forecastCount: number,
): string[] => {
  const out: string[] = [];
  for (let i = 0; i < historicalCount; i++) {
    const agoMs = endMs - (startMs + i * intervalMs);
    if (agoMs < 60_000) out.push("just now");
    else if (agoMs < 3_600_000) out.push(`${Math.round(agoMs / 60_000)}m ago`);
    else if (agoMs < 86_400_000) out.push(`${Math.round(agoMs / 3_600_000)}h ago`);
    else out.push(`${Math.round(agoMs / 86_400_000)}d ago`);
  }
  for (let i = 1; i <= forecastCount; i++) {
    const aheadMs = i * intervalMs;
    if (aheadMs < 3_600_000) out.push(`+${Math.round(aheadMs / 60_000)}m`);
    else if (aheadMs < 86_400_000) out.push(`+${Math.round(aheadMs / 3_600_000)}h`);
    else out.push(`+${Math.round(aheadMs / 86_400_000)}d`);
  }
  return out;
};

const buildAxisTicks = (
  startMs: number,
  intervalMs: number,
  historicalCount: number,
  forecastCount: number,
  targetCount = 6,
): AxisTick[] => {
  const totalBuckets = historicalCount + forecastCount;
  if (totalBuckets < 2) return [];
  const totalSpanMs = totalBuckets * intervalMs;
  const multiDay = totalSpanMs >= 24 * 60 * 60 * 1000;
  const tsFmt = new Intl.DateTimeFormat(undefined, {
    ...(multiDay
      ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
      : { hour: "numeric", minute: "2-digit" }),
  });
  const ticks: AxisTick[] = [];
  for (let k = 0; k < targetCount; k++) {
    const index = Math.round((k / (targetCount - 1)) * (totalBuckets - 1));
    ticks.push({
      index,
      label: tsFmt.format(new Date(startMs + index * intervalMs)),
    });
  }
  return ticks;
};

export interface InvocationsChartModel {
  /** Combined historical (+ forecast-null-padded) invocation series. */
  values: (number | null)[];
  forecastBands: ForecastBand[];
  xLabels: string[];
  axisTicks: AxisTick[];
  xDomain: ChartTimeDomain | undefined;
  stats: ChartStat[];
  total: number;
  intervalMs: number;
  /** Readable granularity phrase, e.g. "5 min" / "1 hour". */
  intervalPhrase: string;
  isLoading: boolean;
  isEmpty: boolean;
  forecastLoading: boolean;
  forecastError?: Error;
}

/**
 * Shared data + forecast model for the agent-invocations time series. Used by
 * both the hero "Invocations" chart card and the Invocations KPI-tile popup so
 * they stay in lock-step (and share the react-query cache for the series).
 *
 * The granularity is the SAME snapped bucket every other timeseries chart in
 * the app uses (`pickChartBucket`), and the x-axis is mapped from the actual
 * interval + window echoed back by makeTimeseries so labels are exact.
 */
export const useInvocationsChart = (
  forecastEnabled: boolean,
): InvocationsChartModel => {
  const { scope } = useScope();
  const resolution = useResolvedServices();
  const canQuery = canQueryScope(resolution);

  const requestedSec = useMemo(
    () => pickChartBucket(parseScopeMs(scope.timeframe.from)).sec,
    [scope.timeframe.from],
  );

  const series = useScopedDql<SeriesRecord>(
    canQuery
      ? buildInvocationsSeriesQuery(
          resolution.serviceIds,
          scope.timeframe,
          requestedSec,
        )
      : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  const record = series.data?.records?.[0];

  const historical = useMemo(
    () => (record?.invocations ?? []).map((v) => (typeof v === "number" ? v : 0)),
    [record],
  );
  const histLen = historical.length;

  // Prefer the actual interval + window makeTimeseries reports; fall back to
  // the requested snapped bucket / a now()-anchored window.
  const intervalMs = useMemo(() => {
    const ns = record?.interval == null ? NaN : Number(record.interval);
    return Number.isFinite(ns) && ns > 0 ? ns / 1_000_000 : requestedSec * 1000;
  }, [record, requestedSec]);

  const { startMs, endMs } = useMemo(() => {
    const start = record?.timeframe?.start
      ? Date.parse(record.timeframe.start)
      : NaN;
    const end = record?.timeframe?.end ? Date.parse(record.timeframe.end) : NaN;
    if (Number.isFinite(start) && Number.isFinite(end)) {
      return { startMs: start, endMs: end };
    }
    const now = Date.now();
    return { startMs: now - histLen * intervalMs, endMs: now };
  }, [record, histLen, intervalMs]);

  const forecast = useInvocationsForecast(
    forecastEnabled,
    requestedSec,
    histLen,
  );
  const fc = forecast.forecast;
  const forecastLen = forecastEnabled && fc ? fc.values.length : 0;

  const values = useMemo<(number | null)[]>(
    () => (historical as (number | null)[]).concat(new Array(forecastLen).fill(null)),
    [historical, forecastLen],
  );

  const forecastBands = useMemo<ForecastBand[]>(() => {
    if (!forecastEnabled || !fc || histLen === 0) return [];
    const leadingNulls = new Array<number | null>(histLen).fill(null);
    return [
      {
        values: leadingNulls.concat(fc.values),
        lower: leadingNulls.concat(fc.lower),
        upper: leadingNulls.concat(fc.upper),
        startIdx: histLen,
        color: "var(--purple-2)",
        label: "Forecast invocations",
        axis: "left",
      },
    ];
  }, [forecastEnabled, fc, histLen]);

  const xLabels = useMemo(
    () => buildLabels(startMs, endMs, intervalMs, histLen, forecastLen),
    [startMs, endMs, intervalMs, histLen, forecastLen],
  );
  const axisTicks = useMemo(
    () => buildAxisTicks(startMs, intervalMs, histLen, forecastLen, 6),
    [startMs, intervalMs, histLen, forecastLen],
  );

  const xDomain = useMemo<ChartTimeDomain | undefined>(() => {
    if (histLen === 0) return undefined;
    return { startMs, endMs: endMs + forecastLen * intervalMs };
  }, [histLen, startMs, endMs, forecastLen, intervalMs]);

  const total = useMemo(
    () => historical.reduce((acc, v) => acc + v, 0),
    [historical],
  );

  const phrase = intervalPhraseFromMs(intervalMs);

  const stats = useMemo<ChartStat[]>(() => {
    if (historical.length === 0) return [];
    const min = historical.reduce((a, b) => Math.min(a, b), Infinity);
    const max = historical.reduce((a, b) => Math.max(a, b), -Infinity);
    const avg = total / Math.max(1, historical.length);
    const sorted = [...historical].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    return [
      { label: "Total invocations", value: fmtCount(total) },
      { label: `Min per ${phrase}`, value: fmtCount(min) },
      { label: `Median per ${phrase}`, value: fmtCount(median) },
      { label: `Avg per ${phrase}`, value: fmtCount(Math.round(avg)) },
      { label: `Peak per ${phrase}`, value: fmtCount(max) },
    ];
  }, [historical, total, phrase]);

  return {
    values,
    forecastBands,
    xLabels,
    axisTicks,
    xDomain,
    stats,
    total,
    intervalMs,
    intervalPhrase: phrase,
    isLoading: series.isLoading,
    isEmpty: !series.isLoading && histLen === 0,
    forecastLoading: forecast.isLoading,
    forecastError: forecast.error,
  };
};
