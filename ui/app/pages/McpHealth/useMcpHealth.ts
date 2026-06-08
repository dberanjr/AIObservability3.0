import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useSampling, extrapolate } from "../../scope/SamplingContext";
import { toNum } from "../../data/format";
import { buildMcpActivityQuery, buildMcpHealthQuery, pickMcpIntervalSec } from "./queries";
import {
  computeMcpStatus,
  MCP_STATUS_META,
  MCP_STATUS_SEVERITY,
  type McpStatus,
  type McpTone,
} from "./status";

const AGGREGATE_LABEL = "mcp.server (aggregate)";

interface HealthRecord {
  tool?: string;
  calls?: number | string;
  errors?: number | string;
  error_rate_pct?: number | string;
  p50_ms?: number | string;
  p95_ms?: number | string;
  p99_ms?: number | string;
  max_ms?: number | string;
}

interface ActivityRecord {
  mcp_server_calls?: (number | null)[] | null;
  tool_calls?: (number | null)[] | null;
  errors?: (number | null)[] | null;
  interval?: string | number;
  timeframe?: { start?: string; end?: string };
}

export interface McpToolRow {
  key: string;
  /** Display name with the trailing ".tool" suffix stripped. */
  label: string;
  /** Raw span.name as stored, for click-to-filter. */
  rawTool: string;
  calls: number;
  errors: number;
  errorRatePct: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  status: McpStatus;
  statusLabel: string;
  statusColor: string;
}

export interface McpKpis {
  mcpRequests: number;
  toolCalls: number;
  total: number;
  errorRatePct: number;
  toolTypes: number;
  serverP95Ms: number;
  serverP99Ms: number;
}

export interface McpAlert {
  key: string;
  tool: string;
  message: string;
  tone: McpTone;
  color: string;
}

export interface McpActivitySeries {
  mcpServerCalls: number[];
  errors: number[];
  labels: string[];
  intervalLabel: string;
}

export interface UseMcpHealthResult {
  rows: McpToolRow[];
  kpis: McpKpis;
  series: McpActivitySeries;
  alerts: McpAlert[];
  /** True when no MCP or tool spans were found in the window. */
  isEmpty: boolean;
  isLoading: boolean;
  error?: Error;
}

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

const stripToolSuffix = (name: string): string =>
  name === AGGREGATE_LABEL ? name : name.replace(/\.tool$/, "");

const toNumArr = (arr: unknown): number[] =>
  Array.isArray(arr)
    ? arr.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : 0))
    : [];

