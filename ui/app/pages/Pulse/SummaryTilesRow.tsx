import React, { useEffect, useRef, useState } from "react";
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

type TileVariant = "value" | "visual";

interface TileShellProps {
  label: string;
  /** Variant "value" shows a big number + optional bottom chart; variant
   * "visual" centers a single visualization (e.g., a big donut) and skips
   * the redundant left-side number. */
  variant?: TileVariant;
  value?: string;
  sub?: string;
  /** Bottom-pinned chart, used by "value" variant. */
  bottom?: React.ReactNode;
  /** Centered visualization, used by "visual" variant. */
  visual?: React.ReactNode;
  /** Visual variant — extra caption rendered under the centered visual. */
  visualCaption?: string;
  /** Short explanation shown when the user hovers the info glyph. */
  info?: string;
}

/**
 * Small circled-i in the top-right of each tile. Hover/focus surfaces a
 * native tooltip explaining what the metric measures and where it comes
 * from. Renders as a span with `title` so it works without JS popovers and
 * stays accessible to keyboard / screen-reader users.
 */
const TileInfo = ({ text }: { text: string }) => (
  <span
    role="img"
    aria-label={text}
    title={text}
    tabIndex={0}
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 14,
      height: 14,
      borderRadius: "50%",
      border: "1px solid var(--text-4)",
      color: "var(--text-3)",
      fontSize: 9,
      fontWeight: 700,
      fontFamily: "serif",
      cursor: "help",
      flex: "0 0 auto",
      lineHeight: 1,
    }}
  >
    i
  </span>
);

const Tile = ({
  label,
  variant = "value",
  value,
  sub,
  bottom,
  visual,
  visualCaption,
  info,
}: TileShellProps) => {
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
        <Flex
          alignItems="flex-start"
          justifyContent="space-between"
          gap={6}
          style={{ minHeight: 28 }}
        >
          <Text
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "var(--text-3)",
              whiteSpace: "normal",
              lineHeight: 1.2,
            }}
          >
            {label}
          </Text>
          {info && <TileInfo text={info} />}
        </Flex>

        {variant === "visual" ? (
          <Flex
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            gap={4}
            style={{ flexGrow: 1, minHeight: 0, width: "100%" }}
          >
            {visual}
            {visualCaption && (
              <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
                {visualCaption}
              </Text>
            )}
          </Flex>
        ) : (
          <>
            {value !== undefined && (
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
            )}
            {sub && (
              <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
                {sub}
              </Text>
            )}
            {bottom && <div style={{ marginTop: "auto" }}>{bottom}</div>}
          </>
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
 * 9-tile Pulse summary row. The first four (volume metrics) keep their
 * sparklines; Models / MCP Servers / MCP Tools get donut breakdowns from
 * useTileBreakdowns; Token efficiency uses a partial donut tied to the
 * accent color; Cost/request uses a horizontal intensity scale so every
 * tile has its own visualization.
 */
// Explicit column counts at decreasing container widths. With 124px tile
// minimum and 10px gap, the math is `cols * 124 + (cols - 1) * 10`.
// Steps are picked so the row wraps in deliberate chunks (9 → 6 → 3 → 2)
// rather than dropping one tile at a time.
//   1196px  → 9 cols  (one row)
//    794px  → 6 cols  (6 + 3)
//    392px  → 3 cols  (3 + 3 + 3)
//    258px  → 2 cols
//   below   → 1 col
const COLUMN_BREAKPOINTS: Array<{ minPx: number; cols: number }> = [
  { minPx: 1196, cols: 9 },
  { minPx: 794, cols: 6 },
  { minPx: 392, cols: 3 },
  { minPx: 258, cols: 2 },
];

const pickColumns = (width: number): number => {
  for (const bp of COLUMN_BREAKPOINTS) {
    if (width >= bp.minPx) return bp.cols;
  }
  return 1;
};

export const SummaryTilesRow = ({ summary }: SummaryTilesRowProps) => {
  const breakdowns = useTileBreakdowns();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // Default to 9 columns until the observer fires — avoids a jarring
  // reflow on first mount on wide viewports.
  const [columns, setColumns] = useState(9);

  useEffect(() => {
    if (!wrapRef.current || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      setColumns(pickColumns(entry.contentRect.width));
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const gridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    gap: 10,
  };

  if (summary.isLoading && summary.tokens == null) {
    return (
      <div ref={wrapRef} style={gridStyle}>
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
    <div ref={wrapRef} style={gridStyle}>
      <Tile
        label="Tokens"
        info="Total tokens (input + output) consumed by GenAI calls in the current scope. Counts/sums are extrapolated to the unsampled population when sampling is on."
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
        info="Blended USD estimate computed by applying default per-model pricing to the input/output token counts. Useful as a directional cost signal; the FinOps tab is authoritative."
        value={fmtUSDCompact(summary.spend)}
        sub="Blended est."
        bottom={renderSpark("var(--purple)")}
      />
      <Tile
        label="P95 latency"
        info="95th percentile request duration across all GenAI spans in scope. Percentile statistics are sampling-invariant — toggling sampling won't change this number."
        value={fmtMs(summary.p95Ms)}
        bottom={renderSpark("var(--cyan)")}
      />
      <Tile
        label="Error rate"
        info="Percentage of GenAI spans with a non-null exception.type field. A ratio (not a count) — sampling-invariant."
        value={fmtPercent(summary.errorRatePct)}
        bottom={renderSpark("var(--amber)")}
      />

      <Tile
        label="Models"
        info="Number of distinct gen_ai.request.model values observed in scope. The donut breaks down by request volume; model version suffixes are collapsed so e.g. claude-sonnet-4-5-20250114 and claude-sonnet-4-5 count as one model."
        variant="visual"
        visual={
          <MiniDonut
            size={96}
            thickness={14}
            values={breakdowns.models.map((m) => m.value)}
            centerValue={
              summary.models != null ? String(Math.round(summary.models)) : "—"
            }
          />
        }
      />
      <Tile
        label="MCP servers"
        info="Distinct MCP servers detected via traceloop.workflow.name matching `*.mcp` (the convention this tenant's SDKs use). Donut breaks down by workflow request volume."
        variant="visual"
        visual={
          <MiniDonut
            size={96}
            thickness={14}
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
        info="Distinct MCP tools invoked within MCP workflows. Tool name comes from gen_ai.tool.name with a fallback to traceloop.entity.name. Donut sized by call count."
        variant="visual"
        visual={
          <MiniDonut
            size={96}
            thickness={14}
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
        info="Total blended spend divided by the number of requests. The scale below shows where this value falls on a $0–$0.05 range (green = cheap, red = expensive). Ratio is sampling-invariant."
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
        info="Output tokens as a share of total tokens (input + output). Higher means more of your token spend is going toward generated content vs prompt overhead. Filled arc follows the active accent color."
        variant="visual"
        visual={
          <MiniPartialDonut
            size={96}
            thickness={14}
            percent={summary.tokenEfficiencyPct ?? 0}
            color={efficiencyColor}
            centerValue={fmtPercent(summary.tokenEfficiencyPct, 0)}
          />
        }
        visualCaption="output / total"
      />
    </div>
  );
};
