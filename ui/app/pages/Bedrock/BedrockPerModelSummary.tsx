import React from "react";
import { Skeleton } from "@dynatrace/strato-components/content";
import { EmptyState } from "../../components/EmptyState";
import { MaximizablePanel } from "../../components/MaximizablePanel";
import { DataTable, type DataColumn } from "../../components/DataTable";
import { STATUS_COLOR } from "../../theme/statusColor";
import { fmtCount, fmtMs, fmtPercent, fmtTokens } from "../../data/format";
import { usePerModelSummary } from "../../bedrock/useRuntimeMetrics";
import type { BedrockScope } from "../../bedrock/types";
import type { PerModelSummaryRow } from "../../bedrock/runtimeMetrics";

export interface BedrockPerModelSummaryProps {
  scope: BedrockScope;
}

const cacheHitPct = (r: PerModelSummaryRow): number => {
  const denom = r.cacheRead + r.inTok;
  return denom > 0 ? (r.cacheRead / denom) * 100 : 0;
};

const cacheHitColor = (r: PerModelSummaryRow, pct: number): string | undefined => {
  if (pct >= 50) return STATUS_COLOR.good;
  if (pct < 10 && r.invocations > 0) return STATUS_COLOR.warning;
  return undefined;
};

const columns: DataColumn<PerModelSummaryRow>[] = [
  { key: "model", header: "Model", render: (r) => r.model, mono: true, noTruncate: true, width: 200, minWidth: 140 },
  { key: "invocations", header: "Invocations", render: (r) => fmtCount(r.invocations), align: "right", width: 110 },
  { key: "inTok", header: "In tok", render: (r) => fmtTokens(r.inTok), align: "right", width: 100 },
  { key: "outTok", header: "Out tok", render: (r) => fmtTokens(r.outTok), align: "right", width: 100 },
  { key: "cacheRead", header: "Cache read", render: (r) => fmtTokens(r.cacheRead), align: "right", width: 110 },
  {
    key: "cacheHit",
    header: "Cache hit %",
    render: (r) => {
      const pct = cacheHitPct(r);
      const color = cacheHitColor(r, pct);
      return <span style={color ? { color } : undefined}>{fmtPercent(pct)}</span>;
    },
    align: "right",
    width: 110,
  },
  { key: "latency", header: "Latency", render: (r) => fmtMs(r.latencyMs), align: "right", width: 100 },
  { key: "ttft", header: "TTFT", render: (r) => fmtMs(r.ttftMs), align: "right", width: 100 },
];

/**
 * Runtime 2.0 tile 19: per-model summary table (D19). Throughput, token mix,
 * cache-read reuse, and latency/TTFT averages by model, sourced entirely from
 * `cloud.aws.bedrock.*` metrics (no log join) — already sorted invocations
 * desc by the query itself. Wrapped in MaximizablePanel for a full-screen
 * focused view; the table uses the resizable DataTable.
 */
export const BedrockPerModelSummary = ({ scope }: BedrockPerModelSummaryProps) => {
  const { rows, isLoading } = usePerModelSummary(scope);

  const initialLoading = isLoading && rows.length === 0;

  const totalInvocations = rows.reduce((s, r) => s + r.invocations, 0);
  const bestCacheHit = rows.reduce<{ row: PerModelSummaryRow; pct: number } | null>((best, r) => {
    const pct = cacheHitPct(r);
    return !best || pct > best.pct ? { row: r, pct } : best;
  }, null);

  const stats = [
    { label: "Models", value: fmtCount(rows.length) },
    { label: "Total invocations", value: fmtCount(totalInvocations) },
    ...(bestCacheHit
      ? [{ label: "Best cache hit %", value: bestCacheHit.row.model, sub: fmtPercent(bestCacheHit.pct) }]
      : []),
  ];

  const body = (expanded: boolean) => {
    if (initialLoading) {
      return <Skeleton style={{ height: expanded ? 320 : 180, borderRadius: 8 }} />;
    }
    if (rows.length === 0) {
      return <EmptyState bare title="No per-model metrics in scope" />;
    }
    return (
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.rawModel}
        maxHeight={expanded ? 460 : 220}
      />
    );
  };

  return (
    <MaximizablePanel
      title="Per-model summary"
      subtitle="Throughput, tokens, cache and latency by model — cloud metrics."
      stats={stats}
      expanded={body(true)}
    >
      {body(false)}
    </MaximizablePanel>
  );
};
