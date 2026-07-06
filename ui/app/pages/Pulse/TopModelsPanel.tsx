import React, { useMemo } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Skeleton } from "@dynatrace/strato-components/content";
import { BarList } from "../../components/charts/BarList";
import type { BarListItem } from "../../components/charts/BarList";
import { CollapsibleCard } from "../../components/CollapsibleCard";
import { EmptyState } from "../../components/EmptyState";
import { fmtTokens } from "../../data/format";
import { useModels, type ModelRow } from "../Models/useModels";

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
          filter: {
            attribute: "gen_ai.request.model",
            values: m.rawModels,
            label: "model",
          },
        })),
    [models],
  );

  const colorFor = (item: BarListItem) =>
    models.find((m) => m.modelKey === item.key)?.providerColor ?? "var(--blue)";

  return (
      <Flex flexDirection="column" gap={12} style={{ padding: 16 }}>
        {isLoading && items.length === 0 ? (
          <Flex flexDirection="column" gap={8}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} style={{ height: 32, borderRadius: 6 }} />
            ))}
          </Flex>
        ) : items.length === 0 ? (
          <EmptyState
            bare
            cause="no-activity"
            title="No model data in the current scope."
            hint="gen_ai.request.model"
          />
        ) : (
          <BarList items={items} color={colorFor} />
        )}
      </Flex>
  );
};

/**
 * Pulse-local self-fetching wrapper: calls useModels() and renders the
 * presentational TopModelsPanel inside a CollapsibleCard, so the query only
 * runs while the section is expanded.
 */
export const TopModelsCard = () => {
  const { models, isLoading } = useModels();
  return (
    <CollapsibleCard
      title="Top models"
      subtitle="by token volume (input + output)"
      defaultOpen
    >
      <TopModelsPanel models={models} isLoading={isLoading} />
    </CollapsibleCard>
  );
};
