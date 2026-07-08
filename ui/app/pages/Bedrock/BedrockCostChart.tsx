import React, { useMemo, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { EmptyState } from "../../components/EmptyState";
import { SR_ONLY } from "../../components/charts/AreaChart";
import { CATEGORICAL } from "../../theme/palette";
import { STATUS_COLOR } from "../../theme/statusColor";
import { fmtUSD, fmtUSDCompact } from "../../data/format";
import type { BedrockDailyCostPoint } from "../../bedrock/series";
import { toGhostBars } from "./geometry";

const CHART_H = 200;
const AXIS_W = 38;

/** Sum of every day's `byModel` cost, across the whole series — the shared
 *  aggregate the color map, legend, and cost-share donut (BedrockCostZone)
 *  all key off, so a model is the same slice of the same color everywhere it
 *  appears. */
export const modelTotals = (daily: BedrockDailyCostPoint[]): Map<string, number> => {
  const totals = new Map<string, number>();
  for (const day of daily) {
    for (const [model, value] of Object.entries(day.byModel)) {
      totals.set(model, (totals.get(model) ?? 0) + value);
    }
  }
  return totals;
};

/**
 * Deterministic model → color map: the biggest spenders (by total $ across
 * the whole series) get the front of the shared categorical ramp
 * (theme/palette.ts). This is the SAME palette + "biggest series first"
 * assignment technique Summary/FinOpsCard uses to color its own "stacked
 * daily-cost bars, stacked by model" tile (see `SERIES_COLORS` +
 * `colorFor(i)` there) — reused here rather than invented fresh, since
 * Bedrock model keys (`shortModelName`, vendor prefix already stripped)
 * don't carry a `gen_ai.provider.name` to key a provider-hue map off of the
 * way `Models/finopsLogic.assignSeriesColors` does.
 *
 * Exported so BedrockCostZone's cost-share donut can build the identical
 * map — a model must render as the same color in the bars, the legend, AND
 * the donut.
 */
export const buildModelColorMap = (daily: BedrockDailyCostPoint[]): Map<string, string> => {
  const ordered = [...modelTotals(daily).entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([model]) => model);
  const map = new Map<string, string>();
  ordered.forEach((model, i) => map.set(model, CATEGORICAL[i % CATEGORICAL.length]));
  return map;
};

const DATE_ONLY_RE = /^\d{4}-(\d{2})-(\d{2})$/;
const DATE_TIME_RE = /^\d{4}-(\d{2})-(\d{2}) (\d{2}:\d{2})$/;

/**
 * "2026-07-05" -> "7/5" (day-or-longer buckets, unchanged). Sub-day buckets
 * come through as "2026-07-05 14:30" (see `foldDailyCost`) — the AXIS needs
 * a compact label (just the time; the date rarely earns its width once
 * labels are thinned to ~12), while the TOOLTIP header needs the fuller
 * "7/5 14:30" so a reader can tell which bucket they're looking at even
 * across a multi-day, sub-day-interval scope. Falls through unchanged for
 * the index-based fallback labels `foldDailyCost` emits when the query has
 * no time axis.
 */
const shortDay = (iso: string, mode: "axis" | "tooltip" = "tooltip"): string => {
  const dateOnly = DATE_ONLY_RE.exec(iso);
  if (dateOnly) return `${Number(dateOnly[1])}/${Number(dateOnly[2])}`;
  const dateTime = DATE_TIME_RE.exec(iso);
  if (dateTime) {
    const [, mm, dd, time] = dateTime;
    return mode === "axis" ? time : `${Number(mm)}/${Number(dd)} ${time}`;
  }
  return iso;
};

// Theme-neutral hatch: a translucent diagonal `repeating-linear-gradient`
// over a faint fill, capped with a dashed top border — reads as "the bar
// that isn't really there" in both light and dark themes because every
// color is `color-mix(...)` against the existing `--text-*` tokens rather
// than a fixed hex, so it inherits the theme's actual contrast instead of
// fighting it. Deliberately quiet (~half the visual weight of an earlier,
// more prominent pass): a sparse, thin hatch over a barely-there fill and a
// faint hairline border — a hint the counterfactual is there, not a bar that
// competes with the real (solid) spend beneath it.
const GHOST_LINE = "color-mix(in oklab, var(--text-3) 20%, transparent)";
const GHOST_FILL = "color-mix(in oklab, var(--text-3) 7%, transparent)";
const ghostStyle: React.CSSProperties = {
  backgroundColor: GHOST_FILL,
  backgroundImage: `repeating-linear-gradient(135deg, ${GHOST_LINE} 0px, ${GHOST_LINE} 1px, transparent 1px, transparent 10px)`,
  borderTop: `1px dashed ${GHOST_LINE}`,
};

export interface BedrockCostChartProps {
  daily: BedrockDailyCostPoint[];
  isLoading: boolean;
  /** Whether to render the cache-savings "ghost" cap at all. Defaults to
   *  `true` (existing behavior). When `false`, bars scale against actual
   *  spend alone, no ghost segment/legend swatch/tooltip line renders — see
   *  `toGhostBars`'s `includeGhost` param, which this threads into. */
  showGhost?: boolean;
}

/**
 * The signature Bedrock visualization (D4): one column per day, stacked by
 * model cost, capped with a translucent hatched "ghost" bar representing
 * `savedByCache` — the counterfactual spend the cache absorbed. Geometry
 * (which px each segment/ghost gets) is pure and lives in `geometry.ts`;
 * this component only assigns color, lays out the columns, and renders the
 * hover tooltip / legend / keyboard nav around that geometry.
 *
 * Column stacking: each column is `flexDirection: "column-reverse"` with
 * children in `bar.segments` order followed by the ghost — column-reverse
 * packs children from the BOTTOM up in DOM order, so `segments[0]` (the
 * same model every day, since `foldDailyCost` iterates the same query rows
 * in the same order per bucket) always sits on the axis, and the ghost
 * always ends up on top.
 */
export const BedrockCostChart = ({ daily, isLoading, showGhost = true }: BedrockCostChartProps) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [srText, setSrText] = useState("");

  const colorFor = useMemo(() => buildModelColorMap(daily), [daily]);
  const bars = useMemo(() => toGhostBars(daily, CHART_H, showGhost), [daily, showGhost]);
  const max = useMemo(
    () => Math.max(0, ...daily.map((d) => (showGhost ? d.actual + d.savedByCache : d.actual))),
    [daily, showGhost],
  );

  if (isLoading && daily.length === 0) {
    return <Skeleton style={{ height: CHART_H + 64, borderRadius: 8 }} />;
  }
  if (daily.length === 0) {
    return (
      <EmptyState
        bare
        title="No cost data in this scope"
        description="No costable Bedrock token usage was found in the current scope."
        hint="Data is folded from the cost timeseries query — widen the timeframe or check that priced/estimable models are in use."
      />
    );
  }

  const legendModels = [...colorFor.entries()];

  const readoutFor = (idx: number): string => {
    const d = daily[idx];
    if (!d) return "";
    const parts = [`${shortDay(d.day)}, actual ${fmtUSD(d.actual)}`];
    Object.entries(d.byModel)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .forEach(([model, v]) => parts.push(`${model} ${fmtUSD(v)}`));
    if (showGhost && d.savedByCache > 0) parts.push(`saved by caching ${fmtUSD(d.savedByCache)}`);
    return parts.join(", ");
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const n = bars.length;
    if (n === 0) return;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = Math.min(n - 1, (hoverIdx ?? -1) + 1);
    else if (e.key === "ArrowLeft") next = Math.max(0, (hoverIdx ?? n) - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    else if (e.key === "Escape") {
      setHoverIdx(null);
      setSrText("");
      return;
    } else return;
    e.preventDefault();
    setHoverIdx(next);
    setSrText(readoutFor(next));
  };

  const onBlur = () => {
    setHoverIdx(null);
    setSrText("");
  };

  const hovered = hoverIdx != null ? daily[hoverIdx] : null;

  // Thin the x-axis labels to ~10-12 so they don't overlap once a short
  // scope's finer interval produces 30-120+ buckets — every bucket still
  // gets a bar, just not every bucket gets a label.
  const axisLabelStep = Math.max(1, Math.ceil(daily.length / 12));

  return (
    <Flex flexDirection="column" gap={12}>
      <div
        role="img"
        aria-label={`Bedrock cost by model over time${
          showGhost ? " with cache-savings ghost" : ""
        }, ${daily.length} time buckets, ${fmtUSD(
          daily.reduce((s, d) => s + d.actual, 0),
        )} total. Use arrow keys to move between time buckets.`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        style={{ position: "relative" }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          {/* Y axis: 0 / half / max labels against the SAME max toGhostBars scaled to. */}
          <div style={{ position: "relative", width: AXIS_W, height: CHART_H, flex: "0 0 auto" }}>
            {[1, 0.5, 0].map((f) => (
              <Text
                key={f}
                style={{
                  position: "absolute",
                  right: 4,
                  top: CHART_H * (1 - f) - 6,
                  fontSize: 9,
                  color: "var(--text-3)",
                  fontFamily: "var(--mono, monospace)",
                }}
              >
                {fmtUSDCompact(max * f)}
              </Text>
            ))}
          </div>

          <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
            {/* Gridlines */}
            {[0, 0.5, 1].map((f) => (
              <div
                key={f}
                aria-hidden
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: CHART_H * (1 - f),
                  borderTop: "1px solid var(--border)",
                }}
              />
            ))}

            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: 4,
                height: CHART_H,
                position: "relative",
              }}
              onMouseLeave={() => setHoverIdx(null)}
            >
              {bars.map((bar, idx) => (
                <div
                  key={bar.day}
                  onMouseEnter={() => setHoverIdx(idx)}
                  style={{
                    flex: "1 1 0",
                    minWidth: 4,
                    height: CHART_H,
                    display: "flex",
                    flexDirection: "column-reverse",
                    cursor: "pointer",
                    opacity: hoverIdx == null || hoverIdx === idx ? 1 : 0.5,
                  }}
                >
                  {bar.segments.map((seg) =>
                    seg.px > 0 ? (
                      <div
                        key={seg.key}
                        style={{ height: seg.px, background: colorFor.get(seg.key) ?? "var(--text-4)" }}
                      />
                    ) : null,
                  )}
                  {bar.ghostPx > 0 && <div style={{ height: bar.ghostPx, ...ghostStyle }} />}
                </div>
              ))}
            </div>

            {hovered && hoverIdx != null && (
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  minWidth: 180,
                  padding: "8px 10px",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  boxShadow: "var(--shadow, 0 2px 8px rgba(0,0,0,0.14))",
                  pointerEvents: "none",
                  zIndex: 2,
                }}
              >
                <Flex flexDirection="column" gap={4}>
                  <Text style={{ fontSize: 11.5, fontWeight: 600 }}>{shortDay(hovered.day)}</Text>
                  <Text style={{ fontSize: 11, color: "var(--text-2)" }}>
                    Actual {fmtUSD(hovered.actual)}
                  </Text>
                  {Object.entries(hovered.byModel)
                    .filter(([, v]) => v > 0)
                    .sort((a, b) => b[1] - a[1])
                    .map(([model, v]) => (
                      <Flex key={model} alignItems="center" gap={6}>
                        <span
                          aria-hidden
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 2,
                            background: colorFor.get(model) ?? "var(--text-4)",
                            flex: "0 0 auto",
                          }}
                        />
                        <Text
                          style={{
                            fontSize: 11,
                            flex: 1,
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {model}
                        </Text>
                        <Text style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
                          {fmtUSD(v)}
                        </Text>
                      </Flex>
                    ))}
                  {showGhost && hovered.savedByCache > 0 && (
                    <Text style={{ fontSize: 11, color: STATUS_COLOR.good, fontWeight: 600 }}>
                      − {fmtUSD(hovered.savedByCache)} saved by caching
                    </Text>
                  )}
                </Flex>
              </div>
            )}

            {/* X axis labels — thinned to axisLabelStep so they don't overlap
                at high bucket counts; every bucket still gets a bar. */}
            <div style={{ display: "flex", gap: 4, paddingTop: 4 }}>
              {daily.map((d, i) => (
                <Text
                  key={d.day}
                  style={{
                    flex: "1 1 0",
                    minWidth: 4,
                    fontSize: 9,
                    textAlign: "center",
                    color: hoverIdx === i ? "var(--text)" : "var(--text-3)",
                    fontFamily: "var(--mono, monospace)",
                  }}
                >
                  {i % axisLabelStep === 0 ? shortDay(d.day, "axis") : ""}
                </Text>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Flex gap={12} style={{ flexWrap: "wrap" }}>
        {legendModels.map(([model, color]) => (
          <Flex key={model} alignItems="center" gap={4}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: color, flex: "0 0 auto" }} />
            <Text style={{ fontSize: 11, color: "var(--text-3)" }}>{model}</Text>
          </Flex>
        ))}
        {showGhost && (
          <Flex alignItems="center" gap={4}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, flex: "0 0 auto", ...ghostStyle }} />
            <Text style={{ fontSize: 11, color: "var(--text-3)" }}>Saved by caching</Text>
          </Flex>
        )}
      </Flex>

      {/* Keyboard-cursor readout — mirrors AreaChart / DailyCostStackedBar. */}
      <div aria-live="polite" style={SR_ONLY}>
        {srText}
      </div>
    </Flex>
  );
};
