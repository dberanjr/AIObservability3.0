/**
 * Per-agent call topology (Agents-tab "Topology" sub-view, absorbed from the
 * retired Topology tab). Reuses the EXISTING aggregate-topology renderer scoped
 * to the selected agent, in a fixed-height frame so the whole graph fits
 * without page scroll, with larger nodes/labels (scoped mode). Selecting a node
 * scrolls its detail panel into view and briefly highlights it.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Skeleton } from "@dynatrace/strato-components/content";
import { EmptyState } from "../../components/EmptyState";
import {
  useAggregateTopology,
  type AggNode,
  type AggTier,
} from "../Topology/useAggregateTopology";
import { AggregateTopologyGraph } from "../Topology/AggregateTopologyGraph";
import { TopologyNodePanel } from "../Topology/TopologyNodePanel";

export const AgentTopologySubview = ({
  agentName,
  height = 460,
}: {
  agentName: string;
  height?: number;
}) => {
  const topo = useAggregateTopology(agentName);
  const [selected, setSelected] = useState<AggNode | null>(null);
  const [flash, setFlash] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  // No tier hiding in the scoped view — show the agent's full call graph.
  const hiddenTiers = useMemo(() => new Set<AggTier>(), []);

  // When a node is selected, scroll its detail panel into view and pulse a
  // highlight ring so the user notices it (the panel opens below the fold).
  useEffect(() => {
    if (!selected) return;
    const el = panelRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 1400);
    return () => clearTimeout(t);
  }, [selected]);

  if (topo.isLoading && topo.nodes.length === 0)
    return <Skeleton style={{ height, borderRadius: 10 }} />;

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
      <div style={{ height, width: "100%" }}>
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
          scoped
        />
      </div>
      {selected && (
        <div
          ref={panelRef}
          style={{
            marginTop: 12,
            borderRadius: 12,
            transition: "box-shadow 300ms ease",
            boxShadow: flash
              ? "0 0 0 3px color-mix(in oklab, var(--blue) 60%, transparent)"
              : "0 0 0 0 transparent",
          }}
        >
          <TopologyNodePanel
            node={selected}
            isolated={false}
            onIsolate={() => undefined}
            onClose={() => setSelected(null)}
          />
        </div>
      )}
    </>
  );
};
