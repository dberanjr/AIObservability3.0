import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { fmtCount, fmtMs, fmtPercent } from "../../data/format";
import {
  ZONE_LATENCY_THRESHOLD_MS,
  type Tool,
} from "./useTools";

interface TileProps {
  label: string;
  value: string;
  sub?: string;
  emphasis?: "default" | "amber" | "red";
}

const COLOR: Record<NonNullable<TileProps["emphasis"]>, string> = {
  default: "var(--text)",
  amber: "var(--amber)",
  red: "var(--red)",
};

const Tile = ({ label, value, sub, emphasis = "default" }: TileProps) => (
  <Surface elevation="raised" padding={12}>
    <Flex flexDirection="column" gap={4}>
      <Text
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: "var(--text-3)",
          minHeight: 28,
          whiteSpace: "normal",
          lineHeight: 1.2,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: 22,
          fontWeight: 600,
          color: COLOR[emphasis],
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
        }}
      >
        {value}
      </Text>
      {sub && <Text style={{ fontSize: 11, color: "var(--text-3)" }}>{sub}</Text>}
    </Flex>
  </Surface>
);

export interface ToolsTilesRowProps {
  tools: Tool[];
  isLoading: boolean;
}

export const ToolsTilesRow = ({ tools, isLoading }: ToolsTilesRowProps) => {
  if (isLoading && tools.length === 0) {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
          gap: 10,
        }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <Surface key={i} elevation="raised" padding={12}>
            <Flex flexDirection="column" gap={6}>
              <Skeleton style={{ height: 12, width: "60%" }} />
              <Skeleton style={{ height: 22, width: "80%" }} />
            </Flex>
          </Surface>
        ))}
      </div>
    );
  }

  const mcpTools = tools.filter((t) => t.mcpServer != null).length;
  const mcpServers = new Set(
    tools.map((t) => t.mcpServer).filter((s): s is string => Boolean(s)),
  ).size;
  const totalCalls = tools.reduce((acc, t) => acc + t.calls, 0);
  const slowTools = tools.filter(
    (t) => t.avgMs > ZONE_LATENCY_THRESHOLD_MS,
  ).length;
  const totalRetries = tools.reduce((acc, t) => acc + t.retryTotal, 0);
  const avgRetryPct = totalCalls > 0 ? (totalRetries / totalCalls) * 100 : 0;
  const slowestP99 = tools.reduce((acc, t) => Math.max(acc, t.p99Ms), 0);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
        gap: 10,
      }}
    >
      <Tile label="MCP tools" value={fmtCount(mcpTools)} />
      <Tile label="MCP servers" value={fmtCount(mcpServers)} />
      <Tile label="Total calls" value={fmtCount(totalCalls)} />
      <Tile
        label="Slow tools"
        value={fmtCount(slowTools)}
        sub={`avg > ${ZONE_LATENCY_THRESHOLD_MS / 1000}s`}
        emphasis={slowTools > 0 ? "amber" : "default"}
      />
      <Tile
        label="Avg retry rate"
        value={fmtPercent(avgRetryPct, 2)}
        sub="across all tool calls"
      />
      <Tile
        label="Slowest P99"
        value={fmtMs(slowestP99)}
        emphasis={slowestP99 > ZONE_LATENCY_THRESHOLD_MS ? "amber" : "default"}
      />
    </div>
  );
};
