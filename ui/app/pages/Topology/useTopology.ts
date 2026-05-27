import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useGlobalFilters } from "../../scope/GlobalFilterContext";
import {
  canQueryScope,
  useResolvedServices,
} from "../../scope/useResolvedServices";
import { buildTopologyQuery } from "./queries";
import { toNum } from "../../data/format";

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

export type Tier = "service" | "agent" | "tool" | "model";

export interface TopologyNode {
  id: string;
  tier: Tier;
  label: string;
  calls: number;
  errors: number;
  errorRatePct: number;
}

export interface TopologyEdge {
  id: string;
  source: string;
  target: string;
  sourceTier: Tier;
  targetTier: Tier;
  calls: number;
}

export interface TopologyGraphData {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  byTier: Record<Tier, TopologyNode[]>;
  /** Edge IDs that lie on the inferred critical path. */
  criticalEdgeIds: Set<string>;
  /** Node IDs that lie on the inferred critical path. */
  criticalNodeIds: Set<string>;
  maxCalls: number;
  isLoading: boolean;
  error?: Error;
}

interface CoocRecord {
  service?: string | null;
  agent?: string | null;
  tool?: string | null;
  model?: string | null;
  calls?: number;
  errors?: number;
}

const tierKey = (tier: Tier, label: string): string => `${tier}:${label}`;

const TIER_LABEL: Record<Tier, string> = {
  service: "Services",
  agent: "Agents",
  tool: "Tools",
  model: "Models",
};

export const TIER_DISPLAY = TIER_LABEL;

const upsertNode = (
  map: Map<string, TopologyNode>,
  tier: Tier,
  label: string,
  calls: number,
  errors: number,
) => {
  const id = tierKey(tier, label);
  const existing = map.get(id);
  if (existing) {
    existing.calls += calls;
    existing.errors += errors;
  } else {
    map.set(id, { id, tier, label, calls, errors, errorRatePct: 0 });
  }
};

const upsertEdge = (
  map: Map<string, TopologyEdge>,
  source: TopologyNode,
  target: TopologyNode,
  calls: number,
) => {
  const id = `${source.id}→${target.id}`;
  const existing = map.get(id);
  if (existing) {
    existing.calls += calls;
  } else {
    map.set(id, {
      id,
      source: source.id,
      target: target.id,
      sourceTier: source.tier,
      targetTier: target.tier,
      calls,
    });
  }
};

/**
 * Pick a critical path: top service by calls → its top agent → that agent's
 * top tool. Returns the set of edge + node IDs along the path. Falls back to
 * just service+agent when no tool edges exist.
 */
const computeCriticalPath = (
  nodes: Map<string, TopologyNode>,
  edges: Map<string, TopologyEdge>,
): { edgeIds: Set<string>; nodeIds: Set<string> } => {
  const edgeIds = new Set<string>();
  const nodeIds = new Set<string>();
  const services = Array.from(nodes.values()).filter(
    (n) => n.tier === "service",
  );
  if (services.length === 0) return { edgeIds, nodeIds };
  const topService = services.reduce((a, b) => (b.calls > a.calls ? b : a));

  const fromService = Array.from(edges.values())
    .filter((e) => e.source === topService.id && e.targetTier === "agent")
    .sort((a, b) => b.calls - a.calls)[0];
  if (!fromService) {
    nodeIds.add(topService.id);
    return { edgeIds, nodeIds };
  }
  nodeIds.add(topService.id);
  nodeIds.add(fromService.target);
  edgeIds.add(fromService.id);

  const fromAgent = Array.from(edges.values())
    .filter(
      (e) =>
        e.source === fromService.target &&
        (e.targetTier === "tool" || e.targetTier === "model"),
    )
    .sort((a, b) => b.calls - a.calls)[0];
  if (fromAgent) {
    nodeIds.add(fromAgent.target);
    edgeIds.add(fromAgent.id);
  }

  return { edgeIds, nodeIds };
};

export const useTopology = (): TopologyGraphData => {
  const { scope } = useScope();
  const { filters } = useGlobalFilters();
  const resolution = useResolvedServices();
  const canQuery = canQueryScope(resolution);

  const { data, isLoading, error } = useScopedDql<CoocRecord>(
    canQuery ? buildTopologyQuery(resolution.serviceIds, scope.timeframe, filters) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  return useMemo<TopologyGraphData>(() => {
    const nodes = new Map<string, TopologyNode>();
    const edges = new Map<string, TopologyEdge>();

    for (const r of data?.records ?? []) {
      const service = r.service ?? "";
      const agent = r.agent ?? "";
      const tool = r.tool ?? "";
      const model = r.model ?? "";
      const calls = num(r.calls);
      const errors = num(r.errors);

      if (service) upsertNode(nodes, "service", service, calls, errors);
      if (agent) upsertNode(nodes, "agent", agent, calls, errors);
      if (tool) upsertNode(nodes, "tool", tool, calls, errors);
      if (model) upsertNode(nodes, "model", model, calls, errors);

      if (service && agent) {
        const sNode = nodes.get(tierKey("service", service))!;
        const aNode = nodes.get(tierKey("agent", agent))!;
        upsertEdge(edges, sNode, aNode, calls);
      }
      if (agent && tool) {
        const aNode = nodes.get(tierKey("agent", agent))!;
        const tNode = nodes.get(tierKey("tool", tool))!;
        upsertEdge(edges, aNode, tNode, calls);
      }
      if (agent && model) {
        const aNode = nodes.get(tierKey("agent", agent))!;
        const mNode = nodes.get(tierKey("model", model))!;
        upsertEdge(edges, aNode, mNode, calls);
      }
    }

    for (const node of nodes.values()) {
      node.errorRatePct =
        node.calls > 0 ? (node.errors / node.calls) * 100 : 0;
    }

    const allNodes = Array.from(nodes.values()).sort(
      (a, b) => b.calls - a.calls,
    );
    const byTier: Record<Tier, TopologyNode[]> = {
      service: [],
      agent: [],
      tool: [],
      model: [],
    };
    for (const n of allNodes) byTier[n.tier].push(n);

    const allEdges = Array.from(edges.values()).sort(
      (a, b) => b.calls - a.calls,
    );

    const { edgeIds, nodeIds } = computeCriticalPath(nodes, edges);
    const maxCalls = allNodes.reduce((acc, n) => Math.max(acc, n.calls), 0);

    return {
      nodes: allNodes,
      edges: allEdges,
      byTier,
      criticalEdgeIds: edgeIds,
      criticalNodeIds: nodeIds,
      maxCalls,
      isLoading: resolution.isLoading || isLoading,
      error: error ?? undefined,
    };
  }, [data, isLoading, error, resolution.isLoading, filters]);
};

export const TIER_COLORS: Record<Tier, string> = {
  service: "var(--cyan)",
  agent: "var(--blue)",
  tool: "var(--purple)",
  model: "var(--purple-2)",
};
