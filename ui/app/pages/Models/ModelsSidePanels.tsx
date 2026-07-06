import React, { useMemo, useState } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { BarList } from "../../components/charts/BarList";
import type { BarListItem } from "../../components/charts/BarList";
import { Donut } from "../../components/charts/Donut";
import type { DonutSlice } from "../../components/charts/Donut";
import { fmtCount, fmtUSD } from "../../data/format";
import {
  PROVIDER_COLOR,
  PROVIDER_DISPLAY,
  type ProviderId,
} from "../../detection/attributes";
import type { ModelRow } from "./useModels";
import { ModelDetailModal } from "./ModelDetailModal";
import { EmptyState } from "../../components/EmptyState";

const Panel = ({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) => (
  <Surface elevation="raised" padding={16}>
    <Flex flexDirection="column" gap={12}>
      <Flex flexDirection="column" gap={2}>
        <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
          {title}
        </Heading>
        {sub && (
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>{sub}</Text>
        )}
      </Flex>
      {children}
    </Flex>
  </Surface>
);

export interface ModelsSidePanelsProps {
  models: ModelRow[];
  isLoading: boolean;
}

export const ModelsSidePanels = ({
  models,
  isLoading,
}: ModelsSidePanelsProps) => {
  const [selected, setSelected] = useState<ModelRow | null>(null);
  const topSpenders = useMemo<BarListItem[]>(
    () =>
      [...models]
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 8)
        .map((m) => ({
          key: m.modelKey,
          label: m.model,
          value: m.cost,
          displayValue: fmtUSD(m.cost),
          secondary: `${m.provider.label} · ${m.requests.toLocaleString()} req`,
        })),
    [models],
  );

  const providerShares = useMemo<DonutSlice[]>(() => {
    const counts = new Map<ProviderId, number>();
    let total = 0;
    for (const m of models) {
      counts.set(m.provider.id, (counts.get(m.provider.id) ?? 0) + m.requests);
      total += m.requests;
    }
    void total;
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id, requests]) => ({
        key: id,
        label: PROVIDER_DISPLAY[id],
        value: requests,
        color: PROVIDER_COLOR[id],
      }));
  }, [models]);

  const totalRequests = models.reduce((acc, m) => acc + m.requests, 0);

  return (
    <Flex flexDirection="column" gap={16}>
      <Panel
        title="Top spenders"
        sub="Estimated cost per model in this scope · click for detail"
      >
        {isLoading && topSpenders.length === 0 ? (
          <Flex flexDirection="column" gap={8}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} style={{ height: 32, borderRadius: 6 }} />
            ))}
          </Flex>
        ) : topSpenders.length === 0 ? (
          <EmptyState
            bare
            cause="no-activity"
            title="No priced models in the current scope."
            hint="gen_ai.request.model"
          />
        ) : (
          <BarList
            items={topSpenders}
            color={(item) => {
              const model = models.find((m) => m.modelKey === item.key);
              return model?.providerColor ?? "var(--blue)";
            }}
            onSelect={(item) => {
              const model = models.find((m) => m.modelKey === item.key);
              if (model) setSelected(model);
            }}
          />
        )}
      </Panel>

      <Panel title="Provider mix" sub="by request volume">
        {isLoading && providerShares.length === 0 ? (
          <Skeleton style={{ height: 160 }} />
        ) : providerShares.length === 0 ? (
          <EmptyState
            bare
            cause="no-activity"
            title="No provider data in the current scope."
            hint="gen_ai.provider.name"
          />
        ) : (
          <Donut
            slices={providerShares}
            centerValue={fmtCount(totalRequests)}
            centerLabel="requests"
          />
        )}
      </Panel>
      {selected && (
        <ModelDetailModal model={selected} onClose={() => setSelected(null)} />
      )}
    </Flex>
  );
};
