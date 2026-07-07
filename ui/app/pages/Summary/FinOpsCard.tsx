import React, { useEffect, useRef, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { BarList, type BarListItem } from "../../components/charts/BarList";
import { fmtUSDCompact } from "../../data/format";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { SummaryCard } from "./SummaryCard";
import { useModelConcentration } from "./useModelConcentration";
import { useFinOps, type DailyCostSummary } from "../Models/useFinOps";
import { CATEGORICAL } from "../../theme/palette";

// Shared, perceptually-spaced categorical ramp (theme/palette.ts). Fixed hexes
// so the accent Tweak can't collapse adjacent stacked-bar segments onto one hue
// (UX report Chart-3/4).
const SERIES_COLORS = CATEGORICAL;

/**
 * Compact stacked daily-cost bars (last 7 days, stacked by model) — a slim
 * inline version of the Models tab's DailyCostStackedBar so it nests inside the
 * FinOps summary tile without card-in-card chrome. Reads the same
 * useFinOps().daily data.
 */
const StackedDailyBars = ({
  daily,
  isLoading,
}: {
  daily: DailyCostSummary;
  isLoading: boolean;
}) => {
  // Custom hover tooltip with a short reveal delay (~150ms) — native `title`
  // tooltips take ~half a second to appear, which reads as sluggish. This
  // matches the delay the SVG charts use so every hover on the page feels the
  // same.
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [tipReady, setTipReady] = useState(false);
  const tipTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (hoverIdx == null) {
      window.clearTimeout(tipTimer.current);
      setTipReady(false);
      return;
    }
    if (tipReady) return;
    tipTimer.current = window.setTimeout(() => setTipReady(true), 150);
    return () => window.clearTimeout(tipTimer.current);
  }, [hoverIdx, tipReady]);

  if (isLoading && daily.totals.length === 0) {
    return <Skeleton style={{ height: "100%", minHeight: 96, borderRadius: 6 }} />;
  }
  const max = Math.max(1, ...daily.totals);
  const colorFor = (i: number) => SERIES_COLORS[i % SERIES_COLORS.length];
  return (
    // Fills the vertical space the tile gives it (flex:1 from the parent), so
    // the bars grow with the card instead of leaving a band of dead space.
    <Flex flexDirection="column" gap={6} style={{ height: "100%", minHeight: 0 }}>
      <Flex
        alignItems="flex-end"
        gap={6}
        style={{ flex: 1, minHeight: 0, position: "relative" }}
      >
        {daily.totals.map((total, dayIdx) => (
          <Flex
            key={dayIdx}
            flexDirection="column"
            justifyContent="flex-end"
            onMouseEnter={() => setHoverIdx(dayIdx)}
            onMouseLeave={() => setHoverIdx((cur) => (cur === dayIdx ? null : cur))}
            style={{ flex: 1, height: "100%", cursor: "default" }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column-reverse",
                height: `${(total / max) * 100}%`,
                borderRadius: 3,
                overflow: "hidden",
                minHeight: total > 0 ? 2 : 0,
                outline:
                  hoverIdx === dayIdx
                    ? "1px solid var(--border-emphasized, var(--text-3))"
                    : "none",
                outlineOffset: 1,
              }}
            >
              {daily.series.map((s, i) => {
                const v = s.values[dayIdx] ?? 0;
                if (v <= 0) return null;
                return (
                  <div
                    key={s.model}
                    style={{
                      height: `${(v / total) * 100}%`,
                      background: colorFor(i),
                    }}
                  />
                );
              })}
            </div>
          </Flex>
        ))}
        {hoverIdx != null && tipReady && (
          <div
            role="tooltip"
            style={{
              position: "absolute",
              top: 0,
              left: `${((hoverIdx + 0.5) / Math.max(1, daily.totals.length)) * 100}%`,
              transform: "translateX(-50%)",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "4px 8px",
              fontSize: 11,
              color: "var(--text)",
              fontVariantNumeric: "tabular-nums",
              pointerEvents: "none",
              whiteSpace: "nowrap",
              boxShadow: "var(--shadow, 0 2px 8px rgba(0,0,0,0.06))",
              zIndex: 2,
            }}
          >
            <span style={{ color: "var(--text-3)" }}>
              {daily.dayLabels[hoverIdx] ?? ""}
            </span>
            {" · "}
            <span style={{ fontWeight: 600 }}>
              {fmtUSDCompact(daily.totals[hoverIdx])}
            </span>
          </div>
        )}
      </Flex>
      <Text style={{ fontSize: 10, color: "var(--text-3)" }}>
        Daily cost by model · last 7 days
      </Text>
    </Flex>
  );
};

