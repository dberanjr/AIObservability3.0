import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { Sparkline } from "../../components/charts/Sparkline";
import { InfoTooltip } from "../../components/InfoTooltip";
import { MiniPartialDonut } from "../../components/charts/TileGlyphs";
import {
  fmtCount,
  fmtMs,
  fmtPercent,
  fmtTokens,
  fmtUSD,
  fmtUSDCents,
  fmtUSDCompact,
} from "../../data/format";
import {
  STATUS_CUE,
  toneToColor,
  type SemanticStatus,
  type Tone,
} from "../../theme/statusColor";
import { useScanScope } from "../../scope/ScanReportContext";
import { TileScanFooter } from "../../scope/TileScanFooter";
import { SUMMARY_SCAN_OPTS } from "./summaryScanGroups";
import { CustomizableGrid, type GridTile } from "./CustomizableGrid";
import type { PulseSummary } from "../Pulse/usePulseSummary";
import { useDailySpend } from "../Pulse/useDailySpend";
import type { Pillar, PillarStatus } from "../Pulse/types";
import type { FleetPosture } from "./useFleetPosture";
import { useHiddenFailures } from "./useHiddenFailures";
import { trendPct, deltaTone, type DeltaTone } from "./posture";

type Delta = { text: string; color: string } | null;

/**
 * Delta-severity tone → the shared tile-tone vocabulary, so the chip color
 * resolves through toneToColor (var(--status-*)) instead of hardcoded brand
 * hues — one severity ramp across the app (CONS-4).
 */
const DELTA_TONE: Record<DeltaTone, Tone> = {
  flat: "neutral",
  good: "good",
  warn: "warn",
  severe: "critical",
};

/**
 * Directional delta chip. `invert` marks metrics where a rise is bad; `severeAt`
 * is the |percent| at which a bad movement escalates from warning to critical, so
 * a regression worth paging on doesn't read like a 3% wobble (SUM-8). The arrow
 * glyph stays the non-color cue for accessibility.
 */
const deltaLabel = (
  pct: number | null,
  opts?: { invert?: boolean; severeAt?: number },
): Delta => {
  if (pct == null) return null;
  const arrow = pct === 0 ? "→" : pct > 0 ? "▲" : "▼";
  return {
    text: `${arrow} ${Math.abs(pct)}%`,
    color: toneToColor(DELTA_TONE[deltaTone(pct, opts)]),
  };
};

/** Mean of the finite values, or null when empty — the sparkline baseline. */
const mean = (arr: number[]): number | null => {
  const vals = arr.filter((v) => Number.isFinite(v));
  return vals.length ? vals.reduce((a, v) => a + v, 0) / vals.length : null;
};

/**
 * Trust-index band color for the gauge + status dot. The severity tiers route
 * through the shared status ramp (toneToColor → var(--status-*)) so they match
 * the rest of the app instead of hardcoding brand hues; the original band cut
 * points (85 / 70 / 50) are preserved exactly, and the 70–85 "Stable" tier is
 * an info state — not a severity — so it deliberately stays blue (CONS-4).
 */
const bandColor = (score: number | null): string => {
  if (score == null) return "var(--text-4, var(--text-3))";
  if (score >= 85) return toneToColor("good");
  if (score >= 70) return "var(--blue)";
  if (score >= 50) return toneToColor("warn");
  return toneToColor("bad");
};

/**
 * Health-pillar status → the shared tone + semantic-status keys, so both the
 * bar color (toneToColor) and the non-color cue glyph (STATUS_CUE) derive from
 * one source instead of a hand-rolled color ternary (CONS-4).
 */
const PILLAR_TONE: Record<PillarStatus, Tone> = {
  good: "good",
  warning: "warn",
  critical: "critical",
  "no-data": "neutral",
};
const PILLAR_STATUS: Record<PillarStatus, SemanticStatus> = {
  good: "good",
  warning: "warning",
  critical: "critical",
  "no-data": "neutral",
};

/** Health-pillar status color (reserved status ramp, always paired with text). */
const pillarColor = (status: PillarStatus): string =>
  toneToColor(PILLAR_TONE[status]);

// ---- Health pillar bar ----------------------------------------------------

