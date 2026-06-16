import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { fmtPercent, fmtUSD, fmtUSDCompact } from "../../data/format";
import type { FinOpsData } from "./useFinOps";

const Tile = ({
  label,
  value,
  sub,
  emphasis,
}: {
  label: string;
  value: string;
  sub?: string;
  emphasis?: "default" | "amber" | "green" | "red";
}) => {
  const color =
    emphasis === "amber"
      ? "var(--amber)"
      : emphasis === "green"
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

export interface FinOpsTilesRowProps {
  data: FinOpsData;
}

export const FinOpsTilesRow = ({ data }: FinOpsTilesRowProps) => {
  if (data.isLoading && data.spend7d === 0) {
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

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
        gap: 10,
      }}
    >
      <Tile label="Spend · 24h" value={fmtUSDCompact(data.spend24h)} />
      <Tile label="Spend · 7d" value={fmtUSDCompact(data.spend7d)} />
      <Tile
        label="Projected 30d"
        value={fmtUSDCompact(data.projected30d)}
        sub="linear from 7d run-rate"
        emphasis="amber"
      />
      <Tile
        label="Concentration"
        value={fmtPercent(data.concentrationPct, 0)}
        sub={data.services[0]?.service ?? undefined}
        emphasis={data.concentrationPct > 50 ? "amber" : "default"}
      />
      <Tile
        label="$/1M tokens"
        value={fmtUSD(data.costPerMTok)}
        sub="blended fleet rate"
      />
      <Tile
        label="Possible savings"
        value={fmtUSDCompact(data.possibleSavings)}
        sub="from $/MTok outliers"
        emphasis="green"
      />
    </div>
  );
};
