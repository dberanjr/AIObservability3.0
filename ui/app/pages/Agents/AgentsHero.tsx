import React, { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { useScope } from "../../scope/ScopeContext";
import { canQueryScope, useResolvedServices } from "../../scope/useResolvedServices";
import { AreaChart } from "../../components/charts/AreaChart";
import { BarList } from "../../components/charts/BarList";
import { fmtCount, fmtMs } from "../../data/format";
import { buildInvocationsSeriesQuery } from "./queries";
import type { AgentRow } from "./useAgents";

interface SeriesRecord {
  invocations?: (number | null)[] | null;
}

const ChartCard = ({
  children,
  title,
  sub,
}: {
  children: React.ReactNode;
  title: string;
  sub?: string;
}) => (
  <Surface elevation="raised" padding={16}>
    <Flex flexDirection="column" gap={8}>
      <Flex flexDirection="column" gap={2}>
        <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
          {title}
        </Heading>
        {sub && (
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>{sub}</Text>
        )}
      </Flex>
      {children}
    </Flex>
  </Surface>
);

export interface AgentsHeroProps {
  agents: AgentRow[];
  isLoading: boolean;
}

const INTERVAL_SEC = 5 * 60;

export const AgentsHero = ({ agents, isLoading }: AgentsHeroProps) => {
  const { scope } = useScope();
  const resolution = useResolvedServices();
  const canQuery = canQueryScope(resolution);
  const series = useScopedDql<SeriesRecord>(
    canQuery
      ? buildInvocationsSeriesQuery(resolution.serviceIds, scope.timeframe, INTERVAL_SEC)
      : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  const seriesValues = useMemo(
    () =>
      (series.data?.records?.[0]?.invocations ?? []).map((v) =>
        typeof v === "number" ? v : 0,
      ),
    [series.data],
  );

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
      <ChartCard
        title="Invocations"
        sub="Total agent invocations over the scope timeframe"
      >
        {series.isLoading ? (
          <Skeleton style={{ height: 200 }} />
        ) : (
          <AreaChart
            height={200}
            formatLeft={(n) => fmtCount(Math.round(n))}
            series={[
              {
                label: "Invocations",
                color: "var(--purple)",
                values: seriesValues,
                axis: "left",
              },
            ]}
          />
        )}
      </ChartCard>

      <ChartCard
        title="P90 latency by agent"
        sub="Sorted by P90 · scroll for more — red bars cross the runaway threshold (10 min)"
      >
        {isLoading && topByP90.length === 0 ? (
          <Skeleton style={{ height: 200 }} />
        ) : topByP90.length === 0 ? (
          <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
            No agent data in the current scope.
          </Text>
        ) : (
          <div
            style={{ maxHeight: 200, overflowY: "auto", paddingRight: 4 }}
          >
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
      </ChartCard>
    </div>
  );
};
