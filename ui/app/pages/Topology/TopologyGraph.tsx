import React, { useMemo, useState } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { fmtCount } from "../../data/format";
import {
  TIER_COLORS,
  TIER_DISPLAY,
  type Tier,
  type TopologyEdge,
  type TopologyGraphData,
  type TopologyNode,
} from "./useTopology";

const COLUMN_X: Record<Tier, number> = {
  service: 140,
  agent: 380,
  tool: 620,
  model: 860,
};
const COLUMN_WIDTH = 200;
const NODE_R = 16;
const ROW_HEIGHT = 44;
const TOP_PAD = 56;
const VIEW_W = 1000;
const HEADER_Y = 32;
const MAX_NODES_PER_TIER = 30;

const ringColor = (errorRatePct: number): string => {
  if (errorRatePct >= 5) return "var(--red)";
  if (errorRatePct >= 1) return "var(--amber)";
  return "var(--green-2)";
};

const edgeWidth = (calls: number, maxCalls: number): number => {
  if (maxCalls <= 0) return 1;
  const log = Math.log10(calls + 1) / Math.log10(maxCalls + 1);
  return Math.max(0.5, Math.min(5, 0.6 + log * 4));
};

const bezierPath = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): string => {
  const dx = (x2 - x1) * 0.5;
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
};

const buildAdjacency = (
  edges: TopologyEdge[],
): Map<string, Set<string>> => {
  const map = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!map.has(e.source)) map.set(e.source, new Set());
    if (!map.has(e.target)) map.set(e.target, new Set());
    map.get(e.source)!.add(e.target);
    map.get(e.target)!.add(e.source);
  }
  return map;
};

const bfsConnected = (
  startId: string,
  adjacency: Map<string, Set<string>>,
): Set<string> => {
  const visited = new Set<string>([startId]);
  const queue: string[] = [startId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = adjacency.get(current);
    if (!neighbors) continue;
    for (const n of neighbors) {
      if (!visited.has(n)) {
        visited.add(n);
        queue.push(n);
      }
    }
  }
  return visited;
};

const truncate = (s: string, n: number): string =>
  s.length > n ? `${s.slice(0, n - 1)}…` : s;

export interface TopologyGraphProps {
  graph: TopologyGraphData;
  hiddenTiers: Set<Tier>;
  showCriticalPath: boolean;
}

