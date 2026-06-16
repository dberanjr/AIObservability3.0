import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { BarList } from "../../components/charts/BarList";
import type { BarListItem } from "../../components/charts/BarList";
import { CollapsibleCard } from "../../components/CollapsibleCard";
import { fmtTokens, fmtUSD } from "../../data/format";
import { useAgentCosts } from "./useAgentCosts";

const TOP_N = 8;

const AgentCostBody = () => {
  const result = useAgentCosts();
  const items: BarListItem[] = result.rows.slice(0, TOP_N).map((r) => ({
    key: r.agent,
    label: r.agent,
    value: r.cost,
    displayValue: fmtUSD(r.cost),
    secondary: `${fmtTokens(r.tokens)} tokens · ${r.models.join(", ") || "model unknown"}`,
    filter: { attribute: "gen_ai.agent.name", values: [r.agent], label: "agent" },
  }));

  return (
      <Flex flexDirection="column" gap={12} style={{ padding: 16 }}>
        <Flex justifyContent="flex-end">
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            Total {fmtUSD(result.totalCost)}
          </Text>
        </Flex>
        {result.isLoading ? (
          <Flex flexDirection="column" gap={8}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} style={{ height: 32, borderRadius: 6 }} />
            ))}
          </Flex>
        ) : items.length === 0 ? (
          <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
            No agent spans with usage attributes in the current scope.
          </Text>
        ) : (
          <BarList items={items} color="var(--purple)" />
        )}
      </Flex>
  );
};

export const AgentCostBarList = () => (
  <CollapsibleCard
    title="Top agents by estimated cost"
    subtitle="cost = (input × in_price + output × out_price) per model"
    defaultOpen
  >
    <AgentCostBody />
  </CollapsibleCard>
);
