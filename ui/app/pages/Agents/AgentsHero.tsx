import React, { useMemo, useState } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { ChevronDownIcon, ChevronRightIcon } from "@dynatrace/strato-icons";
import { InfoTooltip } from "../../components/InfoTooltip";
import { BarList } from "../../components/charts/BarList";
import { fmtCount, fmtMs } from "../../data/format";
import { InvocationsChart } from "./InvocationsChart";
import type { AgentRow } from "./useAgents";

export interface AgentsHeroProps {
  agents: AgentRow[];
  isLoading: boolean;
}

export const AgentsHero = ({ agents, isLoading }: AgentsHeroProps) => {
  const [p90Open, setP90Open] = useState(true);
  const topByP90 = useMemo(
    () =>
      agents
        .filter((a) => !a.isOrchestration)
        .sort((a, b) => b.p90Ms - a.p90Ms)
        .slice(0, 25),
    [agents],
  );

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
        gap: 16,
      }}
    >
      <InvocationsChart />

      <Surface elevation="raised" padding={16}>
        <Flex flexDirection="column" gap={8}>
          <Flex flexDirection="column" gap={2}>
            <Flex alignItems="center" gap={6}>
              <button
                type="button"
                onClick={() => setP90Open((v) => !v)}
                aria-expanded={p90Open}
                aria-label={p90Open ? "Collapse P90 latency by agent" : "Expand P90 latency by agent"}
                style={{ all: "unset", cursor: "pointer", display: "inline-flex" }}
              >
                {p90Open ? (
                  <ChevronDownIcon size={16} style={{ color: "var(--text-3)" }} />
                ) : (
                  <ChevronRightIcon size={16} style={{ color: "var(--text-3)" }} />
                )}
              </button>
              <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
                P90 latency by agent
              </Heading>
              <InfoTooltip text="Per-agent P90 latency over the active scope, highest first. Amber bars exceed the 2s slow threshold; red bars cross the 10-minute runaway threshold (likely a stuck or looping agent). Click a bar to filter the page to that agent." />
            </Flex>
            <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
              Sorted by P90 · scroll for more — red bars cross the runaway
              threshold (10 min)
            </Text>
          </Flex>

          {!p90Open ? null : isLoading && topByP90.length === 0 ? (
            <Skeleton style={{ height: 200 }} />
          ) : topByP90.length === 0 ? (
            <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
              No agent data in the current scope.
            </Text>
          ) : (
            <div style={{ maxHeight: 200, overflowY: "auto", paddingRight: 4 }}>
              <BarList
                color={(item) => {
                  if (item.value > 600_000) return "var(--red)";
                  if (item.value > 2000) return "var(--amber)";
                  return "var(--blue)";
                }}
                items={topByP90.map((a) => ({
                  key: a.agent,
                  label: a.agent,
                  value: a.p90Ms,
                  displayValue: fmtMs(a.p90Ms),
                  secondary: `${a.service} · ${fmtCount(a.invocations)} inv`,
                  filter: {
                    attribute: "gen_ai.agent.name",
                    values: [a.agent],
                    label: "agent",
                  },
                }))}
              />
            </div>
          )}
        </Flex>
      </Surface>
    </div>
  );
};
