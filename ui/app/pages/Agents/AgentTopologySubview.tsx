/**
 * Per-agent call topology (Agents-tab "Topology" sub-view, absorbed from the
 * retired Topology tab). Path (b): the EXISTING force-graph renderer is reused
 * unchanged — only its data source (useAggregateTopology) is scoped to the
 * selected agent. No fleet graph here.
 */
import React, { useMemo, useState } from "react";
import { Skeleton } from "@dynatrace/strato-components/content";
import { EmptyState } from "../../components/EmptyState";
import {
  useAggregateTopology,
  type AggNode,
  type AggTier,
} from "../Topology/useAggregateTopology";
import { AggregateTopologyGraph } from "../Topology/AggregateTopologyGraph";
import { TopologyNodePanel } from "../Topology/TopologyNodePanel";

export const AgentTopologySubview = ({ agentName }: { agentName: string }) => {
  const topo = useAggregateTopology(agentName);
  const [selected, setSelected] = useState<AggNode | null>(null);
  // No tier hiding in the scoped view — show the agent's full call graph.
  const hiddenTiers = useMemo(() => new Set<AggTier>(), []);

  if (topo.isLoading && topo.nodes.length === 0)
    return <Skeleton style={{ height: 420, borderRadius: 10 }} />;

  if (topo.nodes.length === 0)
    return (
      <EmptyState
        bare
        title="No call topology for this agent"
        description="No agent/tool/model spans carry this agent's name in the current scope, so there's nothing to graph."
      />
    );

  return (
    <>
      <AggregateTopologyGraph
        nodes={topo.nodes}
        edges={topo.edges}
        maxCalls={topo.maxCalls}
        layout="vertical"
        search=""
        hiddenTiers={hiddenTiers}
        onSelectNode={setSelected}
        selectedId={selected?.id ?? null}
        affectedNodeIds={topo.affectedNodeIds}
      />
      {selected && (
        <TopologyNodePanel
          node={selected}
          isolated={false}
          onIsolate={() => undefined}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
};
