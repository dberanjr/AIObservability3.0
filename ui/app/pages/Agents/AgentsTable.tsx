import React, { useState } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import {
  ChevronDownIcon,
  ChevronRightIcon,
} from "@dynatrace/strato-icons";
import { fmtCount, fmtMs, fmtPercent, fmtUSD } from "../../data/format";
import {
  agentHealthScore,
  type AgentHealthStatus,
} from "../../components/SLAConfig/agentHealthScore";
import { useSLA } from "../../components/SLAConfig/SLAContext";
import { useTweaks } from "../../tweaks/TweaksContext";
import { FilterTrigger } from "../../components/FilterTrigger";
import { StageBreakdownBar } from "./StageBreakdownBar";
import type { AgentRow } from "./useAgents";

const STATUS_COLOR: Record<AgentHealthStatus, string> = {
  healthy: "var(--green-2)",
  warning: "var(--amber)",
  breached: "var(--red)",
};

const STATUS_LABEL: Record<AgentHealthStatus, string> = {
  healthy: "Healthy",
  warning: "Warning",
  breached: "Breached",
};

const SLOW_ROW_P90_MS = 5000;

const HeaderCell = ({
  children,
  width,
  align,
}: {
  children: React.ReactNode;
  width?: number;
  align?: "left" | "right";
}) => (
  <div
    style={{
      flex: width ? "0 0 auto" : 1,
      width,
      textAlign: align,
      fontSize: 10.5,
      fontWeight: 600,
      letterSpacing: "0.05em",
      textTransform: "uppercase",
      color: "var(--text-3)",
      padding: "8px 6px",
    }}
  >
    {children}
  </div>
);

const Cell = ({
  children,
  width,
  align,
  mono,
  color,
  style,
}: {
  children: React.ReactNode;
  width?: number;
  align?: "left" | "right";
  mono?: boolean;
  color?: string;
  style?: React.CSSProperties;
}) => (
  <div
    style={{
      flex: width ? "0 0 auto" : 1,
      width,
      minWidth: 0,
      textAlign: align,
      padding: "8px 6px",
      fontSize: 12.5,
      color: color ?? "var(--text)",
      fontFamily: mono ? "var(--mono, monospace)" : undefined,
      fontVariantNumeric: mono ? "tabular-nums" : undefined,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      ...style,
    }}
  >
    {children}
  </div>
);

const TTFTValue = ({ value }: { value: number | null }) =>
  value == null ? (
    <Text
      style={{
        fontFamily: "var(--mono, monospace)",
        fontSize: 12.5,
        color: "var(--text-4)",
      }}
      title="Requires gen_ai.usage.time_to_first_token"
    >
      —
    </Text>
  ) : (
    <Text
      style={{
        fontFamily: "var(--mono, monospace)",
        fontSize: 12.5,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {fmtMs(value)}
    </Text>
  );

const ExpandedDetail = ({ row }: { row: AgentRow }) => (
  <Flex
    flexDirection="column"
    gap={8}
    style={{
      padding: "12px 16px 16px",
      background: "var(--surface-2)",
      borderTop: "1px solid var(--border)",
    }}
  >
    <Flex justifyContent="space-between" gap={12} style={{ flexWrap: "wrap" }}>
      <Flex flexDirection="column" gap={4} style={{ minWidth: 220 }}>
        <Text
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--text-3)",
          }}
        >
          Stage breakdown (estimated ms)
        </Text>
        <StageBreakdownBar stage={row.stage} height={10} showLegend />
        <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
          Approximated from child-span counts. Exact parent-child decomposition
          arrives with the topology session (Session 10).
        </Text>
      </Flex>
      <Flex flexDirection="column" gap={4} style={{ minWidth: 180 }}>
        <Text
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--text-3)",
          }}
        >
          Latency percentiles
        </Text>
        <Text style={{ fontSize: 12.5 }}>P50 {fmtMs(row.p50Ms)}</Text>
        <Text style={{ fontSize: 12.5 }}>P90 {fmtMs(row.p90Ms)}</Text>
        <Text style={{ fontSize: 12.5 }}>P99 {fmtMs(row.p99Ms)}</Text>
        <Text style={{ fontSize: 12.5 }}>Avg {fmtMs(row.avgMs)}</Text>
      </Flex>
      <Flex flexDirection="column" gap={4} style={{ minWidth: 200 }}>
        <Text
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--text-3)",
          }}
        >
          Cost
        </Text>
        <Text style={{ fontSize: 12.5 }}>
          Input tokens {fmtCount(row.inputTokens)}
        </Text>
        <Text style={{ fontSize: 12.5 }}>
          Output tokens {fmtCount(row.outputTokens)}
        </Text>
        <Text style={{ fontSize: 12.5 }}>
          Cost / invocation {fmtUSD(row.costPerInvocation)}
        </Text>
        <Text style={{ fontSize: 12.5 }}>
          Total cost {fmtUSD(row.cost)} ({row.models.join(", ") || "model unknown"})
        </Text>
      </Flex>
    </Flex>
  </Flex>
);

export interface AgentsTableProps {
  rows: AgentRow[];
  isLoading: boolean;
}

