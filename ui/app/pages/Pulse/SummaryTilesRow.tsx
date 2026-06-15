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
import {
  ChartModal,
  useChartExpander,
} from "../../components/charts/ChartExpander";
import { InfoTooltip } from "../../components/InfoTooltip";
import { FilterTrigger } from "../../components/FilterTrigger";
import { useTweaks } from "../../tweaks/TweaksContext";
import {
  fmtCount,
  fmtMs,
  fmtPercent,
  fmtTokens,
  fmtUSD,
  fmtUSDCompact,
} from "../../data/format";

import { useScope } from "../../scope/ScopeContext";
import type { PulseSummary } from "./usePulseSummary";
import { useTileBreakdowns, type BreakdownSlice } from "./useTileBreakdowns";
import { useSpendBreakdown } from "./useSpendBreakdown";
import { useMcpHealth } from "../McpHealth/useMcpHealth";
import { useAnomalies } from "./anomalies/useAnomalies";

type DonutColumnMode = "tokens" | "mcp";

const SLICE_COLORS = [
  "var(--blue)",
  "var(--purple-2)",
  "var(--cyan)",
  "var(--green-2)",
  "var(--pink)",
  "var(--amber)",
  "var(--blue-purple)",
  "var(--purple-dark)",
  "var(--red)",
  "var(--green-lime)",
];

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
              <td style={{ ...tdR, color: s.spanErrors > 0 ? "var(--red)" : "var(--text-3)" }}>
                {fmtCount(s.spanErrors)}
              </td>
              <td style={{ ...tdR, color: s.toolErrors > 0 ? "var(--amber)" : "var(--text-3)" }}>
                {fmtCount(s.toolErrors)}
              </td>
              <td style={{ ...tdR, color: totalErrors > 0 ? "var(--red)" : "var(--text-3)" }}>
                {errorRate.toFixed(1)}%
              </td>
              <td style={{ ...tdR, color: "var(--text-3)" }}>{pct.toFixed(1)}%</td>
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

type TileVariant = "value" | "visual";

interface TileShellProps {
  label: string;
  /** Variant "value" shows a big number + optional bottom chart; variant
   * "visual" centers a single visualization (e.g., a big donut) and skips
   * the redundant left-side number. */
  variant?: TileVariant;
  value?: string;
  sub?: string;
  /** Bottom-pinned chart, used by "value" variant. */
  bottom?: React.ReactNode;
  /** Centered visualization, used by "visual" variant. */
  visual?: React.ReactNode;
  /** Visual variant — extra caption rendered under the centered visual. */
  visualCaption?: string;
  /** Short explanation shown when the user hovers the info glyph. */
  info?: string;
  /** When set, renders a maximize button that opens a ChartModal containing
   * `expanded()`. The function is invoked with the modal's available
   * inner width so the expanded view can size itself. */
  expanded?: () => {
    title: string;
    subtitle?: string;
    body: React.ReactNode;
    stats?: { label: string; value: string; sub?: string }[];
  };
}

/**
 * Small "expand" icon button — used at the top-right of any tile that
 * exposes a maximized view via the `expanded` prop.
 */
const TileExpandButton = ({ onClick }: { onClick: () => void }) => (
  <button
    type="button"
    aria-label="Expand"
    title="Expand"
    onClick={onClick}
    style={{
      all: "unset",
      cursor: "pointer",
      padding: 2,
      borderRadius: 4,
      color: "var(--text-3)",
      lineHeight: 0,
    }}
  >
    <svg width={12} height={12} viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M2 5V2h3M9 2h3v3M12 9v3H9M5 12H2V9"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </button>
);


