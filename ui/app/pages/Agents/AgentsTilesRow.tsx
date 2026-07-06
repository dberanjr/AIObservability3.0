import React, { useState } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { InfoTooltip } from "../../components/InfoTooltip";
import { StatTile } from "../../components/StatTile";
import { ChartModal } from "../../components/charts/ChartExpander";
import { MissingDataHint } from "../../components/displayHints";
import { fmtCount, fmtMs, fmtPercent, fmtUSDCompact } from "../../data/format";
import {
  STATUS_CUE,
  statusColor,
  type SemanticStatus,
} from "../../theme/statusColor";
import { useEditLayout } from "../../layout/EditLayoutContext";
import { CustomizableGrid, type GridTile } from "../Summary/CustomizableGrid";
import { SLOW_P90_MS } from "./constants";
import {
  slowTileStatus,
  errorTileStatus,
  loopingTileStatus,
  statusToEmphasis,
} from "./tileStatus";
import { useAgentLoops } from "./useAgentLoops";
import { summarizeAgentTtft } from "./ttft";
import {
  CostBody,
  ErrorRateBody,
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
  | "ttft";

type Emphasis = "default" | "amber" | "red";

const COLOR: Record<Emphasis, string> = {
  default: "var(--text)",
  amber: "var(--amber)",
  red: "var(--red)",
};

interface TileProps {
  label: string;
  value: string;
  sub?: React.ReactNode;
  info: string;
  emphasis?: Emphasis;
  /** Demote a tile whose metric isn't instrumented (dashed, dimmed). */
  muted?: boolean;
  onClick: () => void;
}

// The six plain KPI tiles now use the shared StatTile primitive; this local
// Tile survives only for the TTFT card, whose bespoke "not instrumented"
// treatment (dashed + dimmed) and ReactNode sub (<MissingDataHint>) aren't
// expressible via StatTile's string-only sub / emphasis-only styling.
const Tile = ({ label, value, sub, info, emphasis = "default", muted = false, onClick }: TileProps) => (
  <Surface elevation="raised" padding={0}>
    <button
      type="button"
      onClick={onClick}
      title="Open details"
      style={{
        all: "unset",
        cursor: "pointer",
        display: "block",
        width: "100%",
        boxSizing: "border-box",
        padding: 12,
        borderRadius: "inherit",
        opacity: muted ? 0.72 : undefined,
        border: muted ? "1px dashed var(--border)" : undefined,
      }}
    >
      <Flex flexDirection="column" gap={4}>
        <Flex alignItems="center" gap={4} style={{ minHeight: 28 }}>
          <Text
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "var(--text-3)",
              whiteSpace: "normal",
              lineHeight: 1.2,
            }}
          >
            {label}
          </Text>
          <InfoTooltip text={info} />
        </Flex>
        <Text
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: COLOR[emphasis],
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
          }}
        >
          {value}
        </Text>
        {typeof sub === "string" ? (
          <Text style={{ fontSize: 11, color: "var(--text-3)" }}>{sub}</Text>
        ) : (
          sub ?? null
        )}
      </Flex>
    </button>
  </Surface>
);

// Wrap responsively instead of forcing 7 equal columns, so labels don't wrap to
// two lines and values stay legible on narrower viewports.
const GRID: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 10,
};

// Redundant, non-color severity cue (glyph + word) rendered under a tile's
// value so warning/critical tiles aren't distinguished by color alone. Renders
// nothing for good/neutral/info so a healthy tile stays quiet.
const StatusCue = ({ status }: { status: SemanticStatus }) => {
  if (status !== "warning" && status !== "critical") return null;
  const cue = STATUS_CUE[status];
  return (
    <Flex alignItems="center" gap={4} style={{ color: statusColor(status) }}>
      <span aria-hidden style={{ fontSize: 9, lineHeight: 1 }}>
        {cue.glyph}
      </span>
      <Text
        style={{ fontSize: 10.5, fontWeight: 600, color: statusColor(status) }}
      >
        {cue.label}
      </Text>
    </Flex>
  );
};

