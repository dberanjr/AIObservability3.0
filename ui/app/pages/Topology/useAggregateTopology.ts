import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { canQueryScope, useResolvedServices } from "../../scope/useResolvedServices";
import { toNum } from "../../data/format";
import {
  buildAggregateTopologyQuery,
  buildAiServiceIdsQuery,
  buildUpstreamEdgesQuery,
  buildDownstreamEdgesQuery,
  buildAffectedServiceIdsQuery,
} from "./aggregateQueries";
import {
  mergeServiceAgentNodes,
  nid,
  type AggTier,
  type AggNode,
  type AggEdge,
} from "./mergeNodes";

export type { AggTier, AggNode, AggEdge } from "./mergeNodes";
export { mergeServiceAgentNodes } from "./mergeNodes";

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

/** Left-to-right / top-to-bottom tier order for the layered layouts. */
export const TIER_ORDER: AggTier[] = [
  "upstream",
  "service",
  "agent",
  "tool",
  "model",
  "provider",
  "downstream",
];

export const TIER_LABEL: Record<AggTier, string> = {
  upstream: "Upstream",
  service: "AI service",
  agent: "Agent",
  tool: "Tool",
  model: "Model",
  provider: "Provider",
  downstream: "Downstream",
};

export const TIER_COLOR: Record<AggTier, string> = {
  upstream: "var(--text-3)",
  service: "var(--blue)",
  agent: "var(--purple-2)",
  tool: "var(--cyan)",
  model: "var(--green-2)",
  provider: "var(--amber)",
  downstream: "var(--text-4)",
};

export interface AggTopologyResult {
  nodes: AggNode[];
  edges: AggEdge[];
  tierCounts: Record<AggTier, { shown: number; total: number }>;
  maxCalls: number;
  /** Node IDs (service tier) with an active Davis problem. */
  affectedNodeIds: Set<string>;
  isLoading: boolean;
  isEmpty: boolean;
  error?: Error;
}

interface CoocRecord {
  service?: string | null;
  agent?: string | null;
  tool?: string | null;
  model?: string | null;
  provider?: string | null;
  calls?: number;
  errors?: number;
}
interface IdRecord {
  svc?: string;
  name?: string | null;
}
interface EdgeRecord {
  upstream?: string;
  target_id?: string;
  source_id?: string;
  downstream?: string;
  n?: number;
}
interface AffectedRecord {
  eid?: string;
}

/** Per-tier node caps to keep the SVG render tractable. */
const TIER_CAP: Record<AggTier, number> = {
  upstream: 30,
  service: 30,
  agent: 40,
  tool: 40,
  model: 30,
  provider: 12,
  downstream: 30,
};

