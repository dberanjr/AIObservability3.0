import React, { useMemo, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { ErrorBanner } from "../../components/ErrorState";
import { CallsByCategoryPanel } from "./CallsByCategoryPanel";
import { SidePanels } from "./SidePanels";
import { ToolHealthByZone } from "./ToolHealthByZone";
import { ToolScatterChart } from "./ToolScatterChart";
import { ToolsTable } from "./ToolsTable";
import { ToolsTilesRow } from "./ToolsTilesRow";
import { useTools, type ToolZone } from "./useTools";

export const ToolsPage = () => {
  const { tools, isLoading, error } = useTools();
  const [zone, setZone] = useState<ToolZone | null>(null);

  const filtered = useMemo(
    () => (zone ? tools.filter((t) => t.zone === zone) : tools),
    [tools, zone],
  );

  return (
    <Flex
      flexDirection="column"
      gap={16}
      style={{ padding: "18px 20px 80px" }}
    >
      {error && <ErrorBanner error={error} />}
      <ToolsTilesRow tools={tools} isLoading={isLoading} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)",
          gap: 16,
        }}
      >
        <CallsByCategoryPanel tools={tools} isLoading={isLoading} />
        <ToolHealthByZone
          tools={tools}
          isLoading={isLoading}
          selectedZone={zone}
          onSelect={setZone}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
          gap: 16,
          alignItems: "start",
        }}
      >
        <ToolScatterChart
          tools={filtered}
          isLoading={isLoading}
          highlightZone={zone}
        />
        <SidePanels tools={filtered} isLoading={isLoading} />
      </div>

      <ToolsTable
        tools={filtered}
        isLoading={isLoading}
        highlightZone={zone}
      />
    </Flex>
  );
};
