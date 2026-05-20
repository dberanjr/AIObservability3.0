import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { fmtCount, fmtPercent, fmtUSDCompact } from "../../data/format";
import type { AgentRow } from "./useAgents";

interface TileProps {
  label: string;
  value: string;
  sub?: string;
  emphasis?: "default" | "amber" | "red";
}

const COLOR: Record<NonNullable<TileProps["emphasis"]>, string> = {
  default: "var(--text)",
  amber: "var(--amber)",
  red: "var(--red)",
};

const Tile = ({ label, value, sub, emphasis = "default" }: TileProps) => (
  <Surface elevation="raised" padding={12}>
    <Flex flexDirection="column" gap={4}>
      <Text
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: "var(--text-3)",
          minHeight: 28,
          whiteSpace: "normal",
          lineHeight: 1.2,
        }}
      >
        {label}
      </Text>
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
      {sub && <Text style={{ fontSize: 11, color: "var(--text-3)" }}>{sub}</Text>}
    </Flex>
  </Surface>
);

const SLOW_P90_MS = 2000;

export interface AgentsTilesRowProps {
  agents: AgentRow[];
  isLoading: boolean;
}

export const AgentsTilesRow = ({ agents, isLoading }: AgentsTilesRowProps) => {
  if (isLoading && agents.length === 0) {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
          gap: 10,
        }}
      >
        {Array.from({ length: 5 }).map((_, i) => (
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

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
        gap: 10,
      }}
    >
      <Tile
        label="Total agents"
        value={fmtCount(substantive.length)}
        sub={
          agents.length > substantive.length
            ? `+${agents.length - substantive.length} orchestration`
            : undefined
        }
      />
      <Tile label="Invocations" value={fmtCount(invocations)} />
      <Tile
        label="Slow agents"
        value={fmtCount(slow)}
        sub={`P90 > ${SLOW_P90_MS / 1000}s`}
        emphasis={slow > 0 ? "amber" : "default"}
      />
      <Tile
        label="Error rate"
        value={fmtPercent(errorRate)}
        emphasis={errorRate > 5 ? "red" : errorRate > 1 ? "amber" : "default"}
      />
      <Tile label="Est. cost" value={fmtUSDCompact(cost)} sub="this scope" />
    </div>
  );
};
