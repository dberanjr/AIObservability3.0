import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { Sparkline } from "../../components/charts/Sparkline";
import {
  MiniDonut,
  MiniPartialDonut,
  MiniScale,
} from "../../components/charts/TileGlyphs";
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
import { useTileBreakdowns } from "./useTileBreakdowns";

interface TileShellProps {
  label: string;
  value: string;
  sub?: string;
  /** Chart that pins to the bottom of the tile. */
  bottom?: React.ReactNode;
  /**
   * When set, the chart renders to the right of the value (e.g. for
   * donuts that read better next to the big number). When unset the chart
   * goes below via the `bottom` slot.
   */
  side?: React.ReactNode;
}

const Tile = ({ label, value, sub, bottom, side }: TileShellProps) => {
  const { density, tileStyle } = useTweaks();
  const pad = density === "minimal" ? 4 : density === "compact" ? 8 : 12;
  const tileOverride: React.CSSProperties =
    density === "minimal"
      ? { boxShadow: "none", border: "none", background: "transparent" }
      : tileStyle === "bordered"
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

        {side ? (
          <Flex alignItems="center" justifyContent="space-between" gap={8}>
            <Flex flexDirection="column" gap={4} style={{ minWidth: 0 }}>
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
                <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
                  {sub}
                </Text>
              )}
            </Flex>
            {side}
          </Flex>
        ) : (
          <>
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
          </>
        )}

        {bottom && <div style={{ marginTop: "auto" }}>{bottom}</div>}
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
 * 9-tile Pulse summary row. The first four (volume metrics) keep their
 * sparklines; Models / MCP Servers / MCP Tools get donut breakdowns from
 * useTileBreakdowns; Token efficiency uses a partial donut tied to the
 * accent color; Cost/request uses a horizontal intensity scale so every
 * tile has its own visualization.
 */
export const SummaryTilesRow = ({ summary }: SummaryTilesRowProps) => {
  const breakdowns = useTileBreakdowns();

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

  const sparkValues = summary.spark.tokens;
  const renderSpark = (color: string) =>
    sparkValues.length > 1 ? (
      <Sparkline
        values={sparkValues}
        color={color}
        height={24}
        valueFormatter={fmtTokens}
      />
    ) : null;

  // Cost-per-request scale: a $0–$0.05 range is generous for blended LLM
  // pricing across common SOTA models. Values above clamp to the right.
  const costScaleMax = 0.05;
  // Token-efficiency partial-donut uses the active accent so the tile
  // visually anchors to the same color as the token consumption chart.
  const efficiencyColor = "var(--blue)";

  return (
    <div style={gridStyle}>
      <Tile
        label="Tokens"
        value={fmtTokens(summary.tokens)}
        sub={
          summary.requests != null
            ? `${fmtCount(summary.requests)} req`
            : undefined
        }
        bottom={renderSpark("var(--blue)")}
      />
      <Tile
        label="Spend"
        value={fmtUSDCompact(summary.spend)}
        sub="Blended est."
        bottom={renderSpark("var(--purple)")}
      />
      <Tile
        label="P95 latency"
        value={fmtMs(summary.p95Ms)}
        bottom={renderSpark("var(--cyan)")}
      />
      <Tile
        label="Error rate"
        value={fmtPercent(summary.errorRatePct)}
        bottom={renderSpark("var(--amber)")}
      />

      <Tile
        label="Models"
        value={fmtCount(summary.models)}
        side={
          <MiniDonut
            values={breakdowns.models.map((m) => m.value)}
            centerValue={
              summary.models != null ? String(Math.round(summary.models)) : "—"
            }
          />
        }
      />
      <Tile
        label="MCP servers"
        value={fmtCount(summary.mcpServers)}
        side={
          <MiniDonut
            values={breakdowns.mcpServers.map((s) => s.value)}
            centerValue={
              summary.mcpServers != null
                ? String(Math.round(summary.mcpServers))
                : "—"
            }
          />
        }
      />
      <Tile
        label="MCP tools"
        value={fmtCount(summary.mcpTools)}
        side={
          <MiniDonut
            values={breakdowns.mcpTools.map((t) => t.value)}
            centerValue={
              summary.mcpTools != null
                ? String(Math.round(summary.mcpTools))
                : "—"
            }
          />
        }
      />

      <Tile
        label="Cost / request"
        value={fmtUSD(summary.costPerRequest)}
        sub="blended, all models"
        bottom={
          summary.costPerRequest != null ? (
            <MiniScale
              value={summary.costPerRequest}
              min={0}
              max={costScaleMax}
              ticks={[costScaleMax / 2]}
            />
          ) : null
        }
      />

      <Tile
        label="Token efficiency"
        value={fmtPercent(summary.tokenEfficiencyPct, 0)}
        sub="output / total"
        side={
          <MiniPartialDonut
            percent={summary.tokenEfficiencyPct ?? 0}
            color={efficiencyColor}
          />
        }
      />
    </div>
  );
};
