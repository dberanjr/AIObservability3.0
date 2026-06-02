import React, { useMemo, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { ErrorBanner } from "../../components/ErrorState";
import { CallsByCategoryPanel } from "./CallsByCategoryPanel";
import { SidePanels } from "./SidePanels";
import { ToolHealthByZone } from "./ToolHealthByZone";
import { ToolScatterChart } from "./ToolScatterChart";
import { ToolsTable } from "./ToolsTable";
import { ToolsTilesRow } from "./ToolsTilesRow";
import { useTools, type ToolZone } from "./useTools";
import { useTweaks } from "../../tweaks/TweaksContext";

export const ToolsPage = () => {
  const { tools, isLoading, error } = useTools();
  const { pageConfig } = useTweaks();
  const [zone, setZone] = useState<ToolZone | null>(null);

  const filtered = useMemo(
    () => (zone ? tools.filter((t) => t.zone === zone) : tools),
    [tools, zone],
  );

  const strictEmpty =
    pageConfig.toolsMode === "strict" && !isLoading && tools.length === 0;

  return (
    <Flex
      flexDirection="column"
      gap={16}
      style={{ padding: "18px 20px 80px" }}
    >
      {error && <ErrorBanner error={error} />}
      <Flex
        alignItems="center"
        gap={8}
        style={{
          padding: "6px 10px",
          borderRadius: 6,
          background: strictEmpty
            ? "color-mix(in oklab, var(--amber) 10%, var(--surface))"
            : "var(--surface-2)",
          border: strictEmpty
            ? "1px solid color-mix(in oklab, var(--amber) 40%, transparent)"
            : "1px solid var(--border)",
        }}
      >
        <Text style={{ fontSize: 11.5, color: "var(--text-2)" }}>
          Tool definition:{" "}
          <strong>
            {pageConfig.toolsMode === "discovered"
              ? "Discovered (internal function spans)"
              : "Strict (gen_ai.tool.name)"}
          </strong>
          {strictEmpty
            ? " — no spans carry gen_ai.tool.name in this scope. Switch to Discovered in Settings → Page configuration to populate from function spans."
            : " — change in Settings → Page configuration."}
        </Text>
      </Flex>
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
