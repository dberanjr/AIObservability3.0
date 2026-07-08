/**
 * AI-bucket detection hook for the Attributes page.
 *
 * Lazily (on `run()`) runs a census of which Grail buckets hold AI spans in the
 * active timeframe. The query is IMMUNE to the span-bucket tweak and any active
 * segment (ignoreBucketFilter + ignoreSegments) and to the global attribute
 * filter (ignoreGlobalFilter — the whole Attributes page is fleet-wide), but
 * still honours the toolbar timeframe, scan-limit, and sampling.
 */

import { useMemo, useState } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useScanLimit } from "../../scope/ScanLimitContext";
import { readScanMeta } from "../../scope/ScanReportContext";
import { toNum } from "../../data/format";
import { buildBucketDetectionQuery } from "./bucketDetection";

export interface BucketCount {
  bucket: string;
  /** Raw AI-span count in the bucket (not sampling-extrapolated). */
  spans: number;
}

export interface BucketDetectionResult {
  /** Trigger the census (idempotent). */
  run: () => void;
  hasRun: boolean;
  isLoading: boolean;
  error?: Error;
  /** Buckets holding >= 1 AI span, sorted by span count desc. */
  buckets: BucketCount[];
  /** True if the census hit its scan-limit budget (results may be partial). */
  limitHit: boolean;
}

interface DetectionRecord {
  "dt.system.bucket"?: string;
  spans?: number | string;
}

export const useBucketDetection = (): BucketDetectionResult => {
  const { scope } = useScope();
  const { scanLimitGb } = useScanLimit();
  const [hasRun, setHasRun] = useState(false);

  const result = useScopedDql<DetectionRecord>(
    buildBucketDetectionQuery(scope.timeframe),
    {
      enabled: hasRun,
      ignoreBucketFilter: true,
      ignoreSegments: true,
      ignoreGlobalFilter: true,
      staleTime: 60_000,
    },
  );

  const buckets = useMemo<BucketCount[]>(() => {
    const recs = result.data?.records ?? [];
    return recs
      .map((r) => ({
        bucket: String(r["dt.system.bucket"] ?? ""),
        spans: toNum(r.spans),
      }))
      .filter((b) => b.bucket)
      .sort((a, b) => b.spans - a.spans);
  }, [result.data]);

  const limitHit = readScanMeta(result, scanLimitGb)?.limitHit ?? false;

  return {
    run: () => setHasRun(true),
    hasRun,
    isLoading: hasRun && result.isLoading,
    error: result.error ?? undefined,
    buckets,
    limitHit,
  };
};
