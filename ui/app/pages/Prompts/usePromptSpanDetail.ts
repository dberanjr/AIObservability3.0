import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { buildSpanDetailQuery, buildSpanLogsQuery } from "./queries";
import { toNum } from "../../data/format";
import { RAW_DEMO_SPAN_DETAIL_RECORDS_BY_SPAN_ID, DEMO_SPAN_LOG_COUNTS_BY_SPAN_ID } from "./demoData";
import { parseSpanDetailRecord } from "./promptsParse";

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

export interface PromptSpanDetail {
  finishReason: string | null;
  temperature: number | null;
  maxTokens: number | null;
  statusCode: string | null;
  requestModel: string | null;
  responseModel: string | null;
  provider: string | null;
  scope: string | null;
  spanKind: string | null;
}

export interface UsePromptSpanDetailResult {
  detail: PromptSpanDetail | null;
  errorLogs: number;
  warningLogs: number;
  isLoading: boolean;
}

export interface SpanDetailRecord {
  finish_reason?: string;
  temperature?: number;
  max_tokens?: number;
  status_code?: string;
  request_model?: string;
  response_model?: string;
  provider?: string;
  scope?: string;
  span_kind?: string;
}

// `parseSpanDetailRecord` (raw DQL row → PromptSpanDetail) lives in
// `./promptsParse` — a dependency-free pure module — so both this hook and
// the Demo Mode dataset can share it without either importing the other's
// Context-dependent runtime code. Re-exported for anything that still
// imports it from this hook file.
export { parseSpanDetailRecord };

/** Precomputed once at module load, per demo span id, via the SAME
 *  `parseSpanDetailRecord` the real query path uses above. */
const DEMO_SPAN_DETAIL_BY_SPAN_ID: Record<string, PromptSpanDetail | null> = Object.fromEntries(
  Object.entries(RAW_DEMO_SPAN_DETAIL_RECORDS_BY_SPAN_ID).map(([spanId, record]) => [
    spanId,
    parseSpanDetailRecord(record),
  ]),
);

/**
 * Fetches the full span (by span.id) and its ERROR/WARN log counts for the
 * prompt popup — mirrors the platform AI app's per-span detail + logs queries.
 * Opts out of the global filter (a single-span lookup must always resolve).
 */
export const usePromptSpanDetail = (
  spanId: string | null,
  /** True to render the bundled Demo Mode span-detail fixture instead of
   *  querying Grail (Demo Mode Tweak or the page's own no-telemetry fallback). */
  showExample = false,
): UsePromptSpanDetailResult => {
  const { scope } = useScope();
  const enabled = !!spanId && !showExample;

  const detailRes = useScopedDql<SpanDetailRecord>(
    spanId ? buildSpanDetailQuery(spanId, scope.timeframe) : "",
    {
      enabled,
      staleTime: 60_000,
      ignoreGlobalFilter: true,
    },
  );

  const logsRes = useScopedDql<{
    error_logs?: number;
    warning_logs?: number;
  }>(spanId ? buildSpanLogsQuery(spanId, scope.timeframe) : "", {
    enabled,
    staleTime: 60_000,
    ignoreGlobalFilter: true,
  });

  return useMemo<UsePromptSpanDetailResult>(() => {
    if (showExample) {
      const detail = (spanId ? DEMO_SPAN_DETAIL_BY_SPAN_ID[spanId] : null) ?? null;
      const counts = (spanId ? DEMO_SPAN_LOG_COUNTS_BY_SPAN_ID[spanId] : undefined) ?? {
        error: 0,
        warning: 0,
      };
      return {
        detail,
        errorLogs: counts.error,
        warningLogs: counts.warning,
        isLoading: false,
      };
    }
    const detail = parseSpanDetailRecord(detailRes.data?.records?.[0]);
    const lr = logsRes.data?.records?.[0];
    return {
      detail,
      errorLogs: num(lr?.error_logs),
      warningLogs: num(lr?.warning_logs),
      isLoading: detailRes.isLoading || logsRes.isLoading,
    };
  }, [detailRes.data, detailRes.isLoading, logsRes.data, logsRes.isLoading, showExample, spanId]);
};
