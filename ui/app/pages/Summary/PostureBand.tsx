import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Sparkline } from "../../components/charts/Sparkline";
import { MiniPartialDonut } from "../../components/charts/TileGlyphs";
import {
  fmtCount,
  fmtMs,
  fmtPercent,
  fmtTokens,
  fmtUSDCompact,
} from "../../data/format";
import { useScanScope } from "../../scope/ScanReportContext";
import { TileScanFooter } from "../../scope/TileScanFooter";
import { SUMMARY_SCAN_OPTS } from "./summaryScanGroups";
import { CustomizableGrid, type GridTile } from "./CustomizableGrid";
import type { PulseSummary } from "../Pulse/usePulseSummary";
import { useDailySpend } from "../Pulse/useDailySpend";
import type { Pillar, PillarStatus } from "../Pulse/types";
import type { FleetPosture } from "./useFleetPosture";
import { useHiddenFailures } from "./useHiddenFailures";
import { trendPct } from "./posture";

type Delta = { text: string; color: string } | null;

const deltaLabel = (pct: number | null, invert = false): Delta => {
  if (pct == null) return null;
  const up = pct > 0;
  const good = invert ? !up : up;
  const arrow = pct === 0 ? "→" : up ? "▲" : "▼";
  return {
    text: `${arrow} ${Math.abs(pct)}%`,
    color:
      pct === 0 ? "var(--text-3)" : good ? "var(--green-2)" : "var(--amber)",
  };
};

/** Mean of the finite values, or null when empty — the sparkline baseline. */
const mean = (arr: number[]): number | null => {
  const vals = arr.filter((v) => Number.isFinite(v));
  return vals.length ? vals.reduce((a, v) => a + v, 0) / vals.length : null;
};

/** Trust-index band color for the gauge + status dot. */
const bandColor = (score: number | null): string => {
  if (score == null) return "var(--text-4, var(--text-3))";
  if (score >= 85) return "var(--green-2)";
  if (score >= 70) return "var(--blue)";
  if (score >= 50) return "var(--amber)";
  return "var(--red)";
};

/** Health-pillar status color (reserved status ramp, always paired with text). */
const pillarColor = (status: PillarStatus): string =>
  status === "good"
    ? "var(--green-2)"
    : status === "warning"
      ? "var(--amber)"
      : status === "critical"
        ? "var(--red)"
        : "var(--text-4, var(--text-3))";

const fmtPerReq = (n: number | null): string => {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1) return `$${n.toFixed(2)}`;
  // Sub-dollar per-request cost needs more precision than $0.02.
  return `$${n.toFixed(n < 0.01 ? 4 : 3)}`;
};

// ---- Health pillar bar ----------------------------------------------------

