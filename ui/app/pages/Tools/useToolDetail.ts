import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useSampling, extrapolate } from "../../scope/SamplingContext";
import { toNum } from "../../data/format";
import { pickMcpIntervalSec } from "../McpHealth/queries";
import { buildToolTimeseriesQuery, buildToolTracesQuery } from "./queries";

interface SeriesRecord {
  calls?: (number | null)[] | null;
  p90?: (number | null)[] | null;
  interval?: string | number;
  timeframe?: { start?: string; end?: string };
}

interface TraceRecord {
  trace_id?: string;
  ts?: string | number;
  dur_ms?: number | string;
  err?: number | string;
  svc?: string;
}

export interface ToolTraceSample {
  traceId: string;
  startMs: number;
  durationMs: number;
  isError: boolean;
  service: string;
}

export interface ToolDetailSeries {
  labels: string[];
  calls: number[];
  p90Ms: number[];
  intervalLabel: string;
}

export interface UseToolDetailResult {
  series: ToolDetailSeries;
  traces: ToolTraceSample[];
  isLoading: boolean;
  error?: Error;
}

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

const toNumArr = (arr: unknown): number[] =>
  Array.isArray(arr) ? arr.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : 0)) : [];

const parseMs = (v: unknown): number => {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const p = Date.parse(v);
    if (!Number.isNaN(p)) return p;
  }
  return Date.now();
};

const intervalLabelFor = (sec: number): string => {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h`;
  return `${Math.round(sec / 86400)}d`;
};

const buildLabels = (count: number, row: SeriesRecord | undefined, intervalSec: number): string[] => {
  if (count === 0) return [];
  const intervalMs = intervalSec * 1000;
  const startMs = row?.timeframe?.start ? Date.parse(row.timeframe.start) : Date.now() - count * intervalMs;
  const base = Number.isFinite(startMs) ? startMs : Date.now() - count * intervalMs;
  const multiDay = count * intervalMs >= 24 * 60 * 60 * 1000;
  const fmt = new Intl.DateTimeFormat(undefined, {
    ...(multiDay
      ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
      : { hour: "numeric", minute: "2-digit" }),
  });
  return Array.from({ length: count }, (_, i) => fmt.format(new Date(base + i * intervalMs)));
};

/** Runs the timeseries + sample-trace queries for one tool. `tool` null = idle. */
export const useToolDetail = (tool: string | null): UseToolDetailResult => {
  const { scope } = useScope();
  const { samplingRatio } = useSampling();
  const intervalSec = pickMcpIntervalSec(scope.timeframe.from);

  const seriesRes = useScopedDql<SeriesRecord>(
    tool ? buildToolTimeseriesQuery(tool, scope.timeframe, intervalSec) : "",
    { enabled: !!tool, staleTime: 60_000 },
  );
  const tracesRes = useScopedDql<TraceRecord>(
    tool ? buildToolTracesQuery(tool, scope.timeframe) : "",
    { enabled: !!tool, staleTime: 60_000, ignoreGlobalFilter: true },
  );

  return useMemo<UseToolDetailResult>(() => {
    const row = seriesRes.data?.records?.[0];
    const callsRaw = toNumArr(row?.calls).map((v) =>
      Math.round(extrapolate(v, samplingRatio) ?? 0),
    );
    const p90Ms = toNumArr(row?.p90).map((ns) => ns / 1_000_000);
    const labels = buildLabels(Math.max(callsRaw.length, p90Ms.length), row, intervalSec);

    const traces: ToolTraceSample[] = (tracesRes.data?.records ?? []).map((r) => ({
      traceId: r.trace_id ?? "",
      startMs: parseMs(r.ts),
      durationMs: num(r.dur_ms),
      isError: num(r.err) > 0,
      service: r.svc ?? "",
    })).filter((t) => t.traceId);

    return {
      series: { labels, calls: callsRaw, p90Ms, intervalLabel: intervalLabelFor(intervalSec) },
      traces,
      isLoading: seriesRes.isLoading || tracesRes.isLoading,
      error: seriesRes.error ?? tracesRes.error ?? undefined,
    };
  }, [seriesRes.data, seriesRes.isLoading, seriesRes.error, tracesRes.data, tracesRes.isLoading, tracesRes.error, samplingRatio, intervalSec]);
};
