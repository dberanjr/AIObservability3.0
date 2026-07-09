import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { EmptyState } from "../../components/EmptyState";
import { STATUS_COLOR } from "../../theme/statusColor";
import { fmtCount, fmtMs, fmtPercent, fmtTokens } from "../../data/format";
import { usePerModelSummary } from "../../bedrock/useRuntimeMetrics";
import type { BedrockScope } from "../../bedrock/types";
import type { PerModelSummaryRow } from "../../bedrock/runtimeMetrics";

export interface BedrockPerModelSummaryProps {
  scope: BedrockScope;
}

interface Column {
  id: string;
  label: string;
  width?: number;
  grow?: boolean;
  minWidth?: number;
  align?: "left" | "right";
}

const colStyle = (c: Pick<Column, "width" | "grow" | "minWidth">): React.CSSProperties =>
  c.grow
    ? { flex: `1 1 ${c.minWidth ?? 160}px`, minWidth: c.minWidth ?? 160, boxSizing: "border-box" }
    : { flex: "0 0 auto", width: c.width, boxSizing: "border-box" };

const TABLE_MIN_WIDTH = 860;

const COLS: Column[] = [
  { id: "model", label: "Model", grow: true, minWidth: 180 },
  { id: "invocations", label: "Invocations", width: 100, align: "right" },
  { id: "inTok", label: "In tok", width: 90, align: "right" },
  { id: "outTok", label: "Out tok", width: 90, align: "right" },
  { id: "cacheRead", label: "Cache read", width: 100, align: "right" },
  { id: "cacheHit", label: "Cache hit %", width: 100, align: "right" },
  { id: "latency", label: "Latency", width: 90, align: "right" },
  { id: "ttft", label: "TTFT", width: 90, align: "right" },
];

const Cell = ({
  children,
  width,
  grow,
  minWidth,
  align,
  mono,
  style,
  title,
}: {
  children: React.ReactNode;
  width?: number;
  grow?: boolean;
  minWidth?: number;
  align?: "left" | "right";
  mono?: boolean;
  style?: React.CSSProperties;
  title?: string;
}) => (
  <div
    title={title}
    style={{
      ...colStyle({ width, grow, minWidth }),
      textAlign: align,
      padding: "8px 6px",
      fontSize: 12.5,
      color: "var(--text)",
      fontFamily: mono ? "var(--mono, monospace)" : undefined,
      fontVariantNumeric: mono ? "tabular-nums" : undefined,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      ...style,
    }}
  >
    {children}
  </div>
);

const cacheHitPct = (r: PerModelSummaryRow): number => {
  const denom = r.cacheRead + r.inTok;
  return denom > 0 ? (r.cacheRead / denom) * 100 : 0;
};

const cacheHitColor = (r: PerModelSummaryRow, pct: number): string | undefined => {
  if (pct >= 50) return STATUS_COLOR.good;
  if (pct < 10 && r.invocations > 0) return STATUS_COLOR.warning;
  return undefined;
};

/**
 * Runtime 2.0 tile 19: per-model summary table (D19). Throughput, token mix,
 * cache-read reuse, and latency/TTFT averages by model, sourced entirely from
 * `cloud.aws.bedrock.*` metrics (no log join) — already sorted invocations
 * desc by the query itself.
 */
export const BedrockPerModelSummary = ({ scope }: BedrockPerModelSummaryProps) => {
  const { rows, isLoading } = usePerModelSummary(scope);

  const initialLoading = isLoading && rows.length === 0;

  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={16}>
        <Flex flexDirection="column" gap={2}>
          <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
            Per-model summary
          </Heading>
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            Throughput, tokens, cache and latency by model — cloud metrics.
          </Text>
        </Flex>

        {initialLoading ? (
          <Skeleton style={{ height: 180, borderRadius: 8 }} />
        ) : rows.length === 0 ? (
          <EmptyState bare title="No per-model metrics in scope" />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <Flex flexDirection="column" gap={0} style={{ minWidth: TABLE_MIN_WIDTH }}>
              <Flex
                alignItems="center"
                style={{ padding: "0 10px", borderBottom: "1px solid var(--border)" }}
              >
                {COLS.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      ...colStyle(c),
                      textAlign: c.align,
                      padding: "8px 6px",
                      fontSize: 10.5,
                      fontWeight: 600,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      color: "var(--text-3)",
                    }}
                  >
                    {c.label}
                  </div>
                ))}
              </Flex>

              {rows.map((r) => {
                const pct = cacheHitPct(r);
                const color = cacheHitColor(r, pct);
                return (
                  <div
                    key={r.rawModel}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "0 10px",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <Cell grow minWidth={180} mono title={r.rawModel}>
                      {r.model}
                    </Cell>
                    <Cell width={100} align="right" mono>
                      {fmtCount(r.invocations)}
                    </Cell>
                    <Cell width={90} align="right" mono>
                      {fmtTokens(r.inTok)}
                    </Cell>
                    <Cell width={90} align="right" mono>
                      {fmtTokens(r.outTok)}
                    </Cell>
                    <Cell width={100} align="right" mono>
                      {fmtTokens(r.cacheRead)}
                    </Cell>
                    <Cell width={100} align="right" mono style={color ? { color } : undefined}>
                      {fmtPercent(pct)}
                    </Cell>
                    <Cell width={90} align="right" mono>
                      {fmtMs(r.latencyMs)}
                    </Cell>
                    <Cell width={90} align="right" mono>
                      {fmtMs(r.ttftMs)}
                    </Cell>
                  </div>
                );
              })}
            </Flex>
          </div>
        )}
      </Flex>
    </Surface>
  );
};
