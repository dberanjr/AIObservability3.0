import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import {
  fmtCount,
  fmtPercent,
  fmtTokens,
} from "../../data/format";
import type { ExplorerSummary } from "./useExplorerSummary";

interface TileProps {
  label: string;
  value: string;
  sub?: string;
  emphasis?: "default" | "amber" | "red";
}

const COLOR: Record<NonNullable<TileProps["emphasis"]>, string> = {
  default: "var(--text)",
  amber: "var(--amber)",
  red: "var(--red)",
};

const Tile = ({ label, value, sub, emphasis = "default" }: TileProps) => (
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
          color: COLOR[emphasis],
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

export interface ExplorerTilesProps {
  summary: ExplorerSummary;
  isLoading: boolean;
}

export const ExplorerTiles = ({ summary, isLoading }: ExplorerTilesProps) => {
  if (isLoading && summary.tokens === 0) {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gap: 10,
        }}
      >
        {Array.from({ length: 7 }).map((_, i) => (
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
        gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
        gap: 10,
      }}
    >
      <Tile label="AI services" value={fmtCount(summary.aiServiceCount)} />
      <Tile label="LLM requests" value={fmtCount(summary.llmRequests)} />
      <Tile label="Tokens" value={fmtTokens(summary.tokens)} />
      <Tile label="Active models" value={fmtCount(summary.activeModels)} />
      <Tile
        label="Concentration"
        value={fmtPercent(summary.concentrationPct, 0)}
        sub={summary.topServiceShare?.service}
        emphasis={summary.concentrationPct > 50 ? "amber" : "default"}
      />
      <Tile
        label="Errors"
        value={fmtCount(summary.errors)}
        emphasis={summary.errors > 0 ? "amber" : "default"}
      />
      <Tile
        label="Logical errors"
        value={fmtCount(summary.logicalErrors)}
        sub="HTTP 200, payload-level"
        emphasis={summary.logicalErrors > 0 ? "amber" : "default"}
      />
    </div>
  );
};
