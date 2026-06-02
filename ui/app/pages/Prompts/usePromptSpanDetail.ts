import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { buildSpanDetailQuery, buildSpanLogsQuery } from "./queries";
import { toNum } from "../../data/format";

const str = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;
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

/**
 * Fetches the full span (by span.id) and its ERROR/WARN log counts for the
 * prompt popup — mirrors the platform AI app's per-span detail + logs queries.
 * Opts out of the global filter (a single-span lookup must always resolve).
 */
export const usePromptSpanDetail = (
  spanId: string | null,
): UsePromptSpanDetailResult => {
  const { scope } = useScope();
  const enabled = !!spanId;

  const detailRes = useScopedDql<{
    finish_reason?: string;
    temperature?: number;
    max_tokens?: number;
    status_code?: string;
    request_model?: string;
    response_model?: string;
    provider?: string;
    scope?: string;
    span_kind?: string;
  }>(spanId ? buildSpanDetailQuery(spanId, scope.timeframe) : "", {
    enabled,
    staleTime: 60_000,
    ignoreGlobalFilter: true,
  });

  const logsRes = useScopedDql<{
    error_logs?: number;
    warning_logs?: number;
  }>(spanId ? buildSpanLogsQuery(spanId, scope.timeframe) : "", {
    enabled,
    staleTime: 60_000,
    ignoreGlobalFilter: true,
  });

  return useMemo<UsePromptSpanDetailResult>(() => {
    const r = detailRes.data?.records?.[0];
    const detail: PromptSpanDetail | null = r
      ? {
          finishReason: str(r.finish_reason),
          temperature:
            r.temperature == null ? null : num(r.temperature),
          maxTokens: r.max_tokens == null ? null : num(r.max_tokens),
          statusCode: str(r.status_code),
          requestModel: str(r.request_model),
          responseModel: str(r.response_model),
          provider: str(r.provider),
          scope: str(r.scope),
          spanKind: str(r.span_kind),
        }
      : null;
    const lr = logsRes.data?.records?.[0];
    return {
      detail,
      errorLogs: num(lr?.error_logs),
      warningLogs: num(lr?.warning_logs),
      isLoading: detailRes.isLoading || logsRes.isLoading,
    };
  }, [detailRes.data, detailRes.isLoading, logsRes.data, logsRes.isLoading]);
};
