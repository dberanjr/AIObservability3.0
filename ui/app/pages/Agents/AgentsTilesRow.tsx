import React, { useState } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { InfoTooltip } from "../../components/InfoTooltip";
import { ChartModal } from "../../components/charts/ChartExpander";
import { MissingDataHint } from "../../components/displayHints";
import { fmtCount, fmtPercent, fmtUSDCompact } from "../../data/format";
import { useAgentLoops } from "./useAgentLoops";
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
  onClick: () => void;
}

const Tile = ({ label, value, sub, info, emphasis = "default", onClick }: TileProps) => (
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

const SLOW_P90_MS = 2000;

const GRID: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
  gap: 10,
};

const MODAL_META: Record<TileId, { title: string; subtitle: string }> = {
  total: { title: "Total agents", subtitle: "Every agent active in the current scope, with its service, volume and cost" },
  invocations: { title: "Invocations", subtitle: "Agent invocation volume over time, with forecast and brush-to-zoom" },
  slow: { title: "Slow agents", subtitle: `Agents whose P90 latency exceeds ${SLOW_P90_MS / 1000}s in the current scope` },
  error: { title: "Error rate", subtitle: "Fleet error rate and the agents contributing the most failures" },
  cost: { title: "Estimated cost", subtitle: "Attributed LLM cost by agent and model in the current scope" },
  looping: { title: "Looping agents", subtitle: "Heuristic agent-loop detection with LangGraph node-execution trend" },
  ttft: { title: "Time to first token", subtitle: "Streamed-response responsiveness (not currently emitted)" },
};

export interface AgentsTilesRowProps {
  agents: AgentRow[];
  isLoading: boolean;
}

export const AgentsTilesRow = ({ agents, isLoading }: AgentsTilesRowProps) => {
  const [open, setOpen] = useState<TileId | null>(null);
  const loops = useAgentLoops();

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
        return <TtftBody />;
      default:
        return null;
    }
  };

  return (
    <>
      <div style={GRID}>
        <Tile
          label="Total agents"
          value={fmtCount(substantive.length)}
          sub={
            agents.length > substantive.length
              ? `+${agents.length - substantive.length} orchestration`
              : undefined
          }
          info="Distinct agents (gen_ai.agent.name) active in the current scope, excluding framework orchestration/runtime nodes. Click for the full agent roster."
          onClick={() => setOpen("total")}
        />
        <Tile
          label="Invocations"
          value={fmtCount(invocations)}
          info="Total agent invocations (agent spans) in the current scope. Click for the time series with forecast and brush-to-zoom."
          onClick={() => setOpen("invocations")}
        />
        <Tile
          label="Slow agents"
          value={fmtCount(slow)}
          sub={`P90 > ${SLOW_P90_MS / 1000}s`}
          emphasis={slow > 0 ? "amber" : "default"}
          info={`Agents whose P90 latency exceeds ${SLOW_P90_MS / 1000}s. Click for the ranked list.`}
          onClick={() => setOpen("slow")}
        />
        <Tile
          label="Error rate"
          value={fmtPercent(errorRate)}
          emphasis={errorRate > 5 ? "red" : errorRate > 1 ? "amber" : "default"}
          info="Share of agent invocations that failed, including logical failures (refusals / content-filter) where emitted. Click for the per-agent breakdown."
          onClick={() => setOpen("error")}
        />
        <Tile
          label="Est. cost"
          value={fmtUSDCompact(cost)}
          sub="this scope"
          info="Attributed LLM cost for these agents (where token usage shares the agent's trace). Often partial because LLM calls run on the central proxy. Exact fleet cost lives on the Models / FinOps tab. Click for the breakdown."
          onClick={() => setOpen("cost")}
        />
        <Tile
          label="Looping agents"
          value={loops.isLoading ? "…" : fmtCount(loops.loopingCount)}
          sub="with detected loops"
          emphasis={!loops.isLoading && loops.loopingCount > 0 ? "amber" : "default"}
          info="Agents with at least one run flagged as looping by the revisit-ratio / step-depth heuristic. Click for the full loop table and LangGraph activity trend."
          onClick={() => setOpen("looping")}
        />
        <Tile
          label="TTFT"
          value="—"
          sub={<MissingDataHint note="not emitted" attribute="gen_ai.response.ttft" />}
          info="Time to first token — responsiveness of streamed responses. Not emitted by any agent in this scope. Click for instrumentation guidance (and an example view via Tweaks → Show example data)."
          onClick={() => setOpen("ttft")}
        />
      </div>

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