export const useAggregateTopology = (
  /** When set, the co-occurrence query is scoped to this agent so the graph
   *  shows the agent's own call topology (Agents-tab sub-view), not the fleet.
   *  The renderer is unchanged — only the data source is scoped (Path b). */
  agentName?: string,
): AggTopologyResult => {
  const { scope } = useScope();
  const resolution = useResolvedServices();
  const canQuery = canQueryScope(resolution);

  const coocRes = useScopedDql<CoocRecord>(
    canQuery
      ? buildAggregateTopologyQuery(
          resolution.serviceIds,
          scope.timeframe,
          agentName,
        )
      : "",
    { enabled: canQuery, staleTime: 60_000 },
  );
  const idRes = useScopedDql<IdRecord>(
    canQuery ? buildAiServiceIdsQuery(resolution.serviceIds, scope.timeframe) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  const aiServiceIds = useMemo(
    () => (idRes.data?.records ?? []).map((r) => r.svc).filter((s): s is string => !!s),
    [idRes.data],
  );

  // Smartscape edge queries are not span fetches, so they pass through
  // useScopedDql unchanged; ignoreGlobalFilter keeps the span-attribute filter
  // (which doesn't apply to smartscape) from being injected.
  const upstreamRes = useScopedDql<EdgeRecord>(
    aiServiceIds.length ? buildUpstreamEdgesQuery(aiServiceIds) : "",
    { enabled: aiServiceIds.length > 0, staleTime: 60_000, ignoreGlobalFilter: true },
  );
  const downstreamRes = useScopedDql<EdgeRecord>(
    aiServiceIds.length ? buildDownstreamEdgesQuery(aiServiceIds) : "",
    { enabled: aiServiceIds.length > 0, staleTime: 60_000, ignoreGlobalFilter: true },
  );
  const affectedRes = useScopedDql<AffectedRecord>(
    aiServiceIds.length ? buildAffectedServiceIdsQuery(aiServiceIds) : "",
    { enabled: aiServiceIds.length > 0, staleTime: 60_000, ignoreGlobalFilter: true },
  );

  // Map AI service entity id → resolved name (for problem-ring lookup).
  const idToName = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of idRes.data?.records ?? []) {
      if (r.svc && r.name) m.set(r.svc, r.name);
    }
    return m;
  }, [idRes.data]);

  return useMemo<AggTopologyResult>(() => {
    const nodeMap = new Map<string, AggNode>();
    const edgeMap = new Map<string, AggEdge>();

    const addNode = (tier: AggTier, label: string, calls: number, errors: number): AggNode => {
      const id = nid(tier, label);
      let n = nodeMap.get(id);
      if (!n) {
        n = { id, tier, label, calls: 0, errors: 0, errorRatePct: 0 };
        nodeMap.set(id, n);
      }
      n.calls += calls;
      n.errors += errors;
      return n;
    };
    const addEdge = (a: AggNode | undefined, b: AggNode | undefined, calls: number): void => {
      if (!a || !b) return;
      const id = `${a.id}→${b.id}`;
      const e = edgeMap.get(id);
      if (e) e.calls += calls;
      else edgeMap.set(id, { id, source: a.id, target: b.id, calls });
    };

    for (const r of coocRes.data?.records ?? []) {
      const calls = num(r.calls);
      const errors = num(r.errors);
      const svc = r.service ? addNode("service", r.service, calls, errors) : undefined;
      const agent = r.agent ? addNode("agent", r.agent, calls, errors) : undefined;
      const tool = r.tool ? addNode("tool", r.tool, calls, errors) : undefined;
      const model = r.model ? addNode("model", r.model, calls, errors) : undefined;
      const provider = r.provider ? addNode("provider", r.provider, calls, errors) : undefined;
      addEdge(svc, agent, calls);
      if (agent) {
        addEdge(agent, tool, calls);
        addEdge(agent, model, calls);
      } else {
        addEdge(svc, model, calls);
      }
      addEdge(model, provider, calls);
    }

    // Upstream callers → AI service (service resolved by entity id so it maps
    // onto the co-occurrence service node and the graph stays connected).
    for (const r of upstreamRes.data?.records ?? []) {
      const svcName = r.target_id ? idToName.get(r.target_id) : undefined;
      if (!r.upstream || !svcName) continue;
      const up = addNode("upstream", r.upstream, 0, 0);
      const svc = addNode("service", svcName, 0, 0);
      addEdge(up, svc, num(r.n));
    }
    // AI service → downstream dependency.
    for (const r of downstreamRes.data?.records ?? []) {
      const svcName = r.source_id ? idToName.get(r.source_id) : undefined;
      if (!svcName || !r.downstream) continue;
      const svc = addNode("service", svcName, 0, 0);
      const dn = addNode("downstream", r.downstream, 0, 0);
      addEdge(svc, dn, num(r.n));
    }

    // Finalize error rates.
    for (const n of nodeMap.values()) {
      n.errorRatePct = n.calls > 0 ? (n.errors / n.calls) * 100 : 0;
    }

    // Collapse duplicate service+agent bubbles (same display name) into one
    // agent node and re-point edges, before capping/keep-filtering so the caps
    // and problem rings operate on the merged graph.
    const merged = mergeServiceAgentNodes(
      Array.from(nodeMap.values()),
      Array.from(edgeMap.values()),
    );
    // service node id → surviving agent node id, for problem-ring remapping.
    const mergedAgentLabels = new Set(
      merged.nodes.filter((n) => n.tier === "agent").map((n) => n.label),
    );

    // Per-tier cap: keep the top-N by calls in each tier; track totals.
    const tierCounts = Object.fromEntries(
      TIER_ORDER.map((t) => [t, { shown: 0, total: 0 }]),
    ) as Record<AggTier, { shown: number; total: number }>;
    const keep = new Set<string>();
    for (const tier of TIER_ORDER) {
      const inTier = merged.nodes
        .filter((n) => n.tier === tier)
        .sort((a, b) => b.calls - a.calls);
      tierCounts[tier].total = inTier.length;
      const kept = inTier.slice(0, TIER_CAP[tier]);
      tierCounts[tier].shown = kept.length;
      for (const n of kept) keep.add(n.id);
    }

    const nodes = merged.nodes.filter((n) => keep.has(n.id));
    const edges = merged.edges.filter(
      (e) => keep.has(e.source) && keep.has(e.target),
    );
    const maxCalls = nodes.reduce((m, n) => Math.max(m, n.calls), 0);

    // Problem rings: map affected service entity ids → their node ids. When a
    // service was collapsed into an agent, the ring follows to the agent node.
    const affectedNodeIds = new Set<string>();
    for (const r of affectedRes.data?.records ?? []) {
      const name = r.eid ? idToName.get(r.eid) : undefined;
      if (!name) continue;
      const ringId = mergedAgentLabels.has(name)
        ? nid("agent", name)
        : nid("service", name);
      if (keep.has(ringId)) affectedNodeIds.add(ringId);
    }

    const isLoading =
      coocRes.isLoading || idRes.isLoading || upstreamRes.isLoading || downstreamRes.isLoading;

    return {
      nodes,
      edges,
      tierCounts,
      maxCalls,
      affectedNodeIds,
      isLoading,
      isEmpty: !isLoading && nodes.length === 0,
      error: coocRes.error ?? idRes.error ?? undefined,
    };
  }, [
    coocRes.data, coocRes.isLoading, coocRes.error,
    idRes.isLoading, idRes.error,
    upstreamRes.data, upstreamRes.isLoading,
    downstreamRes.data, downstreamRes.isLoading,
    affectedRes.data, idToName,
  ]);
};
