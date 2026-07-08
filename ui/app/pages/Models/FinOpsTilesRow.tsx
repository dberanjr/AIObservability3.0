import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { fmtPercent, fmtUSD, fmtUSDCompact } from "../../data/format";
import { StatTile } from "../../components/StatTile";
import type { FinOpsData } from "./useFinOps";
import { CustomizableGrid, type GridTile } from "../Summary/CustomizableGrid";
import { useEditLayout } from "../../layout/EditLayoutContext";

export interface FinOpsTilesRowProps {
  data: FinOpsData;
}

export const FinOpsTilesRow = ({ data }: FinOpsTilesRowProps) => {
  // Layout customization is opt-in and driven by the global header "Customize"
  // toggle, so the KPI row can be reordered / resized from any page.
  const { editLayout } = useEditLayout();

  if (data.isLoading && data.spend7d === 0) {
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

  // scan-6: reflect the ratio the per-day scans ACTUALLY ran at, not a hardcoded
  // "1:100" that lies when the toolbar sampling is heavier than the floor.
  const sampledSub = `1-in-${data.dailyRatio.toLocaleString()} sampled · extrapolated`;

  // Each KPI keeps its content unchanged; the customizable grid owns placement
  // only. Six equal tiles → defaultColSpan 2 of 12 preserves the 6-across row.
  const tiles: GridTile[] = [
    {
      id: "spend24h",
      defaultColSpan: 2,
      node: (
        <StatTile
          label="Spend · 24h"
          value={fmtUSDCompact(data.spend24h)}
          sub={sampledSub}
        />
      ),
    },
    {
      id: "spend7d",
      defaultColSpan: 2,
      node: (
        <StatTile
          label="Spend · 7d"
          value={fmtUSDCompact(data.spend7d)}
          sub={sampledSub}
        />
      ),
    },
    {
      id: "projected30d",
      defaultColSpan: 2,
      node: (
        <StatTile
          label="Projected 30d"
          value={fmtUSDCompact(data.projected30d)}
          sub="linear from 7d run-rate"
          emphasis="amber"
          info="Estimated 30-day spend, projected linearly from the sampled 7-day run-rate (7d spend ÷ 7 × 30)."
        />
      ),
    },
    {
      id: "concentration",
      defaultColSpan: 2,
      node: (
        <StatTile
          label="Concentration"
          value={fmtPercent(data.concentrationPct, 0)}
          sub={data.services[0]?.service ?? undefined}
          emphasis={data.concentrationPct > 50 ? "amber" : "default"}
          info="Share of fleet token volume driven by the single top service (named below) — a cost-concentration / single-point-of-spend signal for the current timeframe."
        />
      ),
    },
    {
      id: "costPerMTok",
      defaultColSpan: 2,
      node: (
        <StatTile
          label="$/1M tokens"
          value={fmtUSD(data.costPerMTok)}
          sub="blended · current timeframe"
          info="Blended cost per 1M tokens across the whole fleet (total cost ÷ total tokens × 1M) for the current timeframe, estimated from data/pricing.ts rates."
        />
      ),
    },
    {
      id: "savings",
      defaultColSpan: 2,
      node: (
        <StatTile
          label="Possible savings"
          value={fmtUSDCompact(data.possibleSavings)}
          sub="within-type $/MTok outliers"
          emphasis="green"
          info="Estimated spend avoided if each expensive service shifted its traffic to the cheapest same-type peer — compares within model type only (never generative vs embedding)."
        />
      ),
    },
  ];

  return (
    <Flex flexDirection="column" gap={8}>
      <CustomizableGrid
        storageKey="finops-kpis"
        columns={12}
        tiles={tiles}
        editable={editLayout}
      />
      <Text style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.5 }}>
        24h / 7d / 30d spend is scanned at a 1-in-{data.dailyRatio.toLocaleString()}{" "}
        sampling floor and extrapolated; concentration and $/1M use the current
        timeframe at the toolbar sampling ratio — totals may differ across the
        two families.
      </Text>
    </Flex>
  );
};
