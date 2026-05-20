import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { fmtCount, fmtMs, fmtTokens } from "../../data/format";
import type { PromptSummary } from "./usePromptSummary";

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
      {sub && <Text style={{ fontSize: 11, color: "var(--text-3)" }}>{sub}</Text>}
    </Flex>
  </Surface>
);

export interface PromptsTilesRowProps {
  summary: PromptSummary;
}

export const PromptsTilesRow = ({ summary }: PromptsTilesRowProps) => {
  if (summary.isLoading && summary.total === 0) {
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
      <Tile
        label="Prompts"
        value={fmtCount(summary.total)}
        sub={`${fmtCount(summary.sampleSize)} sampled in view`}
      />
      <Tile label="Avg duration" value={fmtMs(summary.avgDurationMs)} />
      <Tile
        label="Avg in/out tokens"
        value={`${fmtTokens(summary.avgInputTokens)} / ${fmtTokens(summary.avgOutputTokens)}`}
      />
      <Tile
        label="PII detected"
        value={fmtCount(summary.piiDetected)}
        emphasis={summary.piiDetected > 0 ? "amber" : "default"}
        sub="gen_ai.privacy.pii_detected"
      />
      <Tile
        label="Warnings"
        value={fmtCount(summary.warnings)}
        emphasis={summary.warnings > 0 ? "amber" : "default"}
      />
      <Tile
        label="Errors"
        value={fmtCount(summary.errors)}
        emphasis={summary.errors > 5 ? "red" : summary.errors > 0 ? "amber" : "default"}
      />
    </div>
  );
};
