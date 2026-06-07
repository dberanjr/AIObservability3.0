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

type DonutColumnMode = "tokens" | "mcp-tabs";
type McpTab = "volume" | "latency" | "errors";

const MCP_TAB_LIST: Array<{ id: McpTab; label: string }> = [
  { id: "volume", label: "Volume" },
  { id: "latency", label: "Latency" },
  { id: "errors", label: "Errors" },
];

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

/**
 * Tabbed breakdown table for MCP Server / MCP Tool popups. Tabs: Volume |
 * Latency | Errors. Manages its own tab state so the donut + footer stats
 * outside remain static while the table columns switch per-tab.
 */
const McpHealthTable = ({
  slices,
  fmt,
  rowLabel,
}: {
  slices: BreakdownSlice[];
  fmt: (n: number) => string;
  rowLabel: string;
}) => {
  const [tab, setTab] = useState<McpTab>("volume");
  const sorted = [...slices].sort((a, b) => b.value - a.value);
  const total = sorted.reduce((a, b) => a + b.value, 0);

  const thR: React.CSSProperties = { padding: "6px 8px", fontWeight: 600, textAlign: "right", whiteSpace: "nowrap" };
  const tdR: React.CSSProperties = { padding: "8px", textAlign: "right" };

  return (
    <div style={{ width: "100%" }}>
      {/* Tab bar */}
      <div
        style={{
          display: "inline-flex",
          gap: 2,
          marginBottom: 12,
          background: "var(--surface-2)",
          borderRadius: 8,
          padding: 3,
        }}
      >
        {MCP_TAB_LIST.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              all: "unset",
              cursor: "pointer",
              padding: "4px 14px",
              borderRadius: 6,
              fontSize: 12.5,
              fontWeight: tab === t.id ? 600 : 500,
              color: tab === t.id ? "var(--text)" : "var(--text-2)",
              background: tab === t.id ? "var(--surface)" : "transparent",
              boxShadow: tab === t.id ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              transition: "background 0.12s, color 0.12s",
              whiteSpace: "nowrap",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>
        <thead>
          <tr style={{ color: "var(--text-3)", textAlign: "left" }}>
            <th style={{ padding: "6px 8px", fontWeight: 600 }}></th>
            <th style={{ padding: "6px 8px", fontWeight: 600 }}>{rowLabel}</th>
            {tab === "volume" && <th style={thR}>Value</th>}
            {tab === "latency" && <>
              <th style={thR}>Avg</th>
              <th style={thR}>P50</th>
              <th style={thR}>P95</th>
              <th style={thR}>P99</th>
            </>}
            {tab === "errors" && <>
              <th style={thR}>Span Err</th>
              <th style={thR}>Tool Err</th>
              <th style={thR}>Total</th>
              <th style={thR}>Rate</th>
            </>}
            <th style={thR}>Share</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s, idx) => {
            const pct = total > 0 ? (s.value / total) * 100 : 0;
            const color = SLICE_COLORS[idx % SLICE_COLORS.length];
            const totalErrors = s.spanErrors + s.toolErrors;
            const errorRate = s.value > 0 ? (totalErrors / s.value) * 100 : 0;
            const errColor = (n: number) =>
              n > 0 ? "var(--red)" : "var(--text-3)";
            const toolErrColor = (n: number) =>
              n > 0 ? "var(--amber)" : "var(--text-3)";
            return (
              <tr key={s.key} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ padding: "8px" }}>
                  <span aria-hidden style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: color }} />
                </td>
                <td style={{ padding: "8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }} title={s.label}>
                  {s.filter ? (
                    <FilterTrigger attribute={s.filter.attribute} value={s.filter.values} label={s.filter.label ?? s.label}>
                      {s.label}
                    </FilterTrigger>
                  ) : s.label}
                </td>
                {tab === "volume" && <td style={tdR}>{fmt(s.value)}</td>}
                {tab === "latency" && <>
                  <td style={tdR}>{fmtMs(s.avgDurationMs)}</td>
                  <td style={tdR}>{fmtMs(s.p50DurationMs)}</td>
                  <td style={tdR}>{fmtMs(s.p95DurationMs)}</td>
                  <td style={tdR}>{fmtMs(s.p99DurationMs)}</td>
                </>}
                {tab === "errors" && <>
                  <td style={{ ...tdR, color: errColor(s.spanErrors) }}>{fmtCount(s.spanErrors)}</td>
                  <td style={{ ...tdR, color: toolErrColor(s.toolErrors) }}>{fmtCount(s.toolErrors)}</td>
                  <td style={{ ...tdR, color: errColor(totalErrors) }}>{fmtCount(totalErrors)}</td>
                  <td style={{ ...tdR, color: errColor(totalErrors) }}>{errorRate.toFixed(1)}%</td>
                </>}
                <td style={{ ...tdR, color: "var(--text-3)" }}>{pct.toFixed(1)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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

export const SummaryTilesRow = ({ summary }: SummaryTilesRowProps) => {
  const breakdowns = useTileBreakdowns();
  const { scope } = useScope();
  const timeframeLabel = formatTimeframe(scope.timeframe.from, scope.timeframe.to);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // Default to 9 columns until the observer fires — avoids a jarring
  // reflow on first mount on wide viewports.
  const [columns, setColumns] = useState(9);

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
        <Flex gap={32} alignItems={columnMode === "mcp-tabs" ? "flex-start" : "center"} style={{ minHeight: 360 }}>
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
            {columnMode === "mcp-tabs" ? (
              <McpHealthTable slices={slices} fmt={fmt} rowLabel={pluralCenterLabel} />
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
        columnMode === "mcp-tabs"
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
        info="Blended USD estimate computed by applying default per-model pricing to the input/output token counts. Useful as a directional cost signal; the FinOps tab is authoritative."
        value={fmtUSDCompact(summary.spend)}
        sub="Blended est."
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
            "mcp-tabs",
          )
        }
      />
      <Tile
        label="MCP tools"
        info="Distinct MCP tools invoked within MCP workflows. Tool name comes from gen_ai.tool.name with a fallback to traceloop.entity.name. Donut sized by call count."
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
            "MCP tools",
            "Distinct tools invoked within MCP workflows, sized by call count.",
            summary.mcpTools,
            "Tool",
            breakdowns.mcpTools,
            (n) => `${fmtCount(n)} call${n === 1 ? "" : "s"}`,
            "mcp-tabs",
          )
        }
      />

      <Tile
        label="Cost / request"
        info="Total blended spend divided by the number of requests. The scale below shows where this value falls on a $0–$0.05 range (green = cheap, red = expensive). Ratio is sampling-invariant."
        value={fmtUSD(summary.costPerRequest)}
        sub="blended, all models"
        bottom={
          summary.costPerRequest != null ? (
            <MiniScale
              value={summary.costPerRequest}
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
    </div>
  );
};
