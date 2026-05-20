import React, { useMemo } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { BarList } from "../../components/charts/BarList";
import type { BarListItem } from "../../components/charts/BarList";
import { fmtTokens } from "../../data/format";
import type { ModelRow } from "../Models/useModels";

export interface TopModelsPanelProps {
  models: ModelRow[];
  isLoading: boolean;
}

const TOP_N = 6;

export const TopModelsPanel = ({ models, isLoading }: TopModelsPanelProps) => {
  const items = useMemo<BarListItem[]>(
    () =>
      [...models]
        .sort(
          (a, b) =>
            b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens),
        )
        .slice(0, TOP_N)
        .map((m) => ({
          key: m.modelKey,
          label: m.model,
          value: m.inputTokens + m.outputTokens,
          displayValue: fmtTokens(m.inputTokens + m.outputTokens),
          secondary: `${m.provider.label} · ${m.requests.toLocaleString()} req`,
        })),
    [models],
  );

  const colorFor = (item: BarListItem) =>
    models.find((m) => m.modelKey === item.key)?.providerColor ?? "var(--blue)";

  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={12}>
        <Flex flexDirection="column" gap={2}>
          <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
            Top models
          </Heading>
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            by token volume (input + output)
          </Text>
        </Flex>
        {isLoading && items.length === 0 ? (
          <Flex flexDirection="column" gap={8}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} style={{ height: 32, borderRadius: 6 }} />
            ))}
          </Flex>
        ) : items.length === 0 ? (
          <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
            No model data in the current scope.
          </Text>
        ) : (
          <BarList items={items} color={colorFor} />
        )}
      </Flex>
    </Surface>
  );
};
