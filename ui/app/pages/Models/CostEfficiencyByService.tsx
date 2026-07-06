import React, { useMemo } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { BarList } from "../../components/charts/BarList";
import type { BarListItem } from "../../components/charts/BarList";
import { fmtUSD, fmtTokens, fmtCount } from "../../data/format";
import { EmptyState } from "../../components/EmptyState";
import { median } from "./finopsLogic";
import type { ServiceCost } from "./useFinOps";

export interface CostEfficiencyByServiceProps {
  services: ServiceCost[];
  isLoading: boolean;
}

export const CostEfficiencyByService = ({
  services,
  isLoading,
}: CostEfficiencyByServiceProps) => {
  const { items, fleetMedian } = useMemo(() => {
    const priced = services.filter((s) => s.requests > 0 && s.cost > 0);
    // Baseline is the fleet median $/call across ALL priced services, so
    // "expensive" is defined relative to peers rather than an absolute magic
    // constant (which just painted the pre-sorted list red-at-top, green-at-
    // bottom — colour redundant with position).
    const fleetMedian = median(priced.map((s) => s.costPerRequest));
    const items: BarListItem[] = priced
      .sort((a, b) => b.costPerRequest - a.costPerRequest)
      .slice(0, 10)
      .map((s) => ({
        key: s.service,
        label: s.service,
        value: s.costPerRequest,
        displayValue: `${fmtUSD(s.costPerRequest)}/call`,
        secondary: `${fmtTokens(s.tokensPerRequest)} tok/call · ${s.topModel ?? "model unknown"} · ${fmtCount(s.requests)} calls`,
      }));
    return { items, fleetMedian };
  }, [services]);

  const colorFor = (item: BarListItem): string => {
    if (fleetMedian <= 0) return "var(--text-3)";
    const ratio = item.value / fleetMedian;
    if (ratio > 2.5) return "var(--red)";
    if (ratio > 1.5) return "var(--amber)";
    return "var(--text-3)";
  };

  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={12}>
        <Flex flexDirection="column" gap={2}>
          <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
            Cost efficiency by service
          </Heading>
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            $ per LLM call · amber &gt; 1.5× and red &gt; 2.5× the fleet median
            {fleetMedian > 0 ? ` (${fmtUSD(fleetMedian)}/call)` : ""} — only
            genuine outliers are flagged
          </Text>
        </Flex>
        {isLoading && items.length === 0 ? (
          <Flex flexDirection="column" gap={8}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} style={{ height: 32, borderRadius: 6 }} />
            ))}
          </Flex>
        ) : items.length === 0 ? (
          <EmptyState
            bare
            title="No priced services in this scope"
            description="No service in scope has both LLM calls and costable token usage in the current timeframe."
            hint="Models not in data/pricing.ts contribute no cost. Widen the scope or confirm priced models are in use."
          />
        ) : (
          <BarList items={items} color={colorFor} />
        )}
      </Flex>
    </Surface>
  );
};