export const TopologyGraph = ({
  graph,
  hiddenTiers,
  showCriticalPath,
}: TopologyGraphProps) => {
  const [selected, setSelected] = useState<string | null>(null);

  const { visibleNodes, visibleEdges, positions, height } = useMemo(() => {
    const positions = new Map<string, { x: number; y: number }>();
    const visibleNodes: TopologyNode[] = [];
    let maxRows = 0;
    (Object.keys(COLUMN_X) as Tier[]).forEach((tier) => {
      if (hiddenTiers.has(tier)) return;
      const rows = graph.byTier[tier].slice(0, MAX_NODES_PER_TIER);
      maxRows = Math.max(maxRows, rows.length);
      rows.forEach((node, i) => {
        positions.set(node.id, {
          x: COLUMN_X[tier],
          y: TOP_PAD + i * ROW_HEIGHT,
        });
        visibleNodes.push(node);
      });
    });
    const visibleEdges = graph.edges.filter(
      (e) =>
        positions.has(e.source) &&
        positions.has(e.target) &&
        !hiddenTiers.has(e.sourceTier) &&
        !hiddenTiers.has(e.targetTier),
    );
    const height = Math.max(
      TOP_PAD + maxRows * ROW_HEIGHT + 24,
      280,
    );
    return { visibleNodes, visibleEdges, positions, height };
  }, [graph, hiddenTiers]);

  const adjacency = useMemo(
    () => buildAdjacency(visibleEdges),
    [visibleEdges],
  );

  const highlighted = useMemo<Set<string> | null>(() => {
    if (!selected) return null;
    if (!adjacency.has(selected)) return new Set([selected]);
    return bfsConnected(selected, adjacency);
  }, [selected, adjacency]);

  const selectedNode = selected
    ? visibleNodes.find((n) => n.id === selected) ?? null
    : null;

  const isNodeDimmed = (id: string): boolean =>
    highlighted != null && !highlighted.has(id);

  const isEdgeDimmed = (e: TopologyEdge): boolean =>
    highlighted != null &&
    !(highlighted.has(e.source) && highlighted.has(e.target));

  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={12}>
        <Flex alignItems="baseline" justifyContent="space-between">
          <Flex flexDirection="column" gap={2}>
            <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
              AI topology
            </Heading>
            <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
              {visibleNodes.length} nodes · {visibleEdges.length} edges
              {showCriticalPath && graph.criticalNodeIds.size > 0
                ? " · critical path overlay on"
                : ""}
            </Text>
          </Flex>
        </Flex>

        {graph.isLoading && visibleNodes.length === 0 ? (
          <Skeleton style={{ height: 320, borderRadius: 8 }} />
        ) : visibleNodes.length === 0 ? (
          <Flex
            alignItems="center"
            justifyContent="center"
            style={{
              padding: "48px 16px",
              border: "1px dashed var(--border)",
              borderRadius: 8,
              background: "var(--surface-2)",
            }}
          >
            <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
              No co-occurring AI spans in the current scope.
            </Text>
          </Flex>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <svg
              width="100%"
              height={height}
              viewBox={`0 0 ${VIEW_W} ${height}`}
              preserveAspectRatio="xMidYMin meet"
              role="img"
              aria-label="AI topology graph"
              style={{ minWidth: VIEW_W }}
            >
              {/* Column headers */}
              {(Object.keys(COLUMN_X) as Tier[])
                .filter((t) => !hiddenTiers.has(t))
                .map((tier) => (
                  <g key={tier} pointerEvents="none">
                    <text
                      x={COLUMN_X[tier]}
                      y={HEADER_Y}
                      fontSize={11}
                      fontWeight={700}
                      letterSpacing={1}
                      textAnchor="middle"
                      fill={TIER_COLORS[tier]}
                    >
                      {TIER_DISPLAY[tier].toUpperCase()}
                    </text>
                    <line
                      x1={COLUMN_X[tier] - COLUMN_WIDTH / 2}
                      x2={COLUMN_X[tier] + COLUMN_WIDTH / 2}
                      y1={HEADER_Y + 6}
                      y2={HEADER_Y + 6}
                      stroke={TIER_COLORS[tier]}
                      strokeOpacity={0.6}
                      strokeWidth={1.5}
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                ))}

              {/* Edges (drawn first so they sit under nodes) */}
              {visibleEdges.map((edge) => {
                const a = positions.get(edge.source);
                const b = positions.get(edge.target);
                if (!a || !b) return null;
                const dimmed = isEdgeDimmed(edge);
                const isCritical =
                  showCriticalPath && graph.criticalEdgeIds.has(edge.id);
                const baseWidth = edgeWidth(edge.calls, graph.maxCalls);
                const stroke = isCritical
                  ? "var(--red)"
                  : "var(--text-3)";
                const path = bezierPath(
                  a.x + NODE_R,
                  a.y,
                  b.x - NODE_R,
                  b.y,
                );
                return (
                  <g key={edge.id} pointerEvents="none">
                    {isCritical && (
                      <path
                        d={path}
                        stroke="var(--red)"
                        strokeOpacity={0.18}
                        strokeWidth={baseWidth * 3}
                        fill="none"
                        strokeLinecap="round"
                      />
                    )}
                    <path
                      d={path}
                      stroke={stroke}
                      strokeOpacity={dimmed ? 0.1 : isCritical ? 0.95 : 0.45}
                      strokeWidth={
                        isCritical ? Math.max(baseWidth * 2, 2) : baseWidth
                      }
                      fill="none"
                      strokeLinecap="round"
                    />
                  </g>
                );
              })}

              {/* Nodes */}
              {visibleNodes.map((node) => {
                const pos = positions.get(node.id);
                if (!pos) return null;
                const dimmed = isNodeDimmed(node.id);
                const isCritical =
                  showCriticalPath && graph.criticalNodeIds.has(node.id);
                const ring = ringColor(node.errorRatePct);
                const toggleSelect = () =>
                  setSelected((current) =>
                    current === node.id ? null : node.id,
                  );
                return (
                  <g
                    key={node.id}
                    transform={`translate(${pos.x}, ${pos.y})`}
                    opacity={dimmed ? 0.25 : 1}
                    style={{ cursor: "pointer", outline: "none" }}
                    tabIndex={0}
                    role="button"
                    aria-label={`${node.tier} ${node.label} — ${node.calls.toLocaleString()} calls`}
                    aria-pressed={selected === node.id}
                    onClick={toggleSelect}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleSelect();
                      } else if (e.key === "Escape" && selected) {
                        e.preventDefault();
                        setSelected(null);
                      }
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.filter =
                        "drop-shadow(0 0 4px var(--blue))";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.filter = "none";
                    }}
                  >
                    <circle
                      r={NODE_R + 4}
                      fill="none"
                      stroke={ring}
                      strokeWidth={isCritical ? 3 : 2}
                      strokeOpacity={isCritical ? 0.85 : 0.55}
                    />
                    <circle
                      r={NODE_R}
                      fill="var(--surface)"
                      stroke={TIER_COLORS[node.tier]}
                      strokeWidth={1.5}
                    />
                    <text
                      x={0}
                      y={4}
                      fontSize={10}
                      fontWeight={700}
                      textAnchor="middle"
                      fill={TIER_COLORS[node.tier]}
                      pointerEvents="none"
                    >
                      {node.tier === "service"
                        ? "S"
                        : node.tier === "agent"
                          ? "A"
                          : node.tier === "tool"
                            ? "T"
                            : "M"}
                    </text>
                    <text
                      x={NODE_R + 8}
                      y={-3}
                      fontSize={11.5}
                      fontFamily="var(--mono, monospace)"
                      fill="var(--text)"
                      pointerEvents="none"
                    >
                      {truncate(node.label, 24)}
                    </text>
                    <text
                      x={NODE_R + 8}
                      y={11}
                      fontSize={10}
                      fill="var(--text-3)"
                      fontFamily="var(--mono, monospace)"
                      pointerEvents="none"
                    >
                      {fmtCount(node.calls)} calls
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        )}

        {/* Bottom status line */}
        <Flex
          alignItems="center"
          gap={12}
          style={{
            padding: "8px 12px",
            borderRadius: 6,
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
          }}
        >
          {selectedNode ? (
            <>
              <Text style={{ fontSize: 12, color: "var(--text-2)" }}>
                Highlighting:{" "}
                <strong style={{ fontFamily: "var(--mono, monospace)" }}>
                  {selectedNode.label}
                </strong>{" "}
                · {(highlighted?.size ?? 1) - 1} connected{" "}
                {(highlighted?.size ?? 1) - 1 === 1 ? "node" : "nodes"}
              </Text>
              <Flex flexGrow={1} />
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Clear topology selection"
                style={{
                  all: "unset",
                  cursor: "pointer",
                  fontSize: 12,
                  color: "var(--blue)",
                }}
              >
                Clear
              </button>
            </>
          ) : (
            <Text style={{ fontSize: 12, color: "var(--text-3)" }}>
              Click any node to highlight its connected chain.
            </Text>
          )}
        </Flex>
      </Flex>
    </Surface>
  );
};