/**
 * FinOps summary tile: model cost-concentration donut (derived from the priced
 * ModelRow set) + a compact daily-cost-by-model stacked bar + an
 * estimated-savings callout (useFinOps.possibleSavings, from model right-sizing).
 * Every figure flows through the cache-aware cost model. Drills to Models/FinOps.
 */
export const FinOpsCard = () => {
  const conc = useModelConcentration();
  const finops = useFinOps();

  const items: BarListItem[] = conc.slices.map((s) => ({
    key: s.key,
    label: s.label,
    value: s.cost,
    displayValue: fmtUSDCompact(s.cost),
    secondary: `${s.sharePct.toFixed(1)}% of spend`,
    filter:
      s.key === "__others__"
        ? undefined
        : { attribute: "gen_ai.request.model", values: s.rawModels, label: s.label },
  }));
  const colorByKey = new Map(conc.slices.map((s) => [s.key, s.color]));

  return (
    <SummaryCard
      title="Spend · FinOps"
      info="Model spend concentration for the current timeframe: each model's effective spend priced per-model through the cost model, top models ranked by share of total (the rest folded into 'Others'). The bars below show per-model daily cost over the last 7 days (heavy per-day scans run sampled and extrapolate). The 'save ~$/mo' pill estimates shifting an expensive service to its cheapest same-type peer — fires when a service's blended $/MTok is > 3× the cheapest peer and assumes it could halve its rate."
      drill={{ label: "Models", to: "/models" }}
    >
      <Flex flexDirection="column" gap={16} style={{ height: "100%" }}>
        {conc.isLoading && items.length === 0 ? (
          <Skeleton style={{ height: 130, borderRadius: 8 }} />
        ) : conc.error ? (
          <ErrorState bare error={conc.error} />
        ) : items.length === 0 ? (
          <EmptyState
            bare
            title="No priced model spend in scope"
            description="No spans matched a priced model for this timeframe and scope — needs gen_ai.request.model plus a known price in the model catalog."
          />
        ) : (
          <Flex flexDirection="column" gap={8}>
            <Flex alignItems="baseline" gap={6}>
              <span
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: "var(--text)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {fmtUSDCompact(conc.totalCost)}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-3)" }}>spend</span>
            </Flex>
            <BarList
              items={items}
              color={(item) => colorByKey.get(item.key) ?? "var(--blue)"}
            />
          </Flex>
        )}

        <div style={{ flex: 1, minHeight: 96 }}>
          {finops.error ? (
            // The daily-cost bars have their own query — surface its error
            // rather than rendering an empty bar band as if spend were $0 (SUM-3).
            <ErrorState bare error={finops.error} />
          ) : (
            <StackedDailyBars daily={finops.daily} isLoading={finops.isLoading} />
          )}
        </div>

        {!finops.isLoading && finops.possibleSavings > 0 && (
          <Flex alignItems="center" gap={12}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "var(--surface)",
                background: "var(--green-2)",
                borderRadius: 999,
                padding: "4px 10px",
                whiteSpace: "nowrap",
              }}
            >
              save ~{fmtUSDCompact(finops.possibleSavings)}/mo
            </span>
            <Text style={{ fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.3 }}>
              Estimated from model right-sizing across high-$/token services.
            </Text>
          </Flex>
        )}
      </Flex>
    </SummaryCard>
  );
};
