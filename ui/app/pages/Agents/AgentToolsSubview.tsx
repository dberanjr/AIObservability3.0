/**
 * Per-agent tool-call table (Agents-tab "Tools" sub-view, absorbed from the
 * retired Tools tab). Reuses the Tools per-tool query with an added agent
 * filter. Tool definition follows the Tweaks "Agent tools · definition"
 * setting, defaulting to Discovered (count MCP / internal function spans by
 * name) since gen_ai.tool.name is absent on the validation tenants.
 *
 * Columns are sortable; clicking a tool expands a calls-vs-latency time series.
 */
import React, { useMemo, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { ChevronDownIcon, ChevronRightIcon } from "@dynatrace/strato-icons";
import { useScope } from "../../scope/ScopeContext";
import { useSampling } from "../../scope/SamplingContext";
import {
  useResolvedServices,
  canQueryScope,
} from "../../scope/useResolvedServices";
import { useScopedDql } from "../../scope/useScopedDql";
import { useTweaks } from "../../tweaks/TweaksContext";
import {
  buildToolsQuery,
  buildDiscoveredToolsQuery,
  buildAgentToolDetailQuery,
} from "../Tools/queries";
import {
  parseScopeMs,
  pickChartBucket,
  intervalPhraseFromMs,
} from "../../scope/chartInterval";
import { AreaChart } from "../../components/charts/AreaChart";
import { fmtCount, fmtMs, fmtPercent, toNum } from "../../data/format";
import { EmptyState } from "../../components/EmptyState";
import { HIGH_FREQUENCY_TOOL_THRESHOLD, isHighFrequency } from "./constants";

interface ToolRec {
  tool?: string;
  calls?: number;
  avg_ms?: number;
  p90_ms?: number;
  p99_ms?: number;
  error_rate_pct?: number;
  retry_rate_pct?: number;
}

interface ToolRow {
  tool: string;
  calls: number;
  avgMs: number;
  p90Ms: number;
  p99Ms: number;
  errorPct: number;
  retryPct: number;
}

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

type SortKey = "tool" | "calls" | "avgMs" | "p90Ms" | "errorPct" | "retryPct";

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: "var(--text-3)",
  cursor: "pointer",
  userSelect: "none",
  whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  padding: "6px 8px",
  fontSize: 12.5,
  fontVariantNumeric: "tabular-nums",
};