const PillarBar = ({ pillar }: { pillar: Pillar }) => {
  const measured = pillar.score != null && Number.isFinite(pillar.score);
  const color = pillarColor(pillar.status);
  const attention = pillar.status === "warning" || pillar.status === "critical";
  const labelStyle: React.CSSProperties = {
    fontSize: 11.5,
    color: "var(--text-2)",
    width: 82,
    flex: "0 0 auto",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
  // An unmeasured pillar (e.g. quality with no gen_ai.evaluation.* data) must
  // read as "not measured" — a dashed empty track — never a 0% bar that looks
  // like a failing score and folds silently into the grade (SUM-2).
  if (!measured) {
    return (
      <Flex alignItems="center" gap={8} style={{ minWidth: 0 }}>
        <Text style={labelStyle}>{pillar.label}</Text>
        <div
          aria-hidden
          title={`${pillar.label}: not measured`}
          style={{
            flex: 1,
            minWidth: 0,
            height: 8,
            borderRadius: 999,
            border: "1px dashed var(--border)",
            background:
              "repeating-linear-gradient(90deg, var(--surface-2, var(--border)) 0 6px, transparent 6px 12px)",
            opacity: 0.6,
          }}
        />
        <Text
          style={{
            fontSize: 10.5,
            color: "var(--text-3)",
            fontStyle: "italic",
            whiteSpace: "nowrap",
            flex: "0 0 auto",
          }}
        >
          not measured
        </Text>
      </Flex>
    );
  }
  return (
    <Flex alignItems="center" gap={8} style={{ minWidth: 0 }}>
      <Text style={labelStyle}>{pillar.label}</Text>
      <div
        title={`${pillar.label}: ${Math.round(pillar.score as number)}/100 (${pillar.status})`}
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
            width: `${Math.max(0, Math.min(100, pillar.score as number))}%`,
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
        {Math.round(pillar.score as number)}
      </Text>
      {/* Non-color severity cue: a distinct glyph per status (● good, ▲ warning,
          ⬤ critical) so the pillar state is legible without relying on hue. */}
      <span
        aria-hidden
        title={pillar.status}
        style={{
          color,
          fontSize: 10,
          lineHeight: 1,
          flex: "0 0 auto",
        }}
      >
        {STATUS_CUE[PILLAR_STATUS[pillar.status]].glyph}
      </span>
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
  /** One-line, plain-language definition shown via an info icon by the label. */
  info?: string;
  value: string;
  /** Show a skeleton in place of the value while the tile's data loads, so the
   *  hero uses the same loading idiom as the cards — no bare "…" (SUM-10). */
  loading?: boolean;
  sub?: string;
  delta?: Delta;
  spark?: number[];
  sparkLabels?: string[];
  sparkVariant?: "line" | "bars";
  sparkColor?: string;
  /** Unit-aware formatter for the sparkline hover tooltip and a11y readout, so
   *  the trend's values render in the tile's own metric (e.g. fmtMs / fmtUSD /
   *  fmtPercent / fmtCount) instead of the Sparkline's raw-number default. */
  sparkFormatter?: (n: number) => string;
  reference?: number | null;
  referenceLabel?: string;
  tone?: "default" | "risk";
  /** Custom footer visual (e.g. the hidden-risk composition bar). */
  footer?: React.ReactNode;
  /** Chip naming the tile's time basis when it differs from the global
   *  timeframe, e.g. "30d proj" (SUM-11). */
  window?: string;
  /** Suffix on the delta chip naming its basis, e.g. "d/d" (SUM-5). */
  deltaSuffix?: string;
  /** Caption under the sparkline naming the series' window (SUM-5). */
  sparkCaption?: string;
}

const KpiTile = ({
  label,
  info,
  value,
  loading,
  sub,
  delta,
  spark,
  sparkLabels,
  sparkVariant = "line",
  sparkColor,
  sparkFormatter,
  reference,
  referenceLabel,
  tone = "default",
  footer,
  window,
  deltaSuffix,
  sparkCaption,
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
      <Flex alignItems="center" gap={6} justifyContent="space-between" style={{ minWidth: 0 }}>
        <Flex alignItems="center" gap={4} style={{ minWidth: 0 }}>
          <Text
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: risk ? "var(--red)" : "var(--text-3)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              minWidth: 0,
            }}
          >
            {label}
          </Text>
          {info && <InfoTooltip text={info} size={12} />}
        </Flex>
        {window && (
          <Text
            title="This tile's time basis"
            style={{
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: "0.02em",
              color: "var(--text-3)",
              background: "var(--surface-2, var(--border))",
              borderRadius: 4,
              padding: "1px 5px",
              whiteSpace: "nowrap",
              flex: "0 0 auto",
            }}
          >
            {window}
          </Text>
        )}
      </Flex>
      {/* Value + trend, vertically centered in the remaining space so the tile
          reads as one balanced block rather than a number pinned above a void. */}
      <Flex
        flexDirection="column"
        justifyContent="center"
        gap={4}
        style={{ flex: 1, minHeight: 0 }}
      >
        <Flex alignItems="baseline" gap={6} style={{ minWidth: 0 }}>
          {loading ? (
            <Skeleton style={{ height: 20, width: 72, borderRadius: 4 }} />
          ) : (
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
          )}
          {!loading && delta && (
            <Text
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: delta.color,
                whiteSpace: "nowrap",
              }}
            >
              {delta.text}
              {deltaSuffix ? ` ${deltaSuffix}` : ""}
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
              valueFormatter={sparkFormatter}
              reference={reference ?? undefined}
              referenceLabel={referenceLabel}
            />
            {sparkCaption && (
              <Text style={{ fontSize: 9, color: "var(--text-3)", whiteSpace: "nowrap" }}>
                {sparkCaption}
              </Text>
            )}
          </div>
        )}
      </Flex>
    </Surface>
  );
};