const MODAL_META: Record<TileId, { title: string; subtitle: string }> = {
  total: { title: "Total agents", subtitle: "Every agent active in the current scope, with its service, volume and cost" },
  invocations: { title: "Invocations", subtitle: "Agent invocation volume over time, with forecast and brush-to-zoom" },
  slow: { title: "Slow agents", subtitle: `Agents whose P90 latency exceeds ${SLOW_P90_MS / 1000}s in the current scope` },
  error: { title: "Error rate", subtitle: "Fleet error rate and the agents contributing the most failures" },
  cost: { title: "Estimated cost", subtitle: "Attributed LLM cost by agent and model in the current scope" },
  looping: { title: "Looping agents", subtitle: "Heuristic agent-loop detection with LangGraph node-execution trend" },
  ttft: { title: "Time to first token", subtitle: "Streamed-response responsiveness (gen_ai.response.ttft)" },
};

export interface AgentsTilesRowProps {
  agents: AgentRow[];
  isLoading: boolean;
}

export const AgentsTilesRow = ({ agents, isLoading }: AgentsTilesRowProps) => {
  const [open, setOpen] = useState<TileId | null>(null);
  const loops = useAgentLoops();
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
  // (emphasis) and the non-color cue (glyph + word) always agree.
  const slowStatus = slowTileStatus(slow);
  const errStatus = errorTileStatus(errorRate);
  const loopStatus: SemanticStatus = loops.isLoading
    ? "neutral"
    : loopingTileStatus(loops.loopingCount);

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
      case "ttft":
        return <TtftBody agents={agents} onApplied={() => setOpen(null)} />;
      default:
        return null;
    }
  };

  // Each KPI is a GridTile so the shared CustomizableGrid owns placement
  // (drag-to-reorder, drag-a-corner to resize) when the global "Customize"
  // toggle is on. 7 tiles don't partition a 12-col grid evenly, so every tile
  // gets an equal defaultColSpan of 2 (≈1/6 width, closest match to the prior
  // ~1/7 auto-fit width) — this keeps them equal-width and lets the last one
  // wrap, matching the row's existing wrap-friendly design intent.
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
          emphasis={statusToEmphasis(slowStatus)}
          info={`Agents whose P90 latency exceeds ${SLOW_P90_MS / 1000}s. Click for the ranked list.`}
          onActivate={() => setOpen("slow")}
          actionLabel="Open Slow agents details"
        >
          <StatusCue status={slowStatus} />
        </StatTile>
      ),
    },
    {
      id: "error",
      defaultColSpan: 2,
      node: (
        <StatTile
          label="Error rate"
          value={fmtPercent(errorRate)}
          emphasis={statusToEmphasis(errStatus)}
          info="Share of agent invocations that failed, including logical failures (refusals / content-filter) where emitted. Click for the per-agent breakdown."
          onActivate={() => setOpen("error")}
          actionLabel="Open Error rate details"
        >
          <StatusCue status={errStatus} />
        </StatTile>
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
          emphasis={statusToEmphasis(loopStatus)}
          info="Agents with at least one run flagged as looping by the revisit-ratio / step-depth heuristic. Click for the full loop table and LangGraph activity trend."
          onActivate={() => setOpen("looping")}
          actionLabel="Open Looping agents details"
        >
          <StatusCue status={loopStatus} />
        </StatTile>
      ),
    },
    {
      id: "ttft",
      defaultColSpan: 2,
      node: (
        <Tile
          label="TTFT"
          value={ttft ? fmtMs(ttft.medianMs) : "—"}
          muted={!ttft}
          sub={
            ttft ? (
              `median · ${ttft.agentsWithTtft} agent${ttft.agentsWithTtft === 1 ? "" : "s"}`
            ) : (
              <MissingDataHint note="not emitted" attribute="gen_ai.response.ttft" />
            )
          }
          info={
            ttft
              ? "Median time-to-first-token across agents that emit it (gen_ai.response.ttft on streamed responses). Click for the P50/P90 breakdown and per-agent distribution."
              : "Time to first token — responsiveness of streamed responses. Not emitted by any agent in this scope. Click for instrumentation guidance (and an example view via Tweaks → Show example data)."
          }
          onClick={() => setOpen("ttft")}
        />
      ),
    },
  ];

  return (
    <>
      <CustomizableGrid
        storageKey="agents-kpis"
        columns={12}
        tiles={tiles}
        editable={editLayout}
      />

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
