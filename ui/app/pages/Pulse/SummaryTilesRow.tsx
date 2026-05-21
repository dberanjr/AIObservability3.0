import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { Sparkline } from "../../components/charts/Sparkline";
import { useTweaks } from "../../tweaks/TweaksContext";
import {
  fmtCount,
  fmtMs,
  fmtPercent,
  fmtTokens,
  fmtUSD,
  fmtUSDCompact,
} from "../../data/format";
import type { PulseSummary } from "./usePulseSummary";

interface TileProps {
  label: string;
  value: string;
  sub?: string;
  spark?: { values: number[]; color: string };
}

const Tile = ({ label, value, sub, spark }: TileProps) => {
  const { density, tileStyle } = useTweaks();
  const pad = density === "compact" ? 8 : 12;
  // tileStyle overrides — only "bordered" and "ghost" need to mask the
  // default Strato raised surface; "card" leaves the defaults alone.
  const tileOverride: React.CSSProperties =
    tileStyle === "bordered"
      ? { boxShadow: "none", border: "1px solid var(--border)" }
      : tileStyle === "ghost"
        ? { boxShadow: "none", border: "none", background: "transparent" }
        : {};

  return (
  <Surface
    elevation="raised"
    padding={pad}
    style={{
      minWidth: 0,
      height: "100%",
      display: "flex",
      flexDirection: "column",
      ...tileOverride,
    }}
  >
    <Flex
      flexDirection="column"
      gap={6}
      style={{ minWidth: 0, flexGrow: 1, height: "100%" }}
    >
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
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
          color: "var(--text)",
        }}
      >
        {value}
      </Text>
      {sub && (
        <Text style={{ fontSize: 11, color: "var(--text-3)" }}>{sub}</Text>
      )}
      {spark && spark.values.length > 1 && (
        <div style={{ marginTop: "auto" }}>
          <Sparkline
            values={spark.values}
            color={spark.color}
            height={24}
            valueFormatter={fmtTokens}
          />
        </div>
      )}
    </Flex>
  </Surface>
  );
};

const TileSkeleton = () => (
  <Surface elevation="raised" padding={12}>
    <Flex flexDirection="column" gap={6}>
      <Skeleton style={{ height: 12, width: "60%" }} />
      <Skeleton style={{ height: 22, width: "80%" }} />
      <Skeleton style={{ height: 8, width: "100%" }} />
    </Flex>
  </Surface>
);

export interface SummaryTilesRowProps {
  summary: PulseSummary;
}

/**
 * 9-tile Pulse summary row. Per Session 5 handoff: Reliability tile dropped
 * (subsumed by Platform Health Card); Cost/request and Token efficiency added.
 * Sparklines appear on the first four tiles (volume-style metrics).
 */
export const SummaryTilesRow = ({ summary }: SummaryTilesRowProps) => {
  // auto-fit lets tiles flow into multiple rows when the viewport is narrower
  // than 9 * minTileWidth, so labels + values + sparklines stay readable
  // regardless of width. Each tile is at least 160px wide.
  const gridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 10,
  };

  if (summary.isLoading && summary.tokens == null) {
    return (
      <div style={gridStyle}>
        {Array.from({ length: 9 }).map((_, i) => (
          <TileSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div style={gridStyle}>
      <Tile
        label="Tokens"
        value={fmtTokens(summary.tokens)}
        sub={summary.requests != null ? `${fmtCount(summary.requests)} req` : undefined}
        spark={{ values: summary.spark.tokens, color: "var(--blue)" }}
      />
      <Tile
        label="Spend"
        value={fmtUSDCompact(summary.spend)}
        sub="Blended est."
        spark={{ values: summary.spark.tokens, color: "var(--purple)" }}
      />
      <Tile
        label="P95 latency"
        value={fmtMs(summary.p95Ms)}
        spark={{ values: summary.spark.tokens, color: "var(--cyan)" }}
      />
      <Tile
        label="Error rate"
        value={fmtPercent(summary.errorRatePct)}
        spark={{ values: summary.spark.tokens, color: "var(--amber)" }}
      />
      <Tile label="Models" value={fmtCount(summary.models)} />
      <Tile label="MCP servers" value={fmtCount(summary.mcpServers)} />
      <Tile label="MCP tools" value={fmtCount(summary.mcpTools)} />
      <Tile
        label="Cost / request"
        value={fmtUSD(summary.costPerRequest)}
        sub="blended, all models"
      />
      <Tile
        label="Token efficiency"
        value={fmtPercent(summary.tokenEfficiencyPct, 0)}
        sub="output / total"
      />
    </div>
  );
};