/** Short legend labels so the composition legend fits the compact KPI tile. */
const HIDDEN_SHORT: Record<string, string> = {
  refusals: "Refusals",
  truncations: "Truncation",
  content_filters: "Content filter",
  other: "Other",
};

/**
 * Stacked composition bar for the hidden-risk tile (no trend series exists),
 * with an inline legend so the four-color split is decipherable without hovering
 * and each segment carries its own tooltip (SUM-6).
 */
const CompositionBar = ({
  segments,
}: {
  segments: { key: string; label: string; count: number; color: string }[];
}) => {
  const total = segments.reduce((a, s) => a + s.count, 0);
  if (total <= 0) return null;
  return (
    <Flex flexDirection="column" gap={4}>
      <Flex style={{ height: 8, borderRadius: 999, overflow: "hidden", gap: 2 }}>
        {segments.map((s) => (
          <div
            key={s.key}
            title={`${s.label}: ${fmtCount(s.count)}`}
            style={{
              width: `${(s.count / total) * 100}%`,
              background: s.color,
              minWidth: s.count > 0 ? 3 : 0,
            }}
          />
        ))}
      </Flex>
      <Flex style={{ gap: 8, flexWrap: "wrap" }}>
        {segments.map((s) => (
          <Flex
            key={s.key}
            alignItems="center"
            gap={4}
            style={{ minWidth: 0 }}
            title={`${s.label}: ${fmtCount(s.count)}`}
          >
            <span
              aria-hidden
              style={{
                width: 7,
                height: 7,
                borderRadius: 2,
                background: s.color,
                flex: "0 0 auto",
              }}
            />
            <Text style={{ fontSize: 9.5, color: "var(--text-3)", whiteSpace: "nowrap" }}>
              {HIDDEN_SHORT[s.key] ?? s.label} {fmtCount(s.count)}
            </Text>
          </Flex>
        ))}
      </Flex>
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
    { invert: true },
  );
  const tokenDelta = deltaLabel(trendPct(s.tokens));
  const p95Delta = deltaLabel(trendPct(s.p95Ms), { invert: true });
  // Error rate is the most sensitive metric — a +25% swing is already severe.
  const errDelta = deltaLabel(trendPct(s.errorRatePct), {
    invert: true,
    severeAt: 25,
  });
  const costDelta = deltaLabel(trendPct(s.costPerReq), { invert: true });

  // Hidden-risk base rate: 200-OK failures as a share of LLM responses (SUM-6).
  const hiddenRate =
    summary.requests != null && summary.requests > 0
      ? (hidden.total / summary.requests) * 100
      : null;

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
        info="Blended cost per request = fleet spend ÷ requests over the current timeframe. Spend prices the tokens at the cost model's blended fallback rate (the per-agent breakdown is the authoritative dollar figure). Sampling-invariant, since spend and requests scale together. Sparkline is per-bucket cost/req; the dashed line is the timeframe average."
        // Per-request cost is a sub-dollar micro-value — the shared cents
        // formatter shows it in fractional cents, then falls back to dollars
        // past $1 (CONS-3). costPerRequest is in dollars → ×100 to cents.
        value={
          summary.costPerRequest != null
            ? fmtUSDCents(summary.costPerRequest * 100)
            : "—"
        }
        sub="blended $/req"
        delta={costDelta}
        spark={s.costPerReq}
        sparkLabels={s.labels}
        sparkColor={costDelta?.color}
        // Per-bucket cost/req is a sub-dollar micro-value in dollars — mirror the
        // tile's headline cents formatter (×100 → cents) so the hover unit
        // matches the value above it.
        sparkFormatter={(n) => fmtUSDCents(n * 100)}
        reference={mean(s.costPerReq)}
        referenceLabel="avg"
      />,
    ),
    kpi(
      "kpi-spend",
      <KpiTile
        label="Spend · 30d proj"
        info="Projected 30-day spend = (sum of the last 7 daily-window costs ÷ 7) × 30. Each day is scanned separately and priced per-model via the cost model (blended fallback for unpriced models); the heavy day scans run at a sampling floor and extrapolate the token sums. The delta is day-over-day (last 24h vs the prior day)."
        value={fmtUSDCompact(daily.projected30d)}
        window="30d proj"
        delta={spendDelta}
        deltaSuffix="d/d"
        spark={s.spend}
        sparkLabels={s.labels}
        sparkColor={spendDelta?.color}
        // Per-bucket spend in dollars — precise USD hover (compact is reserved
        // for the tile's projected headline).
        sparkFormatter={fmtUSD}
        reference={mean(s.spend)}
        referenceLabel="avg"
        sparkCaption="spend · current timeframe"
      />,
    ),
    kpi(
      "kpi-p95",
      <KpiTile
        label="P95 latency"
        info="95th-percentile end-to-end LLM span duration over the current timeframe (percentiles are sampling-invariant, so no extrapolation). Sparkline is the per-bucket p95; the dashed line is the timeframe average. A rise is treated as bad."
        value={fmtMs(summary.p95Ms)}
        delta={p95Delta}
        spark={s.p95Ms}
        sparkLabels={s.labels}
        sparkColor={p95Delta?.color}
        // Per-bucket p95 in milliseconds → duration formatter.
        sparkFormatter={fmtMs}
        reference={mean(s.p95Ms)}
        referenceLabel="avg"
      />,
    ),
    kpi(
      "kpi-error",
      <KpiTile
        label="Error rate"
        info="Share of LLM requests that errored = errored requests ÷ total requests over the current timeframe (a ratio, so sampling-invariant). Sparkline is the per-bucket error rate; the dashed line is the timeframe average. This is the most sensitive KPI — a +25% swing already escalates the delta to severe (red)."
        value={fmtPercent(summary.errorRatePct)}
        delta={errDelta}
        spark={s.errorRatePct}
        sparkLabels={s.labels}
        sparkColor={errDelta?.color}
        // Per-bucket error rate is already a percent → percent formatter.
        sparkFormatter={(n) => fmtPercent(n)}
        reference={mean(s.errorRatePct)}
        referenceLabel="avg"
      />,
    ),
    kpi(
      "kpi-tokens",
      <KpiTile
        label="Tokens"
        info="Total tokens (input + output) across LLM requests in scope over the timeframe, extrapolated from the sampled population back to the full volume. Sub-line counts the distinct models and MCP servers in scope. Bars show per-bucket token volume."
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
        // Per-bucket token counts — precise grouped integer on hover (the
        // headline uses the compact fmtTokens for its cramped hero slot).
        sparkFormatter={fmtCount}
      />,
    ),
    kpi(
      "kpi-hidden",
      <KpiTile
        label="Hidden risk"
        info="HTTP-200 LLM responses that actually carry a failure signal — refusals (refusal_reason / finish_reasons contains 'refusal'), max-token truncation ('max_tokens'), content-filter blocks ('content_filter'), or other provider/guardrail markers (gen_ai.error.type / guardrail.action / moderation.action). Counts are sampled aggregates, extrapolated. Rate in the sub-line = hidden ÷ total LLM responses over the timeframe; the bar splits by category."
        loading={hidden.isLoading}
        // On error, show "—" instead of a fmtCount(0) that reads as a reassuring
        // "0 hidden failures" when the query actually failed (SUM-3).
        value={hidden.error ? "—" : fmtCount(hidden.total)}
        sub={
          hidden.error
            ? "couldn't load"
            : !hidden.isLoading && hiddenRate != null
              ? `${fmtPercent(hiddenRate)} of LLM responses`
              : "200-OK failures"
        }
        tone="risk"
        footer={
          hidden.error ? undefined : (
            <CompositionBar segments={hidden.categories} />
          )
        }
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
              {posture.isLoading && posture.trustIndex == null ? (
                // Skeleton the gauge during load — the same idiom the cards use,
                // so the hero no longer shows a bare "—" grade mid-load (SUM-10).
                <Skeleton style={{ width: 104, height: 104, borderRadius: "50%" }} />
              ) : (
              <div style={{ position: "relative" }}>
                <MiniPartialDonut
                  size={104}
                  thickness={12}
                  track
                  percent={posture.trustIndex ?? 0}
                  color={dot}
                  centerValue={posture.grade ?? "—"}
                  centerSub={posture.trustIndex != null ? String(posture.trustIndex) : undefined}
                  ariaLabel={`Fleet trust index ${posture.trustIndex ?? "unavailable"} of 100${posture.grade ? `, grade ${posture.grade}` : ""}${posture.gradeIncomplete ? " — partial, quality unmeasured" : ""}`}
                />
                {posture.gradeIncomplete && posture.grade != null && (
                  <span
                    title="This grade excludes an unmeasured pillar (quality)"
                    style={{
                      position: "absolute",
                      top: -2,
                      right: -2,
                      fontSize: 8.5,
                      fontWeight: 700,
                      letterSpacing: "0.03em",
                      textTransform: "uppercase",
                      color: "var(--amber)",
                      background: "var(--surface)",
                      border: "1px solid var(--amber)",
                      borderRadius: 999,
                      padding: "1px 5px",
                    }}
                  >
                    partial
                  </span>
                )}
              </div>
              )}
              <Flex alignItems="center" gap={4}>
                <Text style={{ fontSize: 10.5, color: "var(--text-3)" }}>trust index</Text>
                <InfoTooltip
                  text="Fleet trust grade (A–F) and its 0–100 index. Weighted blend of the health pillars — Operational 45%, Quality 35%, Cost 20% — renormalized over whichever pillars actually have data (a missing pillar is dropped, never scored 0). The index maps to a letter via academic bands (93+ = A, 83+ = B, 73+ = C, 63+ = D, else F). A 'partial' badge shows when a high-weight pillar (Quality) is unmeasured."
                  size={12}
                />
              </Flex>
              {posture.pillarsScored > 0 &&
                posture.pillarsScored < posture.pillarsTotal && (
                  <Text
                    style={{ fontSize: 9.5, color: "var(--text-3)", fontStyle: "italic" }}
                  >
                    grade from {posture.pillarsScored} of {posture.pillarsTotal} pillars
                  </Text>
                )}
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
            <Flex alignItems="center" gap={4}>
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
              <InfoTooltip
                text="The three 0–100 scores behind the grade. Operational = 100 − latency penalty ((p95 ms − 2000) ÷ 100, capped 0–60) − error penalty (error-rate% × 10, capped 0–40). Quality = average gen_ai.evaluation.* score × 100 (shows 'not measured' when no eval attributes exist). Cost = 100 − |ratio − 1| × 40 (capped 0–60), where ratio = current tokens/hour ÷ the rolling 7-day hourly baseline."
                size={12}
              />
            </Flex>
            {posture.isLoading && posture.pillarsScored === 0 ? (
              // Skeleton bars during load — one loading idiom with the cards
              // below, not the ad-hoc "Scoring pillars…" text (SUM-10).
              [0, 1, 2].map((i) => (
                <Flex key={i} alignItems="center" gap={8}>
                  <Skeleton style={{ width: 82, height: 12, borderRadius: 4 }} />
                  <Skeleton style={{ flex: 1, height: 8, borderRadius: 999 }} />
                </Flex>
              ))
            ) : posture.pillars.length > 0 ? (
              posture.pillars.map((p) => <PillarBar key={p.key} pillar={p} />)
            ) : (
              <Text style={{ fontSize: 12, color: "var(--text-3)" }}>
                No pillar data in scope.
              </Text>
            )}
          </Flex>

          {/* The 30-day spend footer line was removed — it duplicated the
              "Spend · 30d proj" KPI tile (SUM-1). */}
          <TileScanFooter group={scanGroup} opts={SUMMARY_SCAN_OPTS} />
        </Flex>
      </Surface>

      {/* KPI tiles — a movable grid of short standalone cards (drag to reorder,
          drag a corner to resize). 6-col grid, each tile spans 3 → two per row. */}
      <CustomizableGrid storageKey="kpis" columns={6} tiles={kpiTiles} />
    </div>
  );
};
