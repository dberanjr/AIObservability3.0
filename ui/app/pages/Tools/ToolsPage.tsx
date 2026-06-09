import React, { useMemo, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { ErrorBanner } from "../../components/ErrorState";
import { DataGapNote } from "../../components/DataGapNote";
import { CallsByCategoryPanel } from "./CallsByCategoryPanel";
import { SidePanels } from "./SidePanels";
import { ToolHealthByZone } from "./ToolHealthByZone";
import { ToolScatterChart } from "./ToolScatterChart";
import { ToolsTable } from "./ToolsTable";
import { ToolsTilesRow } from "./ToolsTilesRow";
import { ToolDetailModal } from "./ToolDetailModal";
import { useTools, type Tool, type ToolZone } from "./useTools";
import { useTweaks } from "../../tweaks/TweaksContext";
import { usePersistedState } from "../../state/usePersistedState";

export const ToolsPage = () => {
  const { tools, isLoading, error } = useTools();
  const { pageConfig } = useTweaks();
  const [zone, setZone] = useState<ToolZone | null>(null);
  const [detailTool, setDetailTool] = useState<Tool | null>(null);
  // Compute-family tools (predict/generate/graph/…) usually dwarf every other
  // category and flatten the visualization, so they're hidden by default.
  const [includeCompute, setIncludeCompute] = usePersistedState<boolean>(
    "ai-obs.tools.include-compute",
    false,
  );

  const computeCount = useMemo(
    () => tools.filter((t) => t.category === "Compute").length,
    [tools],
  );

  // Compute filter first (category), then the zone drill filter.
  const baseTools = useMemo(
    () => (includeCompute ? tools : tools.filter((t) => t.category !== "Compute")),
    [tools, includeCompute],
  );
  const filtered = useMemo(
    () => (zone ? baseTools.filter((t) => t.zone === zone) : baseTools),
    [baseTools, zone],
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

      <DataGapNote
        tone="warn"
        variant="banner"
        message="Per-tool token & cost and native MCP analytics (method, session, server, error flag) are unavailable in this scope — these spans don't carry MCP semantic-convention attributes, and token usage lives on separate LLM proxy spans."
        attributes={["mcp.method.name", "mcp.server.name", "mcp.is_error", "gen_ai.tool.name", "gen_ai.tool.call.id"]}
        bestPractice="Emit OpenTelemetry MCP attributes (mcp.*) on MCP client/server spans and gen_ai.tool.* on tool-call spans, and propagate trace context so a tool span shares its trace with the LLM spans it triggers. Then per-tool cost, error rate, and session stability become directly queryable."
        href="https://opentelemetry.io/docs/specs/semconv/registry/attributes/mcp/"
        hrefLabel="OTel MCP spec"
      />

      {computeCount > 0 && (
        <Flex alignItems="center" gap={8} justifyContent="flex-end">
          <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
            Compute calls ({computeCount}) skew volume —
          </Text>
          <button
            type="button"
            onClick={() => setIncludeCompute(!includeCompute)}
            aria-pressed={includeCompute}
            style={{
              all: "unset",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 600,
              padding: "3px 10px",
              borderRadius: 999,
              color: includeCompute ? "var(--blue)" : "var(--text-2)",
              background: includeCompute
                ? "color-mix(in oklab, var(--blue) 14%, transparent)"
                : "var(--surface-3)",
              border: `1px solid ${includeCompute ? "color-mix(in oklab, var(--blue) 40%, transparent)" : "var(--border)"}`,
            }}
          >
            {includeCompute ? "Included" : "Excluded"}
          </button>
        </Flex>
      )}

      <ToolsTilesRow tools={baseTools} isLoading={isLoading} />

      {/* Bubble chart sits directly left of the Tool-health-by-zone quadrant. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.45fr) minmax(0, 1fr)",
          gap: 16,
          alignItems: "start",
        }}
      >
        <ToolScatterChart
          tools={filtered}
          isLoading={isLoading}
          highlightZone={zone}
          onSelectTool={setDetailTool}
        />
        <ToolHealthByZone
          tools={baseTools}
          isLoading={isLoading}
          selectedZone={zone}
          onSelect={setZone}
        />
      </div>

      {/* Calls-by-category takes the bubble chart's former location. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.45fr) minmax(0, 1fr)",
          gap: 16,
          alignItems: "start",
        }}
      >
        <CallsByCategoryPanel tools={baseTools} isLoading={isLoading} />
        <SidePanels tools={filtered} isLoading={isLoading} />
      </div>

      <ToolsTable
        tools={filtered}
        isLoading={isLoading}
        highlightZone={zone}
        onSelectTool={setDetailTool}
      />

      <ToolDetailModal
        tool={detailTool}
        show={detailTool !== null}
        onClose={() => setDetailTool(null)}
      />
    </Flex>
  );
};