const PillarBar = ({ pillar }: { pillar: Pillar }) => {
  const color = pillarColor(pillar.status);
  const score = pillar.score;
  const attention = pillar.status === "warning" || pillar.status === "critical";
  return (
    <Flex alignItems="center" gap={8} style={{ minWidth: 0 }}>
      <Text
        style={{
          fontSize: 11.5,
          color: "var(--text-2)",
          width: 82,
          flex: "0 0 auto",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {pillar.label}
      </Text>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          height: 8,
          borderRadius: 999,
          background: "var(--surface-2, var(--border))",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${Math.max(0, Math.min(100, score ?? 0))}%`,
            height: "100%",
            borderRadius: 999,
            background: color,
          }}
        />
      </div>
      <Text
        style={{
          fontSize: 12.5,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          color: "var(--text)",
          width: 24,
          textAlign: "right",
          flex: "0 0 auto",
        }}
      >
        {score != null ? Math.round(score) : "—"}
      </Text>
      <span
        aria-hidden
        title={pillar.status}
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: color,
          flex: "0 0 auto",
        }}
      />
      {attention && (
        <Text
          style={{
            fontSize: 10.5,
            color,
            fontWeight: 600,
            whiteSpace: "nowrap",
            flex: "0 0 auto",
          }}
        >
          attention
        </Text>
      )}
    </Flex>
  );
};

// ---- KPI tile -------------------------------------------------------------

interface KpiTileProps {
  label: string;
  value: string;
  sub?: string;
  delta?: Delta;
  spark?: number[];
  sparkLabels?: string[];
  sparkVariant?: "line" | "bars";
  sparkColor?: string;
  reference?: number | null;
  referenceLabel?: string;
  tone?: "default" | "risk";
  /** Custom footer visual (e.g. the hidden-risk composition bar). */
  footer?: React.ReactNode;
}

const KpiTile = ({
  label,
  value,
  sub,
  delta,
  spark,
  sparkLabels,
  sparkVariant = "line",
  sparkColor,
  reference,
  referenceLabel,
  tone = "default",
  footer,
}: KpiTileProps) => {
  // The Summary page ignores the tile-style tweak (see tokens.ts immunity CSS).
  const risk = tone === "risk";
  return (
    <Surface
      elevation="raised"
      padding={8}
      style={{
        minWidth: 0,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        overflow: "hidden",
        ...(risk
          ? {
              background:
                "var(--red-soft, color-mix(in oklab, var(--red) 8%, var(--surface)))",
              border: "1px solid color-mix(in oklab, var(--red) 30%, transparent)",
            }
          : {}),
      }}
    >
      <Text
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: risk ? "var(--red)" : "var(--text-3)",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </Text>
      {/* Value + trend, vertically centered in the remaining space so the tile
          reads as one balanced block rather than a number pinned above a void. */}
      <Flex
        flexDirection="column"
        justifyContent="center"
        gap={4}
        style={{ flex: 1, minHeight: 0 }}
      >
        <Flex alignItems="baseline" gap={6} style={{ minWidth: 0 }}>
          <Text
            style={{
              fontSize: 20,
              fontWeight: 700,
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
              color: risk ? "var(--red)" : "var(--text)",
            }}
          >
            {value}
          </Text>
          {delta && (
            <Text
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: delta.color,
                whiteSpace: "nowrap",
              }}
            >
              {delta.text}
            </Text>
          )}
        </Flex>
        {sub && (
          <Text style={{ fontSize: 11, color: "var(--text-3)", whiteSpace: "nowrap" }}>
            {sub}
          </Text>
        )}
        {footer && <div style={{ marginTop: 4 }}>{footer}</div>}
        {!footer && spark && spark.length > 1 && (
          <div style={{ marginTop: 4 }}>
            <Sparkline
              values={spark}
              color={sparkColor ?? "var(--blue)"}
              height={34}
              labels={sparkLabels}
              variant={sparkVariant}
              reference={reference ?? undefined}
              referenceLabel={referenceLabel}
            />
          </div>
        )}
      </Flex>
    </Surface>
  );
};

/** Stacked composition bar for the hidden-risk tile (no trend series exists). */
const CompositionBar = ({
  segments,
}: {
  segments: { key: string; label: string; count: number; color: string }[];
}) => {
  const total = segments.reduce((a, s) => a + s.count, 0);
  if (total <= 0) return null;
  return (
    <Flex
      style={{ height: 8, borderRadius: 999, overflow: "hidden", gap: 2 }}
      title={segments.map((s) => `${s.label}: ${fmtCount(s.count)}`).join(" · ")}
    >
      {segments.map((s) => (
        <div
          key={s.key}
          style={{
            width: `${(s.count / total) * 100}%`,
            background: s.color,
            minWidth: s.count > 0 ? 3 : 0,
          }}
        />
      ))}
    </Flex>
  );
};

export interface PostureBandProps {
  summary: PulseSummary;
  posture: FleetPosture;
}

/**
 * Row 1 of the Summary page. The hero is a fleet-posture VISUALIZATION — a radial
 * trust gauge (grade + index, colored by band) beside the three real health
 * pillars as status-colored score bars — replacing the old text stack + off-topic
 * token chart. The six KPI tiles each carry a directional sparkline (color echoes
 * the delta), with an average-baseline reference on the rate/efficiency metrics,
 * count bars for tokens, and a category-composition bar for hidden risk.
 */
export const PostureBand = ({ summary, posture }: PostureBandProps) => {
  const daily = useDailySpend();
  const hidden = useHiddenFailures();
  const scanGroup = useScanScope();
  const s = summary.spark;

  const spendDelta = deltaLabel(
    daily.delta24h != null ? Math.round(daily.delta24h) : null,
    true,
  );
  const tokenDelta = deltaLabel(trendPct(s.tokens));
  const p95Delta = deltaLabel(trendPct(s.p95Ms), true);
  const errDelta = deltaLabel(trendPct(s.errorRatePct), true);
  const costDelta = deltaLabel(trendPct(s.costPerReq), true);

  const footprint = [
    summary.tokens != null ? `${fmtTokens(summary.tokens)} tokens` : null,
    posture.serviceCount != null
      ? `${fmtCount(posture.serviceCount)} AI services`
      : null,
    posture.agentCount != null ? `${fmtCount(posture.agentCount)} agents` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const dot = bandColor(posture.trustIndex);

  // The six KPI tiles as a movable grid. Each spans 3 of 6 columns (two per
  // row) and carries a fixed short height so they read as standalone cards.
  const kpi = (id: string, node: React.ReactNode): GridTile => ({
    id,
    defaultColSpan: 3,
    defaultHeight: 112,
    node,
  });
  const kpiTiles: GridTile[] = [
    kpi(
      "kpi-cost",
      <KpiTile
        label="Cost / request"
        value={fmtPerReq(summary.costPerRequest)}
        sub="blended $/req"
        delta={costDelta}
        spark={s.costPerReq}
        sparkLabels={s.labels}
        sparkColor={costDelta?.color}
        reference={mean(s.costPerReq)}
        referenceLabel="avg"
      />,
    ),
    kpi(
      "kpi-spend",
      <KpiTile
        label="Spend · 30d proj"
        value={fmtUSDCompact(daily.projected30d)}
        delta={spendDelta}
        spark={s.spend}
        sparkLabels={s.labels}
        sparkColor={spendDelta?.color}
      />,
    ),
    kpi(
      "kpi-p95",
      <KpiTile
        label="P95 latency"
        value={fmtMs(summary.p95Ms)}
        delta={p95Delta}
        spark={s.p95Ms}
        sparkLabels={s.labels}
        sparkColor={p95Delta?.color}
        reference={mean(s.p95Ms)}
        referenceLabel="avg"
      />,
    ),
    kpi(
      "kpi-error",
      <KpiTile
        label="Error rate"
        value={fmtPercent(summary.errorRatePct)}
        delta={errDelta}
        spark={s.errorRatePct}
        sparkLabels={s.labels}
        sparkColor={errDelta?.color}
        reference={mean(s.errorRatePct)}
        referenceLabel="avg"
      />,
    ),
    kpi(
      "kpi-tokens",
      <KpiTile
        label="Tokens"
        value={fmtTokens(summary.tokens)}
        sub={
          summary.models != null
            ? `${fmtCount(summary.models)} models · ${fmtCount(summary.mcpServers ?? 0)} MCP`
            : undefined
        }
        delta={tokenDelta}
        spark={s.tokens}
        sparkLabels={s.labels}
        sparkVariant="bars"
        sparkColor="var(--blue)"
      />,
    ),
    kpi(
      "kpi-hidden",
      <KpiTile
        label="Hidden risk"
        value={hidden.isLoading ? "…" : fmtCount(hidden.total)}
        sub="200-OK failures"
        tone="risk"
        footer={<CompositionBar segments={hidden.categories} />}
      />,
    ),
  ];

  return (
    <div className="aiobs-summary-posture">
      {/* Hero — trust gauge + health-pillar bars */}
      <Surface elevation="raised" padding={16} style={{ minWidth: 0, overflow: "hidden" }}>
        <Flex flexDirection="column" gap={12} style={{ height: "100%" }}>
          <Text
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--text-3)",
            }}
          >
            Fleet posture
          </Text>

          <Flex alignItems="center" gap={16}>
            <Flex flexDirection="column" alignItems="center" gap={4} style={{ flex: "0 0 auto" }}>
              <MiniPartialDonut
                size={104}
                thickness={12}
                track
                percent={posture.trustIndex ?? 0}
                color={dot}
                centerValue={
                  posture.isLoading && posture.grade == null
                    ? "…"
                    : (posture.grade ?? "—")
                }
                centerSub={posture.trustIndex != null ? String(posture.trustIndex) : undefined}
              />
              <Text style={{ fontSize: 10.5, color: "var(--text-3)" }}>trust index</Text>
            </Flex>

            <Flex flexDirection="column" gap={6} style={{ minWidth: 0 }}>
              <Flex alignItems="center" gap={8} style={{ minWidth: 0 }}>
                <span
                  aria-hidden
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    background: dot,
                    flex: "0 0 auto",
                  }}
                />
                <Text
                  style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", lineHeight: 1.25 }}
                >
                  {posture.headline}
                </Text>
              </Flex>
              <Text style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.4 }}>
                {footprint || "No AI activity in the current scope."}
              </Text>
            </Flex>
          </Flex>

          {/* Health pillars — the drivers behind the grade */}
          <Flex
            flexDirection="column"
            gap={8}
            style={{ paddingTop: 12, borderTop: "1px solid var(--border)" }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                color: "var(--text-3)",
              }}
            >
              Health pillars
            </Text>
            {posture.pillars.length > 0 ? (
              posture.pillars.map((p) => <PillarBar key={p.key} pillar={p} />)
            ) : (
              <Text style={{ fontSize: 12, color: "var(--text-3)" }}>
                {posture.isLoading ? "Scoring pillars…" : "No pillar data in scope."}
              </Text>
            )}
          </Flex>

          <Flex alignItems="baseline" gap={8} style={{ marginTop: "auto" }}>
            <Text style={{ fontSize: 12, color: "var(--text-3)" }}>30-day spend</Text>
            <Text style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              {daily.isLoading ? "…" : fmtUSDCompact(daily.projected30d)}
            </Text>
            {!daily.isLoading && spendDelta && (
              <Text as="span" style={{ fontSize: 11, fontWeight: 600, color: spendDelta.color }}>
                {spendDelta.text} d/d
              </Text>
            )}
          </Flex>

          <TileScanFooter group={scanGroup} opts={SUMMARY_SCAN_OPTS} />
        </Flex>
      </Surface>

      {/* KPI tiles — a movable grid of short standalone cards (drag to reorder,
          drag a corner to resize). 6-col grid, each tile spans 3 → two per row. */}
      <CustomizableGrid storageKey="kpis" columns={6} tiles={kpiTiles} />
    </div>
  );
};
