import { describe, expect, it } from "vitest";
import {
  mergeServiceAgentNodes,
  type AggNode,
  type AggEdge,
  type AggTier,
} from "./mergeNodes";

const n = (tier: AggTier, label: string, calls = 1): AggNode => ({
  id: `${tier}:${label}`,
  tier,
  label,
  calls,
  errors: 0,
  errorRatePct: 0,
});

const e = (source: string, target: string, calls = 1): AggEdge => ({
  id: `${source}→${target}`,
  source,
  target,
  calls,
});

describe("mergeServiceAgentNodes", () => {
  it("collapses a service node and agent node that share a name into one agent node", () => {
    const nodes = [n("service", "bos-rfnds"), n("agent", "bos-rfnds")];
    const { nodes: merged } = mergeServiceAgentNodes(nodes, []);
    expect(merged).toHaveLength(1);
    expect(merged[0].tier).toBe("agent");
    expect(merged[0].label).toBe("bos-rfnds");
  });

  it("keeps distinct names separate", () => {
    const nodes = [n("service", "a"), n("agent", "b")];
    const { nodes: merged } = mergeServiceAgentNodes(nodes, []);
    expect(merged).toHaveLength(2);
  });

  it("re-points edges from the removed service node to the surviving agent node", () => {
    const nodes = [
      n("upstream", "caller"),
      n("service", "bos-rfnds"),
      n("agent", "bos-rfnds"),
      n("tool", "search"),
    ];
    const edges = [
      e("upstream:caller", "service:bos-rfnds", 5),
      e("agent:bos-rfnds", "tool:search", 3),
    ];
    const { edges: merged } = mergeServiceAgentNodes(nodes, edges);
    const upstreamEdge = merged.find((x) => x.source === "upstream:caller");
    expect(upstreamEdge?.target).toBe("agent:bos-rfnds");
  });

  it("drops the self-edge created when service→agent collapse onto the same node", () => {
    const nodes = [n("service", "bos-rfnds"), n("agent", "bos-rfnds")];
    const edges = [e("service:bos-rfnds", "agent:bos-rfnds", 7)];
    const { edges: merged } = mergeServiceAgentNodes(nodes, edges);
    expect(merged).toHaveLength(0);
  });

  it("merges duplicate edges that result from remapping, summing call counts", () => {
    const nodes = [
      n("upstream", "caller"),
      n("service", "bos-rfnds"),
      n("agent", "bos-rfnds"),
    ];
    const edges = [
      e("upstream:caller", "service:bos-rfnds", 5),
      e("upstream:caller", "agent:bos-rfnds", 3),
    ];
    const { edges: merged } = mergeServiceAgentNodes(nodes, edges);
    expect(merged).toHaveLength(1);
    expect(merged[0].calls).toBe(8);
    expect(merged[0].target).toBe("agent:bos-rfnds");
  });
});
