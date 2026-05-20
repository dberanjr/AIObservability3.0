import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { fmtCount } from "../../data/format";
import type { Tier, TopologyGraphData } from "./useTopology";

const Tile = ({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) => (
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
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
        }}
      >
        {value}
      </Text>
      {sub && (
        <Text style={{ fontSize: 11, color: "var(--text-3)" }}>{sub}</Text>
      )}
    </Flex>
  </Surface>
);

export interface TopologyTilesRowProps {
  graph: TopologyGraphData;
  hiddenTiers: Set<Tier>;
}

export const TopologyTilesRow = ({
  graph,
  hiddenTiers,
}: TopologyTilesRowProps) => {
  if (graph.isLoading && graph.nodes.length === 0) {
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

  const hiddenEdges = graph.edges.filter(
    (e) => hiddenTiers.has(e.sourceTier) || hiddenTiers.has(e.targetTier),
  ).length;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
        gap: 10,
      }}
    >
      <Tile label="Services" value={fmtCount(graph.byTier.service.length)} />
      <Tile label="Agents" value={fmtCount(graph.byTier.agent.length)} />
      <Tile label="Tools" value={fmtCount(graph.byTier.tool.length)} />
      <Tile label="Models" value={fmtCount(graph.byTier.model.length)} />
      <Tile
        label="Edges"
        value={fmtCount(graph.edges.length)}
        sub={hiddenEdges > 0 ? `${hiddenEdges} hidden by filter` : undefined}
      />
      <Tile
        label="Critical path"
        value={fmtCount(graph.criticalNodeIds.size)}
        sub={
          graph.criticalNodeIds.size > 0
            ? "top service → agent → tool"
            : "no path detected"
        }
      />
    </div>
  );
};