const SortHeader = ({
  label,
  col,
  sortKey,
  dir,
  onSort,
  align = "left",
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  dir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) => (
  <th
    style={{ ...th, textAlign: align }}
    onClick={() => onSort(col)}
    aria-sort={sortKey === col ? (dir === "asc" ? "ascending" : "descending") : "none"}
    title="Sort"
  >
    {label}
    <span style={{ marginLeft: 4, color: sortKey === col ? "var(--text-2)" : "var(--text-4)" }}>
      {sortKey === col ? (dir === "asc" ? "▲" : "▼") : "↕"}
    </span>
  </th>
);

/** Lazily-queried calls-vs-latency time series for a single expanded tool. */
const ToolDetail = ({
  agentName,
  toolName,
  strict,
}: {
  agentName: string;
  toolName: string;
  strict: boolean;
}) => {
  const { scope } = useScope();
  const { samplingRatio } = useSampling();
  const resolution = useResolvedServices();
  const canQuery = canQueryScope(resolution);
  const intervalSec = pickChartBucket(parseScopeMs(scope.timeframe.from)).sec;

  const { data, isLoading } = useScopedDql<{
    calls?: (number | null)[] | null;
    p90_ns?: (number | null)[] | null;
  }>(
    canQuery
      ? buildAgentToolDetailQuery(
          resolution.serviceIds,
          scope.timeframe,
          agentName,
          toolName,
          intervalSec,
          strict,
        )
      : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  const rec = data?.records?.[0];
  const calls = (rec?.calls ?? []).map((v) => (typeof v === "number" ? v * samplingRatio : 0));
  const p90Ms = (rec?.p90_ns ?? []).map((v) => (typeof v === "number" ? v / 1_000_000 : 0));

  if (isLoading) return <Skeleton style={{ height: 170 }} />;
  if (calls.length <= 1)
    return (
      <Text style={{ fontSize: 12, color: "var(--text-3)" }}>
        Not enough data points to plot a trend for this tool in the current window.
      </Text>
    );

  return (
    <Flex flexDirection="column" gap={4}>
      <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
        Calls (area, left) &amp; p90 latency (line, right) · per{" "}
        {intervalPhraseFromMs(intervalSec * 1000)}
      </Text>
      <AreaChart
        height={170}
        formatLeft={(n) => fmtCount(Math.round(n))}
        formatRight={(n) => fmtMs(n)}
        series={[
          { label: "Calls", color: "var(--blue)", values: calls, axis: "left" },
          { label: "p90 latency", color: "var(--purple-2)", values: p90Ms, axis: "right" },
        ]}
      />
    </Flex>
  );
};

export const AgentToolsSubview = ({ agentName }: { agentName: string }) => {
  const { scope } = useScope();
  const { samplingRatio } = useSampling();
  const resolution = useResolvedServices();
  const canQuery = canQueryScope(resolution);
  const { pageConfig } = useTweaks();
  const strict = pageConfig.toolsMode === "strict";

  const [sortKey, setSortKey] = useState<SortKey>("calls");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [expanded, setExpanded] = useState<string | null>(null);

  const onSort = (k: SortKey) => {
    if (k === sortKey) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      // Text column defaults to ascending; numeric columns to descending.
      setDir(k === "tool" ? "asc" : "desc");
    }
  };

  const query = canQuery
    ? strict
      ? buildToolsQuery(resolution.serviceIds, scope.timeframe, undefined, agentName)
      : buildDiscoveredToolsQuery(resolution.serviceIds, scope.timeframe, undefined, agentName)
    : "";

  const { data, isLoading } = useScopedDql<ToolRec>(query, {
    enabled: canQuery,
    staleTime: 60_000,
  });

  const rows = useMemo<ToolRow[]>(
    () =>
      (data?.records ?? []).map((r) => ({
        tool: r.tool ?? "—",
        calls: num(r.calls) * samplingRatio,
        avgMs: num(r.avg_ms),
        p90Ms: num(r.p90_ms),
        p99Ms: num(r.p99_ms),
        errorPct: num(r.error_rate_pct),
        retryPct: num(r.retry_rate_pct),
      })),
    [data, samplingRatio],
  );

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      let cmp: number;
      if (sortKey === "tool") cmp = a.tool.localeCompare(b.tool);
      else cmp = a[sortKey] - b[sortKey];
      return dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [rows, sortKey, dir]);

  if (isLoading)
    return (
      <Flex flexDirection="column" gap={6} style={{ padding: "4px 0" }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} style={{ height: 26 }} />
        ))}
      </Flex>
    );

  if (rows.length === 0)
    return (
      <EmptyState
        bare
        title="No tool calls for this agent"
        description={
          strict
            ? "Strict mode counts only spans with gen_ai.tool.name (absent on these tenants). Switch tool definition to Discovered in Tweaks."
            : "No MCP / internal function spans found for this agent in the current scope."
        }
      />
    );

  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={{ ...th, width: 20 }} aria-hidden />
          <SortHeader label="Tool" col="tool" sortKey={sortKey} dir={dir} onSort={onSort} />
          <SortHeader label="Calls" col="calls" sortKey={sortKey} dir={dir} onSort={onSort} align="right" />
          <SortHeader label="Avg" col="avgMs" sortKey={sortKey} dir={dir} onSort={onSort} align="right" />
          <SortHeader label="P90" col="p90Ms" sortKey={sortKey} dir={dir} onSort={onSort} align="right" />
          <SortHeader label="Error %" col="errorPct" sortKey={sortKey} dir={dir} onSort={onSort} align="right" />
          <SortHeader label="Retry %" col="retryPct" sortKey={sortKey} dir={dir} onSort={onSort} align="right" />
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => {
          const highFreq = isHighFrequency(r.calls);
          const isOpen = expanded === r.tool;
          return (
            <React.Fragment key={r.tool}>
              <tr
                onClick={() => setExpanded((cur) => (cur === r.tool ? null : r.tool))}
                style={{ borderTop: "1px solid var(--surface-3)", cursor: "pointer" }}
                title="Show calls vs latency"
              >
                <td style={{ ...td, width: 20 }}>
                  {isOpen ? (
                    <ChevronDownIcon size={12} style={{ color: "var(--text-3)" }} />
                  ) : (
                    <ChevronRightIcon size={12} style={{ color: "var(--text-3)" }} />
                  )}
                </td>
                <td style={{ ...td, textAlign: "left" }}>
                  {r.tool}
                  {highFreq && (
                    <span
                      title={`Called ${fmtCount(r.calls)}× — above the high-frequency threshold (${HIGH_FREQUENCY_TOOL_THRESHOLD})`}
                      style={{
                        marginLeft: 6,
                        fontSize: 10,
                        fontWeight: 600,
                        color: "var(--amber)",
                        border: "1px solid var(--amber)",
                        borderRadius: 4,
                        padding: "0 4px",
                      }}
                    >
                      high frequency
                    </span>
                  )}
                </td>
                <td style={{ ...td, textAlign: "right" }}>{fmtCount(r.calls)}</td>
                <td style={{ ...td, textAlign: "right" }}>{fmtMs(r.avgMs)}</td>
                <td style={{ ...td, textAlign: "right" }}>{fmtMs(r.p90Ms)}</td>
                <td style={{ ...td, textAlign: "right" }}>{fmtPercent(r.errorPct)}</td>
                <td style={{ ...td, textAlign: "right" }}>{fmtPercent(r.retryPct)}</td>
              </tr>
              {isOpen && (
                <tr>
                  <td colSpan={7} style={{ padding: "8px 8px 14px", background: "var(--surface-2)" }}>
                    <Flex gap={16} style={{ flexWrap: "wrap", marginBottom: 8 }}>
                      <Detail label="Calls" value={fmtCount(r.calls)} />
                      <Detail label="Avg" value={fmtMs(r.avgMs)} />
                      <Detail label="P90" value={fmtMs(r.p90Ms)} />
                      <Detail label="P99" value={fmtMs(r.p99Ms)} />
                      <Detail label="Error %" value={fmtPercent(r.errorPct)} />
                      <Detail label="Retry %" value={fmtPercent(r.retryPct)} />
                    </Flex>
                    <ToolDetail agentName={agentName} toolName={r.tool} strict={strict} />
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
};

const Detail = ({ label, value }: { label: string; value: string }) => (
  <Flex flexDirection="column" gap={2}>
    <Text style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-3)" }}>
      {label}
    </Text>
    <Text style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{value}</Text>
  </Flex>
);
