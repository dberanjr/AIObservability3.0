import React, { useEffect, useRef, useState } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { Sparkline } from "../../components/charts/Sparkline";
import { AreaChart, type AxisTick } from "../../components/charts/AreaChart";
import {
  MiniDonut,
  MiniPartialDonut,
  MiniScale,
} from "../../components/charts/TileGlyphs";
import { ChartModal, ExpandButton } from "../../components/charts/ChartExpander";
import { StatTile } from "../../components/StatTile";
import { SamplingBadge } from "../../components/SamplingBadge";
import { FilterTrigger } from "../../components/FilterTrigger";
import {
  fmtCount,
  fmtMs,
  fmtPercent,
  fmtTokens,
  fmtUSD,
  fmtUSDCompact,
} from "../../data/format";

import { CATEGORICAL } from "../../theme/palette";
import { toneToColor } from "../../theme/statusColor";
import { useScope } from "../../scope/ScopeContext";
import { ScanScopedTile } from "../../scope/ScanScopedTile";
import type { PulseSummary } from "./usePulseSummary";
import { useTileBreakdowns, type BreakdownSlice } from "./useTileBreakdowns";
import { useSpendBreakdown } from "./useSpendBreakdown";
import { useMcpHealth } from "../McpHealth/useMcpHealth";
import { useAnomalies } from "./anomalies/useAnomalies";

type DonutColumnMode = "tokens" | "mcp";

// Shared, perceptually-spaced categorical ramp (theme/palette.ts). Fixed hexes
// so the accent Tweak can't collapse the donut into duplicate hues
// (UX report Chart-3/4).
const SLICE_COLORS = CATEGORICAL;

type McpSortKey =
  | "value" | "p50" | "p95" | "p99"
  | "spanErrors" | "toolErrors" | "errorRate" | "share";

/**
 * Combined health table for MCP Server / MCP Tool popups. Shows volume,
 * latency, and error signals in one view. Every column header is a sort
 * button — click to sort descending, click again to flip to ascending.
 * Row colors stay pinned to the donut's value-sorted palette regardless
 * of the active sort column.
 */
