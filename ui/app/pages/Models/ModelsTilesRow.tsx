import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Skeleton } from "@dynatrace/strato-components/content";
import { fmtCount, fmtTokens, fmtUSD } from "../../data/format";
import { StatTile } from "../../components/StatTile";
import type { ModelRow } from "./useModels";
import { CustomizableGrid, type GridTile } from "../Summary/CustomizableGrid";
import { useEditLayout } from "../../layout/EditLayoutContext";

export interface ModelsTilesRowProps {
  models: ModelRow[];
  isLoading: boolean;
}

export const ModelsTilesRow = ({ models, isLoading }: ModelsTilesRowProps) => {
  // Layout customization is opt-in and driven by the global header "Customize"
  // toggle, so the KPI row can be reordered / resized from any page.
  const { editLayout } = useEditLayout();

  if (isLoading && models.length === 0) {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
          gap: "var(--d-gap, 14px)",
        }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <Surface key={i} elevation="raised" padding={12}>
            <Flex flexDirection="column" gap={6}>
              <Skeleton style={{ height: 12, width: "60%" }} />
              <Skeleton style={{ height: 22, width: "80%" }} />
            </Flex>
          </Surface>
        ))}
      </div>
    );
  }

  const requests = models.reduce((acc, m) => acc + m.requests, 0);
  const tokens = models.reduce(
    (acc, m) => acc + m.inputTokens + m.outputTokens,
    0,
  );
  const providerCount = new Set(models.map((m) => m.provider.id)).size;
  const priced = models.filter((m) => !m.pricingUnknown && m.costPerMTok > 0);
  const cheapest = priced.reduce<ModelRow | null>(
    (best, m) => (best == null || m.costPerMTok < best.costPerMTok ? m : best),
    null,
  );
  const mostExpensive = priced.reduce<ModelRow | null>(
    (best, m) => (best == null || m.costPerMTok > best.costPerMTok ? m : best),
    null,
  );

  // Each KPI keeps its content unchanged; the customizable grid owns placement
  // only. Six equal tiles → defaultColSpan 2 of 12 preserves the 6-across row.
  const tiles: GridTile[] = [
    {
      id: "models",
      defaultColSpan: 2,
      node: <StatTile label="Models" value={fmtCount(models.length)} />,
    },
    {
      id: "providers",
      defaultColSpan: 2,
      node: <StatTile label="Providers" value={fmtCount(providerCount)} />,
    },
    {
      id: "requests",
      defaultColSpan: 2,
      node: <StatTile label="Requests" value={fmtCount(requests)} />,
    },
    {
      id: "tokens",
      defaultColSpan: 2,
      node: <StatTile label="Tokens" value={fmtTokens(tokens)} />,
    },
    {
      id: "cheapest",
      defaultColSpan: 2,
      node: (
        <StatTile
          label="Cheapest / 1M"
          value={cheapest ? fmtUSD(cheapest.costPerMTok) : "—"}
          sub={cheapest?.model}
          emphasis={cheapest ? "green" : "default"}
          info="Lowest blended cost per 1M tokens among priced models in the current scope (named below)."
        />
      ),
    },
    {
      id: "expensive",
      defaultColSpan: 2,
      node: (
        <StatTile
          label="Most expensive / 1M"
          value={mostExpensive ? fmtUSD(mostExpensive.costPerMTok) : "—"}
          sub={mostExpensive?.model}
          emphasis={mostExpensive ? "red" : "default"}
          info="Highest blended cost per 1M tokens among priced models in the current scope (named below)."
        />
      ),
    },
  ];

  return (
    <CustomizableGrid
      storageKey="models-kpis"
      columns={12}
      tiles={tiles}
      editable={editLayout}
    />
  );
};
