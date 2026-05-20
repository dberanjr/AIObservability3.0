import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { fmtCount, fmtTokens, fmtUSD, fmtUSDCompact } from "../../data/format";
import type { ModelRow } from "./useModels";

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
  const spend = models.reduce((acc, m) => acc + m.cost, 0);
  const priced = models.filter((m) => !m.pricingUnknown && m.costPerMTok > 0);
  const cheapest = priced.reduce<ModelRow | null>(
    (best, m) => (best == null || m.costPerMTok < best.costPerMTok ? m : best),
    null,
  );
  const mostExpensive = priced.reduce<ModelRow | null>(
    (best, m) => (best == null || m.costPerMTok > best.costPerMTok ? m : best),
    null,
  );

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
        gap: 10,
      }}
    >
      <Tile label="Models" value={fmtCount(models.length)} />
      <Tile label="Requests" value={fmtCount(requests)} />
      <Tile label="Tokens" value={fmtTokens(tokens)} />
      <Tile label="Spend" value={fmtUSDCompact(spend)} sub="blended est." />
      <Tile
        label="Cheapest / 1M"
        value={cheapest ? fmtUSD(cheapest.costPerMTok) : "—"}
        sub={cheapest?.model}
        emphasis={cheapest ? "green" : "default"}
      />
      <Tile
        label="Most expensive / 1M"
        value={mostExpensive ? fmtUSD(mostExpensive.costPerMTok) : "—"}
        sub={mostExpensive?.model}
        emphasis={mostExpensive ? "red" : "default"}
      />
    </div>
  );
};
