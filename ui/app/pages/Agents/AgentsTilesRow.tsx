import React, { useState } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { StatTile } from "../../components/StatTile";
import { ChartModal } from "../../components/charts/ChartExpander";
import { fmtCount, fmtMs, fmtPercent, fmtUSDCompact } from "../../data/format";
import { type SemanticStatus } from "../../theme/statusColor";
import { useEditLayout } from "../../layout/EditLayoutContext";
import { CustomizableGrid, type GridTile } from "../Summary/CustomizableGrid";
import { SLOW_P90_MS, HIGH_FREQUENCY_TOOL_THRESHOLD } from "./constants";
import {
  slowTileStatus,
  errorTileStatus,
  loopingTileStatus,
  highFreqTileStatus,
  statusToTone,
} from "./tileStatus";
import { useAgentLoops } from "./useAgentLoops";
import { useHighFrequencyAgentRows } from "./useHighFrequencyAgents";
import { summarizeAgentTtft } from "./ttft";
import {
  CostBody,
  ErrorRateBody,
  HighFrequencyBody,
  InvocationsBody,
  LoopingAgentsBody,
  SlowAgentsBody,
  TotalAgentsBody,
  TtftBody,
} from "./tilePopups";
import type { AgentRow } from "./useAgents";

type TileId =
  | "total"
  | "invocations"
  | "slow"
  | "error"
  | "cost"
  | "looping"
  | "highfreq"
  | "ttft";

// Wrap responsively instead of forcing 7 equal columns, so labels don't wrap to
// two lines and values stay legible on narrower viewports.
const GRID: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: "var(--d-gap)",
};

const MODAL_META: Record<TileId, { title: string; subtitle: string }> = {
  total: { title: "Total agents", subtitle: "Every agent active in the current scope, with its service, volume and cost" },
  invocations: { title: "Invocations", subtitle: "Agent invocation volume over time, with forecast and brush-to-zoom" },
  slow: { title: "Slow agents", subtitle: `Agents whose P90 latency exceeds ${SLOW_P90_MS / 1000}s in the current scope` },
  error: { title: "Error rate", subtitle: "Fleet error rate and the agents contributing the most failures" },
  cost: { title: "Estimated cost", subtitle: "Attributed LLM cost by agent and model in the current scope" },
  looping: { title: "Looping agents", subtitle: "Heuristic agent-loop detection with LangGraph node-execution trend" },
  highfreq: { title: "N+1 tool loops", subtitle: `Agents that called a single tool more than ${HIGH_FREQUENCY_TOOL_THRESHOLD}× within a run (possible N+1 / tool loop)` },
  ttft: { title: "Time to first token", subtitle: "Streamed-response responsiveness (gen_ai.response.ttft)" },
};

export interface AgentsTilesRowProps {
  agents: AgentRow[];
  isLoading: boolean;
}

