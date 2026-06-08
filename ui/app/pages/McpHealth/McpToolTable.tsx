import React, { useState } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { InfoTooltip } from "../../components/InfoTooltip";
import { FilterTrigger } from "../../components/FilterTrigger";
import { fmtCount, fmtMs } from "../../data/format";
import { MCP_THRESHOLDS } from "./status";
import type { McpToolRow } from "./useMcpHealth";

type SortKey = "label" | "calls" | "errorRatePct" | "p50Ms" | "p95Ms";

const StatusPill = ({ label, color }: { label: string; color: string }) => (
  <span
    style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 999,
      fontSize: 10.5,
      fontWeight: 600,
      letterSpacing: "0.03em",
      whiteSpace: "nowrap",
      color,
      background: `color-mix(in oklab, ${color} 14%, transparent)`,
      border: `1px solid color-mix(in oklab, ${color} 38%, transparent)`,
    }}
  >
    {label}
  </span>
);

/** Latency cell color: amber in the seconds range, red past the slow threshold. */
const latencyColor = (ms: number): string =>
  ms >= MCP_THRESHOLDS.slowP95Ms
    ? "var(--red)"
    : ms >= MCP_THRESHOLDS.kpiLatencyAmberMs
      ? "var(--amber)"
      : "var(--text)";

export interface McpToolTableProps {
  rows: McpToolRow[];
  isLoading: boolean;
}

export const McpToolTable = ({ rows, isLoading }: McpToolTableProps) => {
  const [sortKey, setSortKey] = useState<SortKey>("calls");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir(key === "label" ? "asc" : "desc");
    }
  };

  const sorted = [...rows].sort((a, b) => {
    let cmp: number;
    if (sortKey === "label") cmp = a.label.localeCompare(b.label);
    else cmp = a[sortKey] - b[sortKey];
    return sortDir === "desc" ? -cmp : cmp;
  });

  const SortTh = ({
    col,
    children,
    first = false,
  }: {
    col: SortKey;
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
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={12}>
        <Flex alignItems="center" gap={6}>
          <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
            Tool health
          </Heading>
          <InfoTooltip text="Per-tool call volume, error rate, and latency. Tools are spans where traceloop.span.kind is tool; the tool name is span.name with the .tool suffix removed for display. Click any column header to sort. Click a tool name to add it as a global filter." />
        </Flex>

        {isLoading ? (
          <Flex flexDirection="column" gap={8}>
            <Skeleton style={{ height: 16, width: "100%" }} />
            <Skeleton style={{ height: 16, width: "100%" }} />
            <Skeleton style={{ height: 16, width: "100%" }} />
          </Flex>
        ) : (
          <div style={{ overflowX: "auto" }}>
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
                  <th style={{ padding: "6px 8px", width: 18 }} />
                  <SortTh col="label" first>
                    Tool
                  </SortTh>
                  <SortTh col="calls">Calls</SortTh>
                  <SortTh col="errorRatePct">Err %</SortTh>
                  <SortTh col="p50Ms">P50</SortTh>
                  <SortTh col="p95Ms">P95</SortTh>
                  <th
                    style={{
                      padding: "6px 8px",
                      textAlign: "right",
                      fontWeight: 600,
                      color: "var(--text-3)",
                    }}
                  >
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.key} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "7px 8px" }}>
                      <span
                        aria-hidden
                        style={{
                          display: "inline-block",
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: r.statusColor,
                        }}
                      />
                    </td>
                    <td
                      style={{
                        padding: "7px 8px",
                        maxWidth: 320,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={r.rawTool}
                    >
                      <FilterTrigger
                        attribute="span.name"
                        value={[r.rawTool]}
                        label="tool"
                      >
                        {r.label}
                      </FilterTrigger>
                    </td>
                    <td style={tdR}>{fmtCount(r.calls)}</td>
                    <td
                      style={{
                        ...tdR,
                        color: r.errorRatePct > 0 ? "var(--red)" : "var(--text-3)",
                        fontWeight: r.errorRatePct > 0 ? 600 : 400,
                      }}
                    >
                      {r.errorRatePct.toFixed(2)}%
                    </td>
                    <td style={{ ...tdR, color: latencyColor(r.p50Ms) }}>
                      {fmtMs(r.p50Ms)}
                    </td>
                    <td style={{ ...tdR, color: latencyColor(r.p95Ms) }}>
                      {fmtMs(r.p95Ms)}
                    </td>
                    <td style={{ padding: "7px 8px", textAlign: "right" }}>
                      <StatusPill label={r.statusLabel} color={r.statusColor} />
                    </td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      style={{
                        padding: "20px 8px",
                        textAlign: "center",
                        color: "var(--text-3)",
                        fontSize: 12,
                      }}
                    >
                      No tool activity detected in this window.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Flex>
    </Surface>
  );
};