export const AgentsTable = ({ rows, isLoading }: AgentsTableProps) => {
  const { thresholds, hasActive } = useSLA();
  const { pageConfig } = useTweaks();
  const showTtft = pageConfig.agentsShowTtft;
  const [expanded, setExpanded] = useState<string | null>(null);

  const toggle = (id: string) =>
    setExpanded((current) => (current === id ? null : id));

  return (
    <Surface elevation="raised" padding={0}>
      <Flex flexDirection="column" gap={0}>
        <Flex
          alignItems="center"
          justifyContent="space-between"
          style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}
        >
          <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
            Agents
          </Heading>
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            {rows.length} {rows.length === 1 ? "agent" : "agents"}
          </Text>
        </Flex>

        <Flex
          alignItems="center"
          style={{
            padding: "0 10px",
            background: "var(--surface)",
          }}
        >
          <HeaderCell width={24}>{""}</HeaderCell>
          <HeaderCell>Agent</HeaderCell>
          <HeaderCell width={140}>Service</HeaderCell>
          <HeaderCell width={80} align="right">Inv</HeaderCell>
          <HeaderCell width={80} align="right">P90</HeaderCell>
          <HeaderCell width={80} align="right">P99</HeaderCell>
          {showTtft && (
            <HeaderCell width={80} align="right">TTFT</HeaderCell>
          )}
          <HeaderCell width={70} align="right">Err</HeaderCell>
          <HeaderCell width={100} align="right">$/inv</HeaderCell>
          <HeaderCell width={140}>Stages</HeaderCell>
          {hasActive && <HeaderCell width={100}>SLA health</HeaderCell>}
        </Flex>

        {isLoading && rows.length === 0 ? (
          <Flex flexDirection="column" gap={4} style={{ padding: 12 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} style={{ height: 36 }} />
            ))}
          </Flex>
        ) : rows.length === 0 ? (
          <Flex style={{ padding: "32px 16px" }}>
            <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
              No agents match the current view.
            </Text>
          </Flex>
        ) : (
          rows.map((r) => {
            const id = `${r.serviceId}-${r.agent}`;
            const isExpanded = expanded === id;
            const slow = r.p90Ms > SLOW_ROW_P90_MS;
            const health = hasActive
              ? agentHealthScore(
                  {
                    p90Ms: r.p90Ms,
                    p99Ms: r.p99Ms,
                    errorRatePct: r.errorRatePct,
                    costPerInvocation: r.costPerInvocation,
                  },
                  thresholds,
                )
              : null;
            return (
              <React.Fragment key={id}>
                <div
                  role="row"
                  tabIndex={0}
                  onClick={() => toggle(id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggle(id);
                    }
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "0 10px",
                    borderTop: "1px solid var(--border)",
                    cursor: "pointer",
                    background: slow
                      ? "color-mix(in oklab, var(--amber) 6%, transparent)"
                      : undefined,
                  }}
                >
                  <Cell width={24}>
                    {isExpanded ? (
                      <ChevronDownIcon size={14} style={{ color: "var(--text-3)" }} />
                    ) : (
                      <ChevronRightIcon size={14} style={{ color: "var(--text-3)" }} />
                    )}
                  </Cell>
                  <Cell mono>
                    <FilterTrigger
                      attribute="gen_ai.agent.name"
                      value={r.agent}
                      label="agent"
                    >
                      {r.agent}
                    </FilterTrigger>
                  </Cell>
                  <Cell width={140} mono color="var(--text-2)">
                    {r.service ? (
                      <FilterTrigger
                        attribute="service.name"
                        value={r.service}
                        label="service"
                      >
                        {r.service}
                      </FilterTrigger>
                    ) : (
                      r.service
                    )}
                  </Cell>
                  <Cell width={80} align="right" mono>
                    {fmtCount(r.invocations)}
                  </Cell>
                  <Cell
                    width={80}
                    align="right"
                    mono
                    color={slow ? "var(--amber)" : undefined}
                  >
                    {fmtMs(r.p90Ms)}
                  </Cell>
                  <Cell width={80} align="right" mono>
                    {fmtMs(r.p99Ms)}
                  </Cell>
                  {showTtft && (
                    <Cell width={80} align="right">
                      <TTFTValue value={r.ttftMs} />
                    </Cell>
                  )}
                  <Cell
                    width={70}
                    align="right"
                    mono
                    color={r.errorRatePct > 5 ? "var(--red)" : undefined}
                  >
                    {r.errors > 0 ? fmtPercent(r.errorRatePct) : "0%"}
                  </Cell>
                  <Cell width={100} align="right" mono>
                    {r.costAttributed ? (
                      fmtUSD(r.costPerInvocation)
                    ) : (
                      <Text
                        style={{
                          fontFamily: "var(--mono, monospace)",
                          fontSize: 12.5,
                          color: "var(--text-4)",
                        }}
                        title="LLM tokens for this agent run through the central proxy in a separate trace and can't be attributed. Cost is shown where an LLM span shares the agent's trace."
                      >
                        —
                      </Text>
                    )}
                  </Cell>
                  <Cell width={140} style={{ overflow: "visible" }}>
                    <StageBreakdownBar stage={r.stage} />
                  </Cell>
                  {hasActive && health && (
                    <Cell width={100}>
                      <Flex alignItems="center" gap={6}>
                        <span
                          aria-hidden
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: STATUS_COLOR[health.status],
                            flex: "0 0 auto",
                          }}
                        />
                        <Text
                          style={{
                            fontSize: 12,
                            fontVariantNumeric: "tabular-nums",
                            color: STATUS_COLOR[health.status],
                          }}
                          title={health.breaches.join("\n")}
                        >
                          {health.score} · {STATUS_LABEL[health.status]}
                        </Text>
                      </Flex>
                    </Cell>
                  )}
                </div>
                {isExpanded && <ExpandedDetail row={r} />}
              </React.Fragment>
            );
          })
        )}
      </Flex>
    </Surface>
  );
};
