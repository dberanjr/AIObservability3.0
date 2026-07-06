import React from "react";
import { Skeleton } from "@dynatrace/strato-components/content";
import { Text } from "@dynatrace/strato-components/typography";
import { BarList, type BarListItem } from "../../components/charts/BarList";
import { fmtCount, fmtUSD, fmtUSDCompact } from "../../data/format";
import { SummaryCard } from "./SummaryCard";
import { useAgentCosts } from "../Pulse/useAgentCosts";

/**
 * Top agents by estimated cost (through the cache-aware cost model, via the
 * trace-join in useAgentCosts). Each row is click-to-filter on the agent name.
 * Drills to Agents.
 */
export const TopAgentsCard = () => {
  const { rows, isLoading } = useAgentCosts();

  const items: BarListItem[] = rows.slice(0, 5).map((r) => ({
    key: r.agent,
    label: r.agent,
    value: r.cost,
    displayValue: fmtUSDCompact(r.cost),
    secondary: `${fmtCount(r.invocations)} calls · ${
      r.invocations > 0 ? fmtUSD(r.cost / r.invocations) : "—"
    }/call`,
    filter: { attribute: "gen_ai.agent.name", values: [r.agent] },
  }));

  return (
    <SummaryCard title="Top agents by cost" drill={{ label: "Agents", to: "/agents" }}>
      {isLoading && items.length === 0 ? (
        <Skeleton style={{ height: 130, borderRadius: 8 }} />
      ) : items.length === 0 ? (
        <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
          No attributed agent cost in scope.
        </Text>
      ) : (
        <BarList items={items} color="var(--blue-purple)" />
      )}
    </SummaryCard>
  );
};
