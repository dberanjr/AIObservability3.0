/**
 * Pure graph-model types + node-merge logic for the aggregate topology.
 *
 * These live in their own (React-free, DOM-free) module so they can be
 * unit-tested under the repo's `node` Vitest environment — importing the hook
 * itself pulls in Dynatrace UI components that require a DOM.
 */

export type AggTier =
  | "upstream"
  | "service"
  | "agent"
  | "tool"
  | "model"
  | "provider"
  | "downstream";

export interface AggNode {
  id: string;
  tier: AggTier;
  label: string;
  calls: number;
  errors: number;
  errorRatePct: number;
}

export interface AggEdge {
  id: string;
  source: string;
  target: string;
  calls: number;
}

/** Canonical node id: `${tier}:${label}`. */
export const nid = (tier: AggTier, label: string): string => `${tier}:${label}`;

/**
 * Collapse a service node and an agent node that share a display name into a
 * single agent node, re-pointing edges. Fixes the duplicate blue/purple bubble:
 * OTel gives the AI service and the agent the same `service.name`, so the
 * co-occurrence build emits one `service:<name>` node and one `agent:<name>`
 * node with identical labels.
 *
 * Edges whose endpoint was a removed `service:<name>` node are remapped to the
 * surviving `agent:<name>` node. Any self-edges that result (the old
 * service→agent edge) are dropped, and edges that become identical after
 * remapping are merged with their call counts summed — matching how the hook's
 * `addEdge` aggregates edges.
 */
export const mergeServiceAgentNodes = (
  nodes: AggNode[],
  edges: AggEdge[],
): { nodes: AggNode[]; edges: AggEdge[] } => {
  const agentLabels = new Set(
    nodes.filter((x) => x.tier === "agent").map((x) => x.label),
  );

  // Service node id → surviving agent node id, for every collapsed pair.
  const remap = new Map<string, string>();
  for (const label of agentLabels) {
    remap.set(nid("service", label), nid("agent", label));
  }

  const mergedNodes = nodes.filter(
    (x) => !(x.tier === "service" && agentLabels.has(x.label)),
  );

  const edgeMap = new Map<string, AggEdge>();
  for (const e of edges) {
    const source = remap.get(e.source) ?? e.source;
    const target = remap.get(e.target) ?? e.target;
    if (source === target) continue; // drop self-edge from the collapse
    const id = `${source}→${target}`;
    const existing = edgeMap.get(id);
    if (existing) existing.calls += e.calls;
    else edgeMap.set(id, { id, source, target, calls: e.calls });
  }

  return { nodes: mergedNodes, edges: Array.from(edgeMap.values()) };
};
