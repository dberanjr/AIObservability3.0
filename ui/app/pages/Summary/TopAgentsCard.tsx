import React from "react";
import { Skeleton } from "@dynatrace/strato-components/content";
import { BarList, type BarListItem } from "../../components/charts/BarList";
import { fmtCount, fmtUSD, fmtUSDCompact } from "../../data/format";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { SummaryCard } from "./SummaryCard";
import { useAgentCosts } from "../Pulse/useAgentCosts";

/**
 * Top agents by estimated cost (through the cache-aware cost model, via the
 * trace-join in useAgentCosts). Each row is click-to-filter on the agent name.
 * Drills to Agents.
 */
export const TopAgentsCard = () => {
  const { rows, isLoading, error } = useAgentCosts();

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
      ) : error ? (
        <ErrorState bare error={error} />
      ) : items.length === 0 ? (
        <EmptyState
          bare
          title="No attributed agent cost"
          description="No agent spans carried a priced model cost in this scope — needs gen_ai.agent.name plus a priced model on the same trace."
        />
      ) : (
        <BarList items={items} color="var(--blue-purple)" />
      )}
    </SummaryCard>
  );
};
