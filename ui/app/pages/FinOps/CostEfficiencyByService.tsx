import React, { useMemo } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { BarList } from "../../components/charts/BarList";
import type { BarListItem } from "../../components/charts/BarList";
import { fmtUSD } from "../../data/format";
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
        .filter((s) => s.costPerMTok > 0)
        .sort((a, b) => b.costPerMTok - a.costPerMTok)
        .slice(0, 10)
        .map((s) => ({
          key: s.service,
          label: s.service,
          value: s.costPerMTok,
          displayValue: fmtUSD(s.costPerMTok),
          secondary: `${s.topModel ?? "model unknown"} · ${s.modelCount} ${s.modelCount === 1 ? "model" : "models"}`,
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
            $ per 1M tokens — outliers are the first FinOps wins
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
              item.value > 20
                ? "var(--red)"
                : item.value > 5
                  ? "var(--amber)"
                  : "var(--green-2)"
            }
          />
        )}
      </Flex>
    </Surface>
  );
};
