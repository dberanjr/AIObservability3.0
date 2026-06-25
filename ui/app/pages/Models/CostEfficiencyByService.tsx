import React, { useMemo } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { BarList } from "../../components/charts/BarList";
import type { BarListItem } from "../../components/charts/BarList";
import { fmtUSD, fmtTokens, fmtCount } from "../../data/format";
import type { ServiceCost } from "./useFinOps";

export interface CostEfficiencyByServiceProps {
  services: ServiceCost[];
  isLoading: boolean;
}

export const CostEfficiencyByService = ({
  services,
  isLoading,
}: CostEfficiencyByServiceProps) => {
  const items = useMemo<BarListItem[]>(
    () =>
      services
        .filter((s) => s.requests > 0 && s.cost > 0)
        .sort((a, b) => b.costPerRequest - a.costPerRequest)
        .slice(0, 10)
        .map((s) => ({
          key: s.service,
          label: s.service,
          value: s.costPerRequest,
          displayValue: `${fmtUSD(s.costPerRequest)}/call`,
          secondary: `${fmtTokens(s.tokensPerRequest)} tok/call · ${s.topModel ?? "model unknown"} · ${fmtCount(s.requests)} calls`,
        })),
    [services],
  );

  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={12}>
        <Flex flexDirection="column" gap={2}>
          <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
            Cost efficiency by service
          </Heading>
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            $ per LLM call — normalizes spend by work done; high cost or
            bloated tokens/call are the first FinOps wins
          </Text>
        </Flex>
        {isLoading && items.length === 0 ? (
          <Flex flexDirection="column" gap={8}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} style={{ height: 32, borderRadius: 6 }} />
            ))}
          </Flex>
        ) : items.length === 0 ? (
          <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
            No priced services in the current scope.
          </Text>
        ) : (
          <BarList
            items={items}
            color={(item) =>
              item.value > 0.1
                ? "var(--red)"
                : item.value > 0.02
                  ? "var(--amber)"
                  : "var(--green-2)"
            }
          />
        )}
      </Flex>
    </Surface>
  );
};
