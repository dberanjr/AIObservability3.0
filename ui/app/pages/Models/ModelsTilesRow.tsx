import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { fmtCount, fmtTokens, fmtUSD } from "../../data/format";
import type { ModelRow } from "./useModels";
import { CustomizableGrid, type GridTile } from "../Summary/CustomizableGrid";
import { useEditLayout } from "../../layout/EditLayoutContext";

const Tile = ({
  label,
  value,
  sub,
  emphasis,
}: {
  label: string;
  value: string;
  sub?: string;
  emphasis?: "default" | "green" | "red";
}) => {
  const color =
    emphasis === "green"
      ? "var(--green-2)"
      : emphasis === "red"
        ? "var(--red)"
        : "var(--text)";
  return (
    <Surface elevation="raised" padding={12}>
      <Flex flexDirection="column" gap={4}>
        <Text
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "var(--text-3)",
            minHeight: 28,
            whiteSpace: "normal",
            lineHeight: 1.2,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontSize: 22,
            fontWeight: 600,
            color,
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
          }}
        >
          {value}
        </Text>
        {sub && (
          <Text style={{ fontSize: 11, color: "var(--text-3)" }}>{sub}</Text>
        )}
      </Flex>
    </Surface>
  );
};

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
          gap: 10,
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
      node: <Tile label="Models" value={fmtCount(models.length)} />,
    },
    {
      id: "providers",
      defaultColSpan: 2,
      node: <Tile label="Providers" value={fmtCount(providerCount)} />,
    },
    {
      id: "requests",
      defaultColSpan: 2,
      node: <Tile label="Requests" value={fmtCount(requests)} />,
    },
    {
      id: "tokens",
      defaultColSpan: 2,
      node: <Tile label="Tokens" value={fmtTokens(tokens)} />,
    },
    {
      id: "cheapest",
      defaultColSpan: 2,
      node: (
        <Tile
          label="Cheapest / 1M"
          value={cheapest ? fmtUSD(cheapest.costPerMTok) : "—"}
          sub={cheapest?.model}
          emphasis={cheapest ? "green" : "default"}
        />
      ),
    },
    {
      id: "expensive",
      defaultColSpan: 2,
      node: (
        <Tile
          label="Most expensive / 1M"
          value={mostExpensive ? fmtUSD(mostExpensive.costPerMTok) : "—"}
          sub={mostExpensive?.model}
          emphasis={mostExpensive ? "red" : "default"}
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
