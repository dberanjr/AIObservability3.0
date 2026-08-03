/**
 * Runtime Observability 2.0 metric hooks — thin `useScopedDql` + parser
 * wrappers for the three metric families the original Bedrock page lacked
 * (per-model TPM quota, log-delivery health, latency/TTFT bands) plus the
 * per-model summary. Mirrors `useBedrock.ts` (metric timeseries, so the
 * span-only injectors are bypassed via the `ignore*` flags).
 */

import { useMemo } from "react";
import type { ResultRecord } from "@dynatrace-sdk/client-query";
import { useScopedDql } from "../scope/useScopedDql";
import type { BedrockScope } from "./types";
import {
  buildTpmByModelQuery,
  buildLogDeliveryQuery,
  buildLatencyBandsQuery,
  buildTtftBandsQuery,
  buildPerModelSummaryQuery,
  parseTpmByModel,
  parseLogDelivery,
  parseBands,
  parsePerModelSummary,
  type TpmModelRow,
  type LogDelivery,
  type MetricBands,
  type PerModelSummaryRow,
} from "./runtimeMetrics";
import {
  DEMO_TPM_BY_MODEL,
  DEMO_LOG_DELIVERY,
  DEMO_LATENCY_BANDS,
  DEMO_TTFT_BANDS,
  DEMO_PER_MODEL_SUMMARY,
} from "./demoData";

const IGNORE = {
  ignoreGlobalFilter: true,
  ignoreBucketFilter: true,
  ignoreSegments: true,
  staleTime: 60_000,
} as const;

type Rec = Record<string, unknown>;
const recs = (data: { records?: ResultRecord[] } | undefined): Rec[] =>
  data?.records ?? [];

export const useTpmByModel = (
  s: BedrockScope,
): { rows: TpmModelRow[]; peak: number; isLoading: boolean } => {
  const res = useScopedDql<ResultRecord>(buildTpmByModelQuery(s), {
    ...IGNORE,
    enabled: !s.showExample,
  });
  return useMemo(() => {
    if (s.showExample) {
      return { rows: DEMO_TPM_BY_MODEL, peak: DEMO_TPM_BY_MODEL.length ? Math.max(...DEMO_TPM_BY_MODEL.map((r) => r.peak)) : 0, isLoading: false };
    }
    const rows = parseTpmByModel(recs(res.data));
    return { rows, peak: rows.length ? Math.max(...rows.map((r) => r.peak)) : 0, isLoading: res.isLoading };
  }, [s.showExample, res.data, res.isLoading]);
};

export const useLogDelivery = (
  s: BedrockScope,
): { delivery: LogDelivery; isLoading: boolean } => {
  const res = useScopedDql<ResultRecord>(buildLogDeliveryQuery(s), {
    ...IGNORE,
    enabled: !s.showExample,
  });
  return useMemo(() => {
    if (s.showExample) return { delivery: DEMO_LOG_DELIVERY, isLoading: false };
    return { delivery: parseLogDelivery(recs(res.data)), isLoading: res.isLoading };
  }, [s.showExample, res.data, res.isLoading]);
};

export const useLatencyBands = (
  s: BedrockScope,
): { latency: MetricBands; ttft: MetricBands; isLoading: boolean } => {
  const lat = useScopedDql<ResultRecord>(buildLatencyBandsQuery(s), {
    ...IGNORE,
    enabled: !s.showExample,
  });
  const ttft = useScopedDql<ResultRecord>(buildTtftBandsQuery(s), {
    ...IGNORE,
    enabled: !s.showExample,
  });
  return useMemo(() => {
    if (s.showExample) return { latency: DEMO_LATENCY_BANDS, ttft: DEMO_TTFT_BANDS, isLoading: false };
    return {
      latency: parseBands(recs(lat.data)),
      ttft: parseBands(recs(ttft.data)),
      isLoading: lat.isLoading || ttft.isLoading,
    };
  }, [s.showExample, lat.data, lat.isLoading, ttft.data, ttft.isLoading]);
};

export const usePerModelSummary = (
  s: BedrockScope,
): { rows: PerModelSummaryRow[]; isLoading: boolean } => {
  const res = useScopedDql<ResultRecord>(buildPerModelSummaryQuery(s), {
    ...IGNORE,
    enabled: !s.showExample,
  });
  return useMemo(() => {
    if (s.showExample) return { rows: DEMO_PER_MODEL_SUMMARY, isLoading: false };
    return { rows: parsePerModelSummary(recs(res.data)), isLoading: res.isLoading };
  }, [s.showExample, res.data, res.isLoading]);
};