const formatIntervalLabel = (sec: number): string => {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h`;
  return `${Math.round(sec / 86400)}d`;
};

export const useMcpHealth = (): UseMcpHealthResult => {
  const { scope } = useScope();
  const { samplingRatio } = useSampling();

  const intervalSec = pickMcpIntervalSec(scope.timeframe.from);

  const healthRes = useScopedDql<HealthRecord>(
    buildMcpHealthQuery(scope.timeframe),
    { staleTime: 60_000 },
  );
  const activityRes = useScopedDql<ActivityRecord>(
    buildMcpActivityQuery(scope.timeframe, intervalSec),
    { staleTime: 60_000 },
  );

  return useMemo<UseMcpHealthResult>(() => {
    const records = healthRes.data?.records ?? [];

    // Counts are sampled aggregates — extrapolate to the unsampled population.
    // Percentiles and the server-computed error_rate_pct are sampling-invariant.
    const ex = (v: unknown): number => Math.round(extrapolate(num(v), samplingRatio) ?? 0);

    const aggregate = records.find((r) => r.tool === AGGREGATE_LABEL);
    const toolRecords = records.filter((r) => r.tool && r.tool !== AGGREGATE_LABEL);

    const rows: McpToolRow[] = toolRecords.map((r) => {
      const errorRatePct = num(r.error_rate_pct);
      const p50Ms = num(r.p50_ms);
      const p95Ms = num(r.p95_ms);
      const status = computeMcpStatus({ errorRatePct, p50Ms, p95Ms });
      const meta = MCP_STATUS_META[status];
      const rawTool = r.tool ?? "";
      return {
        key: rawTool,
        label: stripToolSuffix(rawTool),
        rawTool,
        calls: ex(r.calls),
        errors: ex(r.errors),
        errorRatePct,
        p50Ms,
        p95Ms,
        p99Ms: num(r.p99_ms),
        maxMs: num(r.max_ms),
        status,
        statusLabel: meta.label,
        statusColor: meta.color,
      };
    });

    const mcpRequests = ex(aggregate?.calls);
    const toolCalls = rows.reduce((a, b) => a + b.calls, 0);
    const total = mcpRequests + toolCalls;
    const totalErrors = ex(aggregate?.errors) + rows.reduce((a, b) => a + b.errors, 0);
    const kpis: McpKpis = {
      mcpRequests,
      toolCalls,
      total,
      errorRatePct: total > 0 ? (totalErrors / total) * 100 : 0,
      toolTypes: rows.length,
      serverP95Ms: num(aggregate?.p95_ms),
      serverP99Ms: num(aggregate?.p99_ms),
    };

    // Alert band: tools that breach a threshold, errors first then latency
    // outliers, capped at the top 3.
    const alerts: McpAlert[] = rows
      .filter((r) => r.status !== "healthy")
      .sort((a, b) => {
        const sev = MCP_STATUS_SEVERITY[a.status] - MCP_STATUS_SEVERITY[b.status];
        if (sev !== 0) return sev;
        // Within the same severity, worst error rate / worst tail first.
        if (a.status === "error") return b.errorRatePct - a.errorRatePct;
        return b.p99Ms - a.p99Ms;
      })
      .slice(0, 3)
      .map((r) => {
        const meta = MCP_STATUS_META[r.status];
        const message =
          r.status === "error"
            ? `${r.errorRatePct}% error rate (${r.errors} of ${r.calls} calls)`
            : `p95 ${fmtAlertMs(r.p95Ms)}, p99 ${fmtAlertMs(r.p99Ms)}`;
        return {
          key: r.key,
          tool: r.label,
          message,
          tone: meta.tone,
          color: meta.color,
        };
      });

    // Activity series — extrapolate per-bucket counts, treat nulls as 0.
    const activityRow = activityRes.data?.records?.[0];
    const serverSeries = toNumArr(activityRow?.mcp_server_calls).map((v) =>
      Math.round((extrapolate(v, samplingRatio) ?? 0) as number),
    );
    const errorSeries = toNumArr(activityRow?.errors).map((v) =>
      Math.round((extrapolate(v, samplingRatio) ?? 0) as number),
    );
    const labels = buildBucketLabels(
      Math.max(serverSeries.length, errorSeries.length),
      activityRow,
      intervalSec,
    );

    const isEmpty = !healthRes.isLoading && records.length === 0;

    return {
      rows,
      kpis,
      series: {
        mcpServerCalls: serverSeries,
        errors: errorSeries,
        labels,
        intervalLabel: formatIntervalLabel(intervalSec),
      },
      alerts,
      isEmpty,
      isLoading: healthRes.isLoading || activityRes.isLoading,
      error: healthRes.error ?? activityRes.error ?? undefined,
    };
  }, [
    healthRes.data,
    healthRes.isLoading,
    healthRes.error,
    activityRes.data,
    activityRes.isLoading,
    activityRes.error,
    samplingRatio,
    intervalSec,
  ]);
};

/** Alert-copy latency formatter. Seconds at/above 1000ms, ms below. No em dashes. */
const fmtAlertMs = (ms: number): string =>
  ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;

/**
 * Build per-bucket x-axis labels from the makeTimeseries timeframe + interval.
 * Falls back to a now-anchored series when the record omits the timeframe.
 */
const buildBucketLabels = (
  count: number,
  row: ActivityRecord | undefined,
  intervalSec: number,
): string[] => {
  if (count === 0) return [];
  const intervalMs = intervalSec * 1000;
  const startMs = row?.timeframe?.start
    ? Date.parse(row.timeframe.start)
    : Date.now() - count * intervalMs;
  const base = Number.isFinite(startMs) ? startMs : Date.now() - count * intervalMs;
  const multiDay = count * intervalMs >= 24 * 60 * 60 * 1000;
  const fmt = new Intl.DateTimeFormat(undefined, {
    ...(multiDay
      ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
      : { hour: "numeric", minute: "2-digit" }),
  });
  return Array.from({ length: count }, (_, i) => fmt.format(new Date(base + i * intervalMs)));
};