const McpCombinedTable = ({
  slices,
  fmt,
  rowLabel,
}: {
  slices: BreakdownSlice[];
  fmt: (n: number) => string;
  rowLabel: string;
}) => {
  const [sortKey, setSortKey] = useState<McpSortKey>("value");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const total = slices.reduce((a, b) => a + b.value, 0);

  // Colors are assigned by value-rank so they always match the donut.
  const colorByKey = new Map(
    [...slices]
      .sort((a, b) => b.value - a.value)
      .map((s, i) => [s.key, SLICE_COLORS[i % SLICE_COLORS.length]]),
  );

  const handleSort = (key: McpSortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = [...slices].sort((a, b) => {
    const aErr = a.spanErrors + a.toolErrors;
    const bErr = b.spanErrors + b.toolErrors;
    let av: number, bv: number;
    switch (sortKey) {
      case "value":     av = a.value;       bv = b.value;       break;
      case "p50":       av = a.p50DurationMs; bv = b.p50DurationMs; break;
      case "p95":       av = a.p95DurationMs; bv = b.p95DurationMs; break;
      case "p99":       av = a.p99DurationMs; bv = b.p99DurationMs; break;
      case "spanErrors": av = a.spanErrors;  bv = b.spanErrors;  break;
      case "toolErrors": av = a.toolErrors;  bv = b.toolErrors;  break;
      case "errorRate":
        av = a.value > 0 ? aErr / a.value : 0;
        bv = b.value > 0 ? bErr / b.value : 0;
        break;
      case "share":
        av = total > 0 ? a.value / total : 0;
        bv = total > 0 ? b.value / total : 0;
        break;
      default: av = a.value; bv = b.value;
    }
    return sortDir === "desc" ? bv - av : av - bv;
  });

  const SortTh = ({
    col,
    children,
    first = false,
  }: {
    col: McpSortKey;
    children: React.ReactNode;
    first?: boolean;
  }) => {
    const active = sortKey === col;
    return (
      <th
        style={{
          padding: "6px 8px",
          textAlign: first ? "left" : "right",
          whiteSpace: "nowrap",
          fontWeight: active ? 700 : 600,
          color: active ? "var(--text)" : "var(--text-3)",
          userSelect: "none",
        }}
      >
        <button
          type="button"
          onClick={() => handleSort(col)}
          style={{
            all: "unset",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
          }}
        >
          {children}
          <span style={{ fontSize: 10, opacity: active ? 1 : 0.3 }}>
            {active ? (sortDir === "desc" ? "↓" : "↑") : "↕"}
          </span>
        </button>
      </th>
    );
  };

  const tdR: React.CSSProperties = { padding: "7px 8px", textAlign: "right" };

  return (
    <table
      style={{
        width: "100%",
        borderCollapse: "collapse",
        fontSize: 12,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <thead>
        <tr>
          <th style={{ padding: "6px 8px", width: 26 }} />
          <th style={{ padding: "6px 8px", fontWeight: 600, color: "var(--text-3)", textAlign: "left" }}>
            {rowLabel}
          </th>
          <SortTh col="value" first>{sortKey === "value" ? rowLabel === "Servers" ? "Req" : "Calls" : rowLabel === "Servers" ? "Req" : "Calls"}</SortTh>
          <SortTh col="p50">P50</SortTh>
          <SortTh col="p95">P95</SortTh>
          <SortTh col="p99">P99</SortTh>
          <SortTh col="spanErrors">Span Err</SortTh>
          <SortTh col="toolErrors">Tool Err</SortTh>
          <SortTh col="errorRate">Err Rate</SortTh>
          <SortTh col="share">Share</SortTh>
        </tr>
      </thead>
      <tbody>
        {sorted.map((s) => {
          const pct = total > 0 ? (s.value / total) * 100 : 0;
          const totalErrors = s.spanErrors + s.toolErrors;
          const errorRate = s.value > 0 ? (totalErrors / s.value) * 100 : 0;
          const color = colorByKey.get(s.key) ?? "var(--blue)";
          return (
            <tr key={s.key} style={{ borderTop: "1px solid var(--border)" }}>
              <td style={{ padding: "7px 8px" }}>
                <span
                  aria-hidden
                  style={{
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: color,
                  }}
                />
              </td>
              <td
                style={{
                  padding: "7px 8px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: 200,
                }}
                title={s.label}
              >
                {s.filter ? (
                  <FilterTrigger
                    attribute={s.filter.attribute}
                    value={s.filter.values}
                    label={s.filter.label ?? s.label}
                  >
                    {s.label}
                  </FilterTrigger>
                ) : (
                  s.label
                )}
              </td>
              <td style={tdR}>{fmt(s.value)}</td>
              <td style={tdR}>{fmtMs(s.p50DurationMs)}</td>
              <td style={tdR}>{fmtMs(s.p95DurationMs)}</td>
              <td style={tdR}>{fmtMs(s.p99DurationMs)}</td>
              <td style={{ ...tdR, color: s.spanErrors > 0 ? toneToColor("critical") : "var(--text-3)" }}>
                {fmtCount(s.spanErrors)}
              </td>
              <td style={{ ...tdR, color: s.toolErrors > 0 ? toneToColor("warn") : "var(--text-3)" }}>
                {fmtCount(s.toolErrors)}
              </td>
              <td style={{ ...tdR, color: totalErrors > 0 ? toneToColor("critical") : "var(--text-3)" }}>
                {fmtPercent(errorRate, 1)}
              </td>
              <td style={{ ...tdR, color: "var(--text-3)" }}>{fmtPercent(pct, 1)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

/**
 * Friendly label for the active timeframe. Relative expressions like
 * "now()-1h" get a readable "Last 1 hour" caption; ISO timestamps render
 * as "MMM dd HH:MM → MMM dd HH:MM" for explicit ranges (brush-zoom result).
 */
const formatTimeframe = (from: string, to: string | undefined): string => {
  const relMatch = /^now\(\)-(\d+)([smhd])$/i.exec(from);
  const isNow = !to || to === "now()";
  if (relMatch && isNow) {
    const n = Number(relMatch[1]);
    const unit = relMatch[2].toLowerCase();
    const unitLabel =
      unit === "s"
        ? n === 1
          ? "second"
          : "seconds"
        : unit === "m"
          ? n === 1
            ? "minute"
            : "minutes"
          : unit === "h"
            ? n === 1
              ? "hour"
              : "hours"
            : n === 1
              ? "day"
              : "days";
    return `Last ${n} ${unitLabel}`;
  }
  const fmt = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const fromIso = from.replace(/^"|"$/g, "");
  const toIso = (to ?? "now()").replace(/^"|"$/g, "");
  const fromDate = new Date(fromIso);
  const toDate = toIso === "now()" ? new Date() : new Date(toIso);
  if (!Number.isNaN(fromDate.getTime()) && !Number.isNaN(toDate.getTime())) {
    return `${fmt.format(fromDate)} → ${fmt.format(toDate)}`;
  }
  return `${from} → ${to ?? "now()"}`;
};

/** Rich content a tile's maximize button reveals in the shared ChartModal. */
type ExpandedContent = {
  title: string;
  subtitle?: string;
  body: React.ReactNode;
  stats?: { label: string; value: string; sub?: string }[];
};

const TileSkeleton = () => (
  <Surface elevation="raised" padding={12}>
    <Flex flexDirection="column" gap={6}>
      <Skeleton style={{ height: 12, width: "60%" }} />
      <Skeleton style={{ height: 22, width: "80%" }} />
      <Skeleton style={{ height: 8, width: "100%" }} />
    </Flex>
  </Surface>
);

export interface SummaryTilesRowProps {
  summary: PulseSummary;
  /** Initial column count before the ResizeObserver measures (avoids a flash
   * when rendered in the narrow hero side-column, where 2 columns is right). */
  initialColumns?: number;
}

/**
 * 9-tile Pulse summary row. The first four (volume metrics) keep their
 * sparklines; Models / MCP Servers / MCP Tools get donut breakdowns from
 * useTileBreakdowns; Token efficiency uses a partial donut tied to the
 * accent color; Cost/request uses a horizontal intensity scale so every
 * tile has its own visualization.
 */
// Explicit column counts at decreasing container widths. With 124px tile
// minimum and the shared --d-gap grid gap (14px), the math is
// `cols * 124 + (cols - 1) * 14`. Steps are picked so the row wraps in
// deliberate chunks (9 → 6 → 3 → 2) rather than dropping one tile at a time.
//   1228px  → 9 cols  (one row)
//    814px  → 6 cols  (6 + 3)
//    400px  → 3 cols  (3 + 3 + 3)
//    262px  → 2 cols
//   below   → 1 col
const COLUMN_BREAKPOINTS: Array<{ minPx: number; cols: number }> = [
  { minPx: 1228, cols: 9 },
  { minPx: 814, cols: 6 },
  { minPx: 400, cols: 3 },
  { minPx: 262, cols: 2 },
];

const pickColumns = (width: number): number => {
  for (const bp of COLUMN_BREAKPOINTS) {
    if (width >= bp.minPx) return bp.cols;
  }
  return 1;
};

export const SummaryTilesRow = ({ summary, initialColumns = 9 }: SummaryTilesRowProps) => {
  const breakdowns = useTileBreakdowns();
  const spend = useSpendBreakdown();
  // MCP tiles (Tool calls + MCP error rate) fold into this row; shown only when
  // MCP / tool spans are present (replaces the old standalone MCP strip).
  const mcp = useMcpHealth();
  const showMcp = !mcp.isLoading && !mcp.isEmpty;
  const mcpErr = mcp.kpis.errorRatePct;
  const toolErrorSlices = breakdowns.mcpTools
    .map((s) => ({ ...s, value: s.spanErrors + s.toolErrors }))
    .filter((s) => s.value > 0);
  const totalToolErrors = toolErrorSlices.reduce((a, b) => a + b.value, 0);
  const hasToolErrors = totalToolErrors > 0;

  // Avg tokens / request — average context size per call.
  const avgTokensPerReq =
    summary.requests && summary.requests > 0 && summary.tokens != null
      ? summary.tokens / summary.requests
      : null;

  // Active findings broken down by severity (for the donut).
  const { anomalies } = useAnomalies();
  const sev = { critical: 0, warning: 0, info: 0 };
  for (const a of anomalies) sev[a.severity] += 1;
  const findingsTotal = sev.critical + sev.warning + sev.info;
  // Severity → color via the shared tone map (CONS-4). info has no tone in the
  // vocabulary, so it keeps the decorative --blue.
  const findingSlices = (
    [
      ["critical", toneToColor("critical"), sev.critical],
      ["warning", toneToColor("warn"), sev.warning],
      ["info", "var(--blue)", sev.info],
    ] as const
  ).filter(([, , n]) => n > 0);
  // Prefer the per-model split (actual + estimated) over the all-blended
  // headline once model rows have loaded; fall back to the quick estimate.
  const useSplit = !spend.isLoading && spend.total > 0;
  const totalSpend = useSplit ? spend.total : summary.spend;
  const costPerReq =
    useSplit && summary.requests && summary.requests > 0
      ? spend.total / summary.requests
      : summary.costPerRequest;
  const spendSub = spend.isLoading
    ? "estimating…"
    : spend.hasEstimated
      ? `${fmtUSDCompact(spend.actual)} actual · ${fmtUSDCompact(spend.estimated)} est.`
      : "actual rates";
  const costPerReqSub = spend.isLoading
    ? "estimating…"
    : spend.hasEstimated
      ? `${spend.estimatedModels.length} model${spend.estimatedModels.length === 1 ? "" : "s"} estimated`
      : "all models priced";
  const { scope } = useScope();
  const timeframeLabel = formatTimeframe(scope.timeframe.from, scope.timeframe.to);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // Default until the observer fires — avoids a jarring reflow on first mount.
  const [columns, setColumns] = useState(initialColumns);
  // Which tile (if any) has its maximized ChartModal open. A single modal is
  // driven by an id so we don't need one useChartExpander per tile.
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!wrapRef.current || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      setColumns(pickColumns(entry.contentRect.width));
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const gridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    gap: "var(--d-gap)",
  };

  if (summary.isLoading && summary.tokens == null) {
    return (
      <div ref={wrapRef} style={gridStyle}>
        {Array.from({ length: 9 }).map((_, i) => (
          <TileSkeleton key={i} />
        ))}
      </div>
    );
  }

  // Each tile has its own series now — previously they all read from
  // summary.spark.tokens which was the same data per tile.
  const renderSpark = (
    values: number[],
    color: string,
    fmt: (n: number) => string,
    ariaLabel?: string,
  ) =>
    values.length > 1 ? (
      <Sparkline
        values={values}
        color={color}
        height={24}
        valueFormatter={fmt}
        labels={summary.spark.labels}
        ariaLabel={ariaLabel}
      />
    ) : null;

  // Reusable "expanded sparkline" — renders the same series as an
  // AreaChart at 420px so it inherits y-axis ticks, x-axis date labels,
  // brush-zoom, and the Tweaks value-label overlay (none/peak/min-max/
  // interesting/all). Stats grid surfaces total/avg/min/max + the
  // bucket interval resolution.
  const sparklineExpanded = (
    title: string,
    info: string,
    values: number[],
    fmt: (n: number) => string,
  ) => {
    const nonZero = values.filter((v) => Number.isFinite(v) && v !== 0);
    const min = nonZero.length ? Math.min(...nonZero) : 0;
    const max = nonZero.length ? Math.max(...nonZero) : 0;
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = values.length ? sum / values.length : 0;
    const len = values.length;

    // 6 evenly-spaced x-axis ticks across the bucket span. Reuse the
    // hook-built labels so axis ticks read date+time.
    const tickCount = 6;
    const axisTicks: AxisTick[] =
      len > 1
        ? Array.from({ length: tickCount }, (_, k) => {
            const idx = Math.round((k / (tickCount - 1)) * (len - 1));
            return { index: idx, label: summary.spark.labels[idx] ?? "" };
          })
        : [];

    return {
      title,
      subtitle: `${info} · per ${summary.spark.intervalLabel}`,
      body: (
        <AreaChart
          height={420}
          formatLeft={fmt}
          xLabels={summary.spark.labels}
          axisTicks={axisTicks}
          series={[
            {
              label: title,
              color: "var(--blue)",
              values,
              axis: "left",
            },
          ]}
        />
      ),
      stats: [
        { label: "Total / sum", value: fmt(sum) },
        { label: "Average", value: fmt(avg) },
        { label: "Min (non-zero)", value: fmt(min) },
        { label: "Max", value: fmt(max) },
        { label: "Resolution", value: summary.spark.intervalLabel },
      ],
    };
  };

  // Reusable "expanded donut" — bigger donut + a full segment table with
  // primary metric, total tokens, derived cost, and share. Slice cost is
  // computed in useTileBreakdowns via the same blended-pricing helper as
  // the Spend tile (per-model pricing where known).
  const donutExpanded = (
    title: string,
    info: string,
    centerCount: number | null,
    centerLabel: string,
    slices: BreakdownSlice[],
    fmt: (n: number) => string,
    columnMode: DonutColumnMode = "tokens",
  ) => {
    const total = slices.reduce((a, b) => a + b.value, 0);
    const totalTokens = slices.reduce((a, b) => a + b.tokens, 0);
    const totalCost = slices.reduce((a, b) => a + b.cost, 0);
    const sorted = [...slices].sort((a, b) => b.value - a.value);
    // MCP-specific aggregates for the stats footer
    const avgDurationMs =
      slices.length > 0
        ? slices.reduce((a, b) => a + b.avgDurationMs, 0) / slices.length
        : 0;
    const maxP99Ms = slices.length > 0 ? Math.max(...slices.map((s) => s.p99DurationMs)) : 0;
    const totalSpanErrors = slices.reduce((a, b) => a + b.spanErrors, 0);
    const totalToolErrors = slices.reduce((a, b) => a + b.toolErrors, 0);
    // Pluralize the center label when the count is anything other than 1
    // (Model/Models, Server/Servers, Tool/Tools). The column header in
    // the table follows the same form so it stays in sync with the
    // donut's caption.
    const pluralCenterLabel =
      centerCount === 1 ? centerLabel : `${centerLabel}s`;
    return {
      title,
      subtitle: `${info} · ${timeframeLabel}`,
      body: (
        <Flex gap={32} alignItems={columnMode === "mcp" ? "flex-start" : "center"} style={{ minHeight: 360 }}>
          <MiniDonut
            size={320}
            thickness={42}
            values={sorted.map((s) => s.value)}
            labels={sorted.map((s) => s.label)}
            valueFormatter={fmt}
            centerValue={
              centerCount != null ? String(Math.round(centerCount)) : "—"
            }
            centerLabel={pluralCenterLabel}
          />
          <div
            style={{
              flexGrow: 1,
              minWidth: 0,
              maxHeight: 400,
              overflowY: "auto",
            }}
          >
            {columnMode === "mcp" ? (
              <McpCombinedTable slices={slices} fmt={fmt} rowLabel={pluralCenterLabel} />
            ) : (
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 12.5,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                <thead>
                  <tr style={{ color: "var(--text-3)", textAlign: "left" }}>
                    <th style={{ padding: "6px 8px", fontWeight: 600 }}></th>
                    <th style={{ padding: "6px 8px", fontWeight: 600 }}>
                      {pluralCenterLabel}
                    </th>
                    <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "right" }}>Value</th>
                    <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "right" }}>Tokens</th>
                    <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "right" }}>Cost</th>
                    <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "right" }}>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((s, idx) => {
                    const pct = total > 0 ? (s.value / total) * 100 : 0;
                    const color = SLICE_COLORS[idx % SLICE_COLORS.length];
                    return (
                      <tr key={s.key} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "8px" }}>
                          <span aria-hidden style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: color }} />
                        </td>
                        <td style={{ padding: "8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 320 }} title={s.label}>
                          {s.filter ? (
                            <FilterTrigger attribute={s.filter.attribute} value={s.filter.values} label={s.filter.label ?? s.label}>
                              {s.label}
                            </FilterTrigger>
                          ) : s.label}
                        </td>
                        <td style={{ padding: "8px", textAlign: "right" }}>{fmt(s.value)}</td>
                        <td style={{ padding: "8px", textAlign: "right" }}>{fmtTokens(s.tokens)}</td>
                        <td style={{ padding: "8px", textAlign: "right" }}>{fmtUSD(s.cost)}</td>
                        <td style={{ padding: "8px", textAlign: "right", color: "var(--text-3)" }}>{fmtPercent(pct, 1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </Flex>
      ),
      stats:
        columnMode === "mcp"
          ? [
              { label: "Distinct", value: centerCount != null ? String(Math.round(centerCount)) : "—" },
              { label: "Total events", value: fmt(total) },
              { label: "Avg latency", value: fmtMs(avgDurationMs) },
              { label: "P99 latency", value: fmtMs(maxP99Ms) },
              { label: "Span errors", value: fmtCount(totalSpanErrors) },
              { label: "Tool errors", value: fmtCount(totalToolErrors) },
              { label: "Timeframe", value: timeframeLabel },
            ]
          : [
              { label: "Distinct", value: centerCount != null ? String(Math.round(centerCount)) : "—" },
              { label: "Total events", value: fmt(total) },
              { label: "Total tokens", value: fmtTokens(totalTokens) },
              { label: "Total cost", value: fmtUSDCompact(totalCost) },
              { label: "Top", value: sorted[0]?.label ?? "—", sub: sorted[0] ? fmt(sorted[0].value) : undefined },
              { label: "Timeframe", value: timeframeLabel },
            ],
    };
  };

  // Cost-per-request scale: a $0–$0.05 range is generous for blended LLM
  // pricing across common SOTA models. Values above clamp to the right.
  const costScaleMax = 0.05;
  // Token-efficiency partial-donut uses the active accent so the tile
  // visually anchors to the same color as the token consumption chart.
  const efficiencyColor = "var(--blue)";

  // Maximize builders keyed by tile id. Each tile routes StatTile's
  // `headerRight` expand button through setExpandedId; the single ChartModal
  // below renders whichever builder is active. Builders are only invoked when
  // their tile is open, so the closures stay cheap.
  const expandBuilders: Record<string, () => ExpandedContent> = {
    tokens: () =>
      sparklineExpanded(
        "Tokens",
        "Per-interval sum of input + output tokens across the active timeframe.",
        summary.spark.tokens,
        fmtTokens,
      ),
    spend: () =>
      sparklineExpanded(
        "Spend",
        "Per-interval blended cost derived from token usage and default pricing.",
        summary.spark.spend,
        fmtUSDCompact,
      ),
    p95: () =>
      sparklineExpanded(
        "P95 latency",
        "Per-interval 95th percentile of span duration.",
        summary.spark.p95Ms,
        fmtMs,
      ),
    error: () =>
      sparklineExpanded(
        "Error rate",
        "Per-interval fraction of spans with an exception.type set.",
        summary.spark.errorRatePct,
        (n) => fmtPercent(n, 1),
      ),
    models: () =>
      donutExpanded(
        "Models",
        "Distinct models invoked, sized by request volume. Version suffixes collapsed.",
        summary.models,
        "Model",
        breakdowns.models,
        (n) => `${fmtCount(n)} req`,
      ),
    mcpServers: () =>
      donutExpanded(
        "MCP servers",
        "Distinct MCP workflows (traceloop.workflow.name ending in .mcp).",
        summary.mcpServers,
        "Server",
        breakdowns.mcpServers,
        (n) => `${fmtCount(n)} req`,
        "mcp",
      ),
    tools: () =>
      donutExpanded(
        "Tools",
        "Distinct tools invoked within MCP workflows, sized by call count.",
        summary.mcpTools,
        "Tool",
        breakdowns.mcpTools,
        (n) => `${fmtCount(n)} call${n === 1 ? "" : "s"}`,
        "mcp",
      ),
  };
  if (showMcp && hasToolErrors) {
    expandBuilders.mcpErrors = () =>
      donutExpanded(
        "MCP errors",
        "Tool-call errors (span + functional) broken down by tool.",
        totalToolErrors,
        "error",
        toolErrorSlices,
        (n) => `${fmtCount(n)} err`,
        "mcp",
      );
  }

  const expandBtn = (id: string, label: string) => (
    <ExpandButton ariaLabel={label} onClick={() => setExpandedId(id)} />
  );

  const activeBuilder = expandedId ? expandBuilders[expandedId] : undefined;
  const expandedContent = activeBuilder ? activeBuilder() : null;

  return (
    <>
    <div ref={wrapRef} style={gridStyle}>
      <ScanScopedTile name="Tokens">
      <StatTile
        label="Tokens"
        info="Total tokens (input + output) consumed by GenAI calls in the current scope. Counts/sums are extrapolated to the unsampled population when sampling is on."
        value={fmtTokens(summary.tokens)}
        sub={
          summary.requests != null
            ? `${fmtCount(summary.requests)} req`
            : undefined
        }
        headerRight={expandBtn("tokens", "Expand Tokens")}
        media={
          <Flex flexDirection="column" gap={6} style={{ width: "100%" }}>
            <SamplingBadge variant="compact" />
            {renderSpark(summary.spark.tokens, "var(--blue)", fmtCount, "Tokens trend")}
          </Flex>
        }
      />
      </ScanScopedTile>
      <ScanScopedTile name="Spend">
      <StatTile
        label="Spend"
        info="USD spend = actual (models priced in the table) + estimated (models not in the table, costed at a blended fallback rate). The sub-line splits the two. Counts are extrapolated to the unsampled population when sampling is on."
        value={fmtUSDCompact(totalSpend)}
        sub={spendSub}
        headerRight={expandBtn("spend", "Expand Spend")}
        media={
          <Flex flexDirection="column" gap={6} style={{ width: "100%" }}>
            <SamplingBadge variant="compact" />
            {renderSpark(summary.spark.spend, "var(--blue)", fmtUSD, "Spend trend")}
          </Flex>
        }
      />
      </ScanScopedTile>
      <ScanScopedTile name="P95 latency">
      <StatTile
        label="P95 latency"
        info="95th percentile request duration across all GenAI spans in scope. Percentile statistics are sampling-invariant — toggling sampling won't change this number."
        value={fmtMs(summary.p95Ms)}
        headerRight={expandBtn("p95", "Expand P95 latency")}
        media={renderSpark(summary.spark.p95Ms, "var(--blue)", fmtMs, "P95 latency trend")}
      />
      </ScanScopedTile>
      <ScanScopedTile name="Error rate">
      <StatTile
        label="Error rate"
        info="Percentage of GenAI spans with a non-null exception.type field. A ratio (not a count) — sampling-invariant."
        value={fmtPercent(summary.errorRatePct)}
        headerRight={expandBtn("error", "Expand Error rate")}
        media={renderSpark(
          summary.spark.errorRatePct,
          "var(--blue)",
          (n) => fmtPercent(n, 1),
          "Error rate trend",
        )}
      />
      </ScanScopedTile>

      {showMcp && (
        <ScanScopedTile name="MCP error rate">
        <StatTile
          label="MCP error rate"
          info="Share of MCP tool calls that errored (span errors + functional tool errors). The donut breaks errors down by tool; the center shows the overall error rate. Expand for the full per-tool table."
          headerRight={
            hasToolErrors ? expandBtn("mcpErrors", "Expand MCP errors") : undefined
          }
          media={
            <Flex flexDirection="column" alignItems="center" gap={4}>
              <MiniDonut
                size={96}
                thickness={14}
                values={hasToolErrors ? toolErrorSlices.map((s) => s.value) : [1]}
                labels={hasToolErrors ? toolErrorSlices.map((s) => s.label) : ["No errors"]}
                colors={hasToolErrors ? undefined : ["var(--green-2)"]}
                valueFormatter={(n) => `${fmtCount(n)} err`}
                centerValue={(() => {
                  // Render the trailing "%" smaller than the number so the
                  // glyph doesn't crowd the donut ring (leaves breathing room).
                  const s = fmtPercent(mcpErr, 1);
                  return s.endsWith("%") ? (
                    <>
                      {s.slice(0, -1)}
                      <span style={{ fontSize: "0.6em" }}>%</span>
                    </>
                  ) : (
                    s
                  );
                })()}
              />
              <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
                errored calls
              </Text>
            </Flex>
          }
        />
        </ScanScopedTile>
      )}

      <ScanScopedTile name="Models">
      <StatTile
        label="Models"
        info="Number of distinct gen_ai.request.model values observed in scope. The donut breaks down by request volume; model version suffixes are collapsed so e.g. claude-sonnet-4-5-20250114 and claude-sonnet-4-5 count as one model."
        headerRight={expandBtn("models", "Expand Models")}
        media={
          <MiniDonut
            size={96}
            thickness={14}
            values={breakdowns.models.map((m) => m.value)}
            labels={breakdowns.models.map((m) => m.label)}
            valueFormatter={(n) => `${fmtCount(n)} req`}
            centerValue={
              summary.models != null ? String(Math.round(summary.models)) : "—"
            }
          />
        }
      />
      </ScanScopedTile>
      <ScanScopedTile name="MCP servers">
      <StatTile
        label="MCP servers"
        info="Distinct MCP servers detected via traceloop.workflow.name matching `*.mcp` (the convention this tenant's SDKs use). Donut breaks down by workflow request volume."
        headerRight={expandBtn("mcpServers", "Expand MCP servers")}
        media={
          <MiniDonut
            size={96}
            thickness={14}
            values={breakdowns.mcpServers.map((s) => s.value)}
            labels={breakdowns.mcpServers.map((s) => s.label)}
            valueFormatter={(n) => `${fmtCount(n)} req`}
            centerValue={
              summary.mcpServers != null
                ? String(Math.round(summary.mcpServers))
                : "—"
            }
          />
        }
      />
      </ScanScopedTile>
      <ScanScopedTile name="Tools">
      <StatTile
        label="Tools"
        info="Distinct tools invoked within MCP workflows. Tool name comes from gen_ai.tool.name with a fallback to traceloop.entity.name. Donut sized by call count; center shows the distinct tool count."
        headerRight={expandBtn("tools", "Expand Tools")}
        media={
          <MiniDonut
            size={96}
            thickness={14}
            values={breakdowns.mcpTools.map((t) => t.value)}
            labels={breakdowns.mcpTools.map((t) => t.label)}
            valueFormatter={(n) => `${fmtCount(n)} call${n === 1 ? "" : "s"}`}
            centerValue={
              summary.mcpTools != null
                ? String(Math.round(summary.mcpTools))
                : "—"
            }
          />
        }
      />
      </ScanScopedTile>

      <ScanScopedTile name="Cost / request">
      <StatTile
        label="Cost / request"
        info="Total spend (actual + estimated) divided by the number of requests. The scale below shows where this value falls on a $0–$0.05 range (darker = higher cost per request). Ratio is sampling-invariant."
        value={fmtUSD(costPerReq)}
        sub={costPerReqSub}
        media={
          costPerReq != null ? (
            <MiniScale
              value={costPerReq}
              min={0}
              max={costScaleMax}
              ticks={[costScaleMax / 2]}
              valueLabel={`${fmtUSD(costPerReq)} / request`}
            />
          ) : undefined
        }
      />
      </ScanScopedTile>

      <ScanScopedTile name="Token efficiency">
      <StatTile
        label="Token efficiency"
        info="Output tokens as a share of total tokens (input + output). Higher means more of your token spend is going toward generated content vs prompt overhead. Filled arc follows the active accent color."
        media={
          <Flex flexDirection="column" alignItems="center" gap={4}>
            <MiniPartialDonut
              size={96}
              thickness={14}
              percent={summary.tokenEfficiencyPct ?? 0}
              color={efficiencyColor}
              centerValue={fmtPercent(summary.tokenEfficiencyPct, 0)}
            />
            <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
              output / total
            </Text>
          </Flex>
        }
      />
      </ScanScopedTile>

      <ScanScopedTile name="Avg tokens / request">
      <StatTile
        label="Avg tokens / request"
        info="Total tokens ÷ requests — the average context size per call. A right-sizing signal alongside Cost/request. Ratio is sampling-invariant."
        value={avgTokensPerReq != null ? fmtCount(avgTokensPerReq) : "—"}
        sub="tokens ÷ requests"
      />
      </ScanScopedTile>

      <ScanScopedTile name="Active findings">
      <StatTile
        label="Active findings"
        info="Open problem patterns detected in the current scope, broken down by severity (critical / warning / info). Select a finding in the list below the map for detail and the contributing prompts."
        media={
          <Flex flexDirection="column" alignItems="center" gap={4}>
            <MiniDonut
              size={96}
              thickness={14}
              values={findingsTotal > 0 ? findingSlices.map((s) => s[2]) : [1]}
              labels={findingsTotal > 0 ? findingSlices.map((s) => s[0]) : ["None"]}
              colors={findingsTotal > 0 ? findingSlices.map((s) => s[1]) : ["var(--green-2)"]}
              valueFormatter={(n) => `${fmtCount(n)}`}
              centerValue={String(findingsTotal)}
            />
            <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
              {findingsTotal > 0
                ? `${sev.critical} crit · ${sev.warning} warn · ${sev.info} info`
                : "none open"}
            </Text>
          </Flex>
        }
      />
      </ScanScopedTile>
    </div>
    {expandedContent && (
      <ChartModal
        open={expandedId != null}
        onClose={() => setExpandedId(null)}
        title={expandedContent.title}
        subtitle={expandedContent.subtitle}
        stats={expandedContent.stats}
      >
        {expandedContent.body}
      </ChartModal>
    )}
    </>
  );
};
