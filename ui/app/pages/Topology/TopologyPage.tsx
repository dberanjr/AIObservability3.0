import React, { useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { ErrorBanner } from "../../components/ErrorState";
import { TopologyGraph } from "./TopologyGraph";
import { TopologySidebar } from "./TopologySidebar";
import { TopologyTilesRow } from "./TopologyTilesRow";
import { useTopology, type Tier } from "./useTopology";

export const TopologyPage = () => {
  const graph = useTopology();
  const [hiddenTiers, setHiddenTiers] = useState<Set<Tier>>(() => new Set());
  const [showCriticalPath, setShowCriticalPath] = useState(false);

  const toggleTier = (tier: Tier) => {
    setHiddenTiers((current) => {
      const next = new Set(current);
      if (next.has(tier)) next.delete(tier);
      else next.add(tier);
      return next;
    });
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "230px minmax(0, 1fr)",
        gap: 16,
        padding: "18px 20px 80px",
        alignItems: "start",
      }}
    >
      <TopologySidebar
        graph={graph}
        hiddenTiers={hiddenTiers}
        onToggleTier={toggleTier}
        showCriticalPath={showCriticalPath}
        onToggleCriticalPath={setShowCriticalPath}
      />
      <Flex flexDirection="column" gap={16} style={{ minWidth: 0 }}>
        {graph.error && <ErrorBanner error={graph.error} />}
        <TopologyTilesRow graph={graph} hiddenTiers={hiddenTiers} />
        <TopologyGraph
          graph={graph}
          hiddenTiers={hiddenTiers}
          showCriticalPath={showCriticalPath}
        />
      </Flex>
    </div>
  );
};