export const AgentsTilesRow = ({ agents, isLoading }: AgentsTilesRowProps) => {
  const [open, setOpen] = useState<TileId | null>(null);
  const loops = useAgentLoops();
  const highFreq = useHighFrequencyAgentRows();
  // Layout customization is opt-in and driven by the global header "Customize"
  // toggle, so the KPI row can be reordered / resized from any page (SUM-4).
  const { editLayout } = useEditLayout();

  if (isLoading && agents.length === 0) {
    return (
      <div style={GRID}>
        {Array.from({ length: 7 }).map((_, i) => (
          <Surface key={i} elevation="raised" padding={12}>
            <Flex flexDirection="column" gap={6}>
              <Skeleton style={{ height: 12, width: "60%" }} />
              <Skeleton style={{ height: 22, width: "80%" }} />
            </Flex>
          </Surface>
        ))}
      </div>
    );
  }

  const substantive = agents.filter((a) => !a.isOrchestration);
  const invocations = substantive.reduce((acc, a) => acc + a.invocations, 0);
  const slow = substantive.filter((a) => a.p90Ms > SLOW_P90_MS).length;
  const errors = substantive.reduce((acc, a) => acc + a.errors, 0);
  const errorRate = invocations > 0 ? (errors / invocations) * 100 : 0;
  const cost = substantive.reduce((acc, a) => acc + a.cost, 0);
  // TTFT is emitted only on streamed responses, so it lands on a subset of
  // agents; summarize their per-agent averages into a single fleet figure.
  const ttft = summarizeAgentTtft(agents);

  // Severity for the color-bearing tiles, classified once so the tile color
  // (tone → var(--status-*)) and StatTile's non-color cue glyph always agree.
  const slowStatus = slowTileStatus(slow);
  const errStatus = errorTileStatus(errorRate);
  const loopStatus: SemanticStatus = loops.isLoading
    ? "neutral"
    : loopingTileStatus(loops.loopingCount);
  const highFreqCount = highFreq.rows.length;
  const highFreqStatus: SemanticStatus = highFreq.isLoading
    ? "neutral"
    : highFreqTileStatus(highFreqCount);

  const renderBody = () => {
    switch (open) {
      case "total":
        return <TotalAgentsBody agents={agents} />;
      case "invocations":
        return <InvocationsBody />;
      case "slow":
        return <SlowAgentsBody agents={agents} />;
      case "error":
        return <ErrorRateBody agents={agents} />;
      case "cost":
        return <CostBody agents={agents} />;
      case "looping":
        return <LoopingAgentsBody />;
      case "highfreq":
        return <HighFrequencyBody />;
      case "ttft":
        return <TtftBody agents={agents} onApplied={() => setOpen(null)} />;
      default:
        return null;
    }
  };

  // Each KPI is a GridTile so the shared CustomizableGrid owns placement
  // (drag-to-reorder, drag-a-corner to resize) when the global "Customize"
  // toggle is on. Tiles don't partition a 12-col grid evenly, so every tile
  // gets an equal defaultColSpan of 2 (≈1/6 width) — this keeps them
  // equal-width and lets the row wrap, matching its wrap-friendly design
  // intent. TTFT only earns a full tile when it's actually emitted (below);
  // otherwise it collapses to a small "not instrumented" chip and its slot is
  // spent on the N+1 tool-loop signal instead.
  const tiles: GridTile[] = [
    {
      id: "total",
      defaultColSpan: 2,
      node: (
        <StatTile
          label="Total agents"
          value={fmtCount(substantive.length)}
          sub={
            agents.length > substantive.length
              ? `+${agents.length - substantive.length} orchestration`
              : undefined
          }
          info="Distinct agents (gen_ai.agent.name) active in the current scope, excluding framework orchestration/runtime nodes. Click for the full agent roster."
          onActivate={() => setOpen("total")}
          actionLabel="Open Total agents details"
        />
      ),
    },
    {
      id: "invocations",
      defaultColSpan: 2,
      node: (
        <StatTile
          label="Invocations"
          value={fmtCount(invocations)}
          info="Total agent invocations (distinct traces / runs) in the current scope. Click for the time series with forecast and brush-to-zoom."
          onActivate={() => setOpen("invocations")}
          actionLabel="Open Invocations details"
        />
      ),
    },
    {
      id: "slow",
      defaultColSpan: 2,
      node: (
        <StatTile
          label="Slow agents"
          value={fmtCount(slow)}
          sub={`P90 > ${SLOW_P90_MS / 1000}s`}
          tone={statusToTone(slowStatus)}
          cue
          info={`Agents whose P90 latency exceeds ${SLOW_P90_MS / 1000}s. Click for the ranked list.`}
          onActivate={() => setOpen("slow")}
          actionLabel="Open Slow agents details"
        />
      ),
    },
    {
      id: "error",
      defaultColSpan: 2,
      node: (
        <StatTile
          label="Error rate"
          value={fmtPercent(errorRate)}
          tone={statusToTone(errStatus)}
          cue
          info="Share of agent invocations that failed, including logical failures (refusals / content-filter) where emitted. Click for the per-agent breakdown."
          onActivate={() => setOpen("error")}
          actionLabel="Open Error rate details"
        />
      ),
    },
    {
      id: "cost",
      defaultColSpan: 2,
      node: (
        <StatTile
          label="Est. cost"
          value={fmtUSDCompact(cost)}
          sub="this scope"
          info="Attributed LLM cost for these agents (where token usage shares the agent's trace). Often partial because LLM calls run on the central proxy. Exact fleet cost lives on the Models / FinOps tab. Click for the breakdown."
          onActivate={() => setOpen("cost")}
          actionLabel="Open Estimated cost details"
        />
      ),
    },
    {
      id: "looping",
      defaultColSpan: 2,
      node: (
        <StatTile
          label="Looping agents"
          value={loops.isLoading ? "…" : fmtCount(loops.loopingCount)}
          sub="with detected loops"
          tone={statusToTone(loopStatus)}
          cue
          info="Agents with at least one run flagged as looping by the revisit-ratio / step-depth heuristic. Click for the full loop table and LangGraph activity trend."
          onActivate={() => setOpen("looping")}
          actionLabel="Open Looping agents details"
        />
      ),
    },
    {
      id: "highfreq",
      defaultColSpan: 2,
      node: (
        <StatTile
          label="N+1 tool loops"
          value={highFreq.isLoading ? "…" : fmtCount(highFreqCount)}
          sub="agents · repeated tool"
          tone={statusToTone(highFreqStatus)}
          cue
          info={`Agents that called a single tool more than ${HIGH_FREQUENCY_TOOL_THRESHOLD}× within a run — the agent analogue of an N+1 query (retry storm / un-terminated tool loop). Click for the flagged agents and their busiest-tool counts.`}
          onActivate={() => setOpen("highfreq")}
          actionLabel="Open N+1 tool loops details"
        />
      ),
    },
  ];

  // TTFT earns a full tile only when it's actually emitted; when it's blank
  // everywhere (the common case on these tenants) it demotes to the small chip
  // rendered under the grid, so prime KPI real estate isn't spent on a
  // permanent "—".
  if (ttft) {
    tiles.push({
      id: "ttft",
      defaultColSpan: 2,
      node: (
        <StatTile
          label="TTFT"
          value={fmtMs(ttft.medianMs)}
          sub={`median · ${ttft.agentsWithTtft} agent${ttft.agentsWithTtft === 1 ? "" : "s"}`}
          info="Median time-to-first-token across agents that emit it (gen_ai.response.ttft on streamed responses). Click for the P50/P90 breakdown and per-agent distribution."
          onActivate={() => setOpen("ttft")}
          actionLabel="Open Time to first token details"
        />
      ),
    });
  }

  return (
    <>
      <CustomizableGrid
        storageKey="agents-kpis"
        columns={12}
        tiles={tiles}
        editable={editLayout}
      />

      {/* TTFT demoted to a small chip when nothing emits it — dashed + dimmed,
          still one click to the full instrumentation guidance / example view. */}
      {!ttft && (
        <Flex style={{ marginTop: 8 }}>
          <button
            type="button"
            onClick={() => setOpen("ttft")}
            title="Time to first token — not emitted by any agent in this scope (gen_ai.response.ttft). Click for instrumentation guidance and an example view."
            style={{
              all: "unset",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px dashed var(--border)",
              background: "var(--surface-2)",
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                color: "var(--text-3)",
              }}
            >
              TTFT
            </Text>
            <Text style={{ fontSize: 11.5, color: "var(--text-4)" }}>
              not instrumented · gen_ai.response.ttft
            </Text>
          </button>
        </Flex>
      )}

      <ChartModal
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open ? MODAL_META[open].title : ""}
        subtitle={open ? MODAL_META[open].subtitle : undefined}
      >
        {renderBody()}
      </ChartModal>
    </>
  );
};
