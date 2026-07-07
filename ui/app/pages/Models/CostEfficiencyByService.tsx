import React, { useMemo } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { BarList } from "../../components/charts/BarList";
import type { BarListItem } from "../../components/charts/BarList";
import { fmtUSD, fmtCount } from "../../data/format";
import {
  statusColor,
  STATUS_CUE,
  type SemanticStatus,
} from "../../theme/statusColor";
import { EmptyState } from "../../components/EmptyState";
import { median } from "./finopsLogic";
import type { ServiceCost } from "./useFinOps";

export interface CostEfficiencyByServiceProps {
  services: ServiceCost[];
  isLoading: boolean;
}

/** Classify a service's $/call against the fleet median: critical (red) above
 *  2.5×, warning (amber) above 1.5×, otherwise neutral. Routed through the
 *  shared statusColor so severity is coloured the same as everywhere else. */
const severityFor = (ratio: number): SemanticStatus =>
  ratio > 2.5 ? "critical" : ratio > 1.5 ? "warning" : "neutral";

export const CostEfficiencyByService = ({
  services,
  isLoading,
}: CostEfficiencyByServiceProps) => {
  const { items, fleetMedian, statusByKey } = useMemo(() => {
    const priced = services.filter((s) => s.requests > 0 && s.cost > 0);
    // Baseline is the fleet median $/call across ALL priced services, so
    // "expensive" is defined relative to peers rather than an absolute magic
    // constant (which just painted the pre-sorted list red-at-top, green-at-
    // bottom — colour redundant with position).
    const fleetMedian = median(priced.map((s) => s.costPerRequest));
    const statusByKey = new Map<string, SemanticStatus>();
    const items: BarListItem[] = priced
      .sort((a, b) => b.costPerRequest - a.costPerRequest)
      .slice(0, 10)
      .map((s) => {
        const status: SemanticStatus =
          fleetMedian > 0
            ? severityFor(s.costPerRequest / fleetMedian)
            : "neutral";
        statusByKey.set(s.service, status);
        // Non-color cue: prefix the outlier glyph so severity isn't color-only.
        const cue = status === "neutral" ? "" : `${STATUS_CUE[status].glyph} `;
        return {
          key: s.service,
          label: s.service,
          value: s.costPerRequest,
          displayValue: `${cue}${fmtUSD(s.costPerRequest)}/call`,
          secondary: `${fmtCount(s.tokensPerRequest)} tok/call · ${s.topModel ?? "model unknown"} · ${fmtCount(s.requests)} calls`,
        };
      });
    return { items, fleetMedian, statusByKey };
  }, [services]);

  const colorFor = (item: BarListItem): string =>
    statusColor(statusByKey.get(item.key) ?? "neutral");

  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={12}>
        <Flex flexDirection="column" gap={2}>
          <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
            Cost efficiency by service
          </Heading>
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            $ per LLM call · ▲ amber &gt; 1.5× and ⬤ red &gt; 2.5× the fleet
            median
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