const Tile = ({
  label,
  variant = "value",
  value,
  sub,
  bottom,
  visual,
  visualCaption,
  info,
  expanded,
}: TileShellProps) => {
  const { density, tileStyle } = useTweaks();
  const pad = density === "minimal" ? 4 : density === "compact" ? 8 : 12;
  const tileOverride: React.CSSProperties =
    density === "minimal"
      ? { boxShadow: "none", border: "none", background: "transparent" }
      : tileStyle === "bordered"
        ? { boxShadow: "none", border: "1px solid var(--border)" }
        : tileStyle === "ghost"
          ? { boxShadow: "none", border: "none", background: "transparent" }
          : {};

  const expander = useChartExpander();
  const expandedContent = expanded && expander.open ? expanded() : null;

  return (
    <Surface
      elevation="raised"
      padding={pad}
      style={{
        minWidth: 0,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        ...tileOverride,
      }}
    >
      <Flex
        flexDirection="column"
        gap={6}
        style={{ minWidth: 0, flexGrow: 1, height: "100%" }}
      >
        <Flex
          alignItems="flex-start"
          justifyContent="space-between"
          gap={6}
          style={{ minHeight: 28 }}
        >
          <Text
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "var(--text-3)",
              whiteSpace: "normal",
              lineHeight: 1.2,
            }}
          >
            {label}
          </Text>
          <Flex alignItems="center" gap={4}>
            {expanded && (
              <TileExpandButton onClick={() => expander.setOpen(true)} />
            )}
            {info && <InfoTooltip text={info} />}
          </Flex>
        </Flex>

        {variant === "visual" ? (
          <Flex
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            gap={4}
            style={{ flexGrow: 1, minHeight: 0, width: "100%" }}
          >
            {visual}
            {visualCaption && (
              <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
                {visualCaption}
              </Text>
            )}
          </Flex>
        ) : (
          <>
            {value !== undefined && (
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                  lineHeight: 1,
                  color: "var(--text)",
                }}
              >
                {value}
              </Text>
            )}
            {sub && (
              <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
                {sub}
              </Text>
            )}
            {bottom && <div style={{ marginTop: "auto" }}>{bottom}</div>}
          </>
        )}
      </Flex>
      {expandedContent && (
        <ChartModal
          open={expander.open}
          onClose={() => expander.setOpen(false)}
          title={expandedContent.title}
          subtitle={expandedContent.subtitle}
          stats={expandedContent.stats}
        >
          {expandedContent.body}
        </ChartModal>
      )}
    </Surface>
  );
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
// minimum and 10px gap, the math is `cols * 124 + (cols - 1) * 10`.
// Steps are picked so the row wraps in deliberate chunks (9 → 6 → 3 → 2)
// rather than dropping one tile at a time.
//   1196px  → 9 cols  (one row)
//    794px  → 6 cols  (6 + 3)
//    392px  → 3 cols  (3 + 3 + 3)
//    258px  → 2 cols
//   below   → 1 col
const COLUMN_BREAKPOINTS: Array<{ minPx: number; cols: number }> = [
  { minPx: 1196, cols: 9 },
  { minPx: 794, cols: 6 },
  { minPx: 392, cols: 3 },
  { minPx: 258, cols: 2 },
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
  const findingSlices = (
    [
      ["critical", "var(--red)", sev.critical],
      ["warning", "var(--amber)", sev.warning],
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
    gap: 10,
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
  ) =>
    values.length > 1 ? (
      <Sparkline
        values={values}
        color={color}
        height={24}
        valueFormatter={fmt}
        labels={summary.spark.labels}
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
      subtitle: `${info} · ${summary.spark.intervalLabel} buckets`,
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
                        <td style={{ padding: "8px", textAlign: "right", color: "var(--text-3)" }}>{pct.toFixed(1)}%</td>
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

  return (
    <div ref={wrapRef} style={gridStyle}>
      <Tile
        label="Tokens"
        info="Total tokens (input + output) consumed by GenAI calls in the current scope. Counts/sums are extrapolated to the unsampled population when sampling is on."
        value={fmtTokens(summary.tokens)}
        sub={
          summary.requests != null
            ? `${fmtCount(summary.requests)} req`
            : undefined
        }
        bottom={renderSpark(summary.spark.tokens, "var(--blue)", fmtTokens)}
        expanded={() =>
          sparklineExpanded(
            "Tokens",
            "Per-bucket sum of input + output tokens across the active timeframe.",
            summary.spark.tokens,
            fmtTokens,
          )
        }
      />
      <Tile
        label="Spend"
        info="USD spend = actual (models priced in the table) + estimated (models not in the table, costed at a blended fallback rate). The sub-line splits the two. Counts are extrapolated to the unsampled population when sampling is on."
        value={fmtUSDCompact(totalSpend)}
        sub={spendSub}
        bottom={renderSpark(summary.spark.spend, "var(--blue)", fmtUSDCompact)}
        expanded={() =>
          sparklineExpanded(
            "Spend",
            "Per-bucket blended cost derived from token usage and default pricing.",
            summary.spark.spend,
            fmtUSDCompact,
          )
        }
      />
      <Tile
        label="P95 latency"
        info="95th percentile request duration across all GenAI spans in scope. Percentile statistics are sampling-invariant — toggling sampling won't change this number."
        value={fmtMs(summary.p95Ms)}
        bottom={renderSpark(summary.spark.p95Ms, "var(--blue)", fmtMs)}
        expanded={() =>
          sparklineExpanded(
            "P95 latency",
            "Per-bucket 95th percentile of span duration.",
            summary.spark.p95Ms,
            fmtMs,
          )
        }
      />
      <Tile
        label="Error rate"
        info="Percentage of GenAI spans with a non-null exception.type field. A ratio (not a count) — sampling-invariant."
        value={fmtPercent(summary.errorRatePct)}
        bottom={renderSpark(
          summary.spark.errorRatePct,
          "var(--blue)",
          (n) => fmtPercent(n, 1),
        )}
        expanded={() =>
          sparklineExpanded(
            "Error rate",
            "Per-bucket fraction of spans with an exception.type set.",
            summary.spark.errorRatePct,
            (n) => fmtPercent(n, 1),
          )
        }
      />

      {showMcp && (
        <Tile
          label="MCP error rate"
          info="Share of MCP tool calls that errored (span errors + functional tool errors). The donut breaks errors down by tool; the center shows the overall error rate. Expand for the full per-tool table."
          variant="visual"
          visual={
            <MiniDonut
              size={96}
              thickness={14}
              values={hasToolErrors ? toolErrorSlices.map((s) => s.value) : [1]}
              labels={hasToolErrors ? toolErrorSlices.map((s) => s.label) : ["No errors"]}
              colors={hasToolErrors ? undefined : ["var(--green-2)"]}
              valueFormatter={(n) => `${fmtCount(n)} err`}
              centerValue={fmtPercent(mcpErr, 1)}
            />
          }
          visualCaption="errored calls"
          expanded={
            hasToolErrors
              ? () =>
                  donutExpanded(
                    "MCP errors",
                    "Tool-call errors (span + functional) broken down by tool.",
                    totalToolErrors,
                    "error",
                    toolErrorSlices,
                    (n) => `${fmtCount(n)} err`,
                    "mcp",
                  )
              : undefined
          }
        />
      )}

      <Tile
        label="Models"
        info="Number of distinct gen_ai.request.model values observed in scope. The donut breaks down by request volume; model version suffixes are collapsed so e.g. claude-sonnet-4-5-20250114 and claude-sonnet-4-5 count as one model."
        variant="visual"
        visual={
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
        expanded={() =>
          donutExpanded(
            "Models",
            "Distinct models invoked, sized by request volume. Version suffixes collapsed.",
            summary.models,
            "Model",
            breakdowns.models,
            (n) => `${fmtCount(n)} req`,
          )
        }
      />
      <Tile
        label="MCP servers"
        info="Distinct MCP servers detected via traceloop.workflow.name matching `*.mcp` (the convention this tenant's SDKs use). Donut breaks down by workflow request volume."
        variant="visual"
        visual={
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
        expanded={() =>
          donutExpanded(
            "MCP servers",
            "Distinct MCP workflows (traceloop.workflow.name ending in .mcp).",
            summary.mcpServers,
            "Server",
            breakdowns.mcpServers,
            (n) => `${fmtCount(n)} req`,
            "mcp",
          )
        }
      />
      <Tile
        label="Tools"
        info="Distinct tools invoked within MCP workflows. Tool name comes from gen_ai.tool.name with a fallback to traceloop.entity.name. Donut sized by call count; center shows the distinct tool count."
        variant="visual"
        visual={
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
        expanded={() =>
          donutExpanded(
            "Tools",
            "Distinct tools invoked within MCP workflows, sized by call count.",
            summary.mcpTools,
            "Tool",
            breakdowns.mcpTools,
            (n) => `${fmtCount(n)} call${n === 1 ? "" : "s"}`,
            "mcp",
          )
        }
      />

      <Tile
        label="Cost / request"
        info="Total spend (actual + estimated) divided by the number of requests. The scale below shows where this value falls on a $0–$0.05 range (green = cheap, red = expensive). Ratio is sampling-invariant."
        value={fmtUSD(costPerReq)}
        sub={costPerReqSub}
        bottom={
          costPerReq != null ? (
            <MiniScale
              value={costPerReq}
              min={0}
              max={costScaleMax}
              ticks={[costScaleMax / 2]}
            />
          ) : null
        }
      />

      <Tile
        label="Token efficiency"
        info="Output tokens as a share of total tokens (input + output). Higher means more of your token spend is going toward generated content vs prompt overhead. Filled arc follows the active accent color."
        variant="visual"
        visual={
          <MiniPartialDonut
            size={96}
            thickness={14}
            percent={summary.tokenEfficiencyPct ?? 0}
            color={efficiencyColor}
            centerValue={fmtPercent(summary.tokenEfficiencyPct, 0)}
          />
        }
        visualCaption="output / total"
      />

      <Tile
        label="Avg tokens / request"
        info="Total tokens ÷ requests — the average context size per call. A right-sizing signal alongside Cost/request. Ratio is sampling-invariant."
        value={avgTokensPerReq != null ? fmtCount(avgTokensPerReq) : "—"}
        sub="tokens ÷ requests"
      />

      <Tile
        label="Active findings"
        info="Open problem patterns detected in the current scope, broken down by severity (critical / warning / info). Select a finding in the list below the map for detail and the contributing prompts."
        variant="visual"
        visual={
          <MiniDonut
            size={96}
            thickness={14}
            values={findingsTotal > 0 ? findingSlices.map((s) => s[2]) : [1]}
            labels={findingsTotal > 0 ? findingSlices.map((s) => s[0]) : ["None"]}
            colors={findingsTotal > 0 ? findingSlices.map((s) => s[1]) : ["var(--green-2)"]}
            valueFormatter={(n) => `${fmtCount(n)}`}
            centerValue={String(findingsTotal)}
          />
        }
        visualCaption={
          findingsTotal > 0
            ? `${sev.critical} crit · ${sev.warning} warn · ${sev.info} info`
            : "none open"
        }
      />
    </div>
  );
};
