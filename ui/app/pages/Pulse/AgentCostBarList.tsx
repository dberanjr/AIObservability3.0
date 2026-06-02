import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { BarList } from "../../components/charts/BarList";
import type { BarListItem } from "../../components/charts/BarList";
import { fmtTokens, fmtUSD } from "../../data/format";
import type { UseAgentCostsResult } from "./useAgentCosts";

const TOP_N = 8;

export interface AgentCostBarListProps {
  result: UseAgentCostsResult;
}

export const AgentCostBarList = ({ result }: AgentCostBarListProps) => {
  const items: BarListItem[] = result.rows.slice(0, TOP_N).map((r) => ({
    key: r.agent,
    label: r.agent,
    value: r.cost,
    displayValue: fmtUSD(r.cost),
    secondary: `${fmtTokens(r.tokens)} tokens · ${r.models.join(", ") || "model unknown"}`,
    filter: { attribute: "gen_ai.agent.name", values: [r.agent], label: "agent" },
  }));

  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={12}>
        <Flex alignItems="baseline" justifyContent="space-between">
          <Flex flexDirection="column" gap={2}>
            <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
              Top agents by estimated cost
            </Heading>
            <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
              cost = (input × in_price + output × out_price) per model
            </Text>
          </Flex>
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
    </Surface>
  );
};
