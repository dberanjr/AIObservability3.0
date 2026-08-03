import React, { useMemo, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { Donut, type DonutSlice } from "../../components/charts/Donut";
import { BarList, type BarListItem } from "../../components/charts/BarList";
import { MaximizablePanel } from "../../components/MaximizablePanel";
import { fmtAccount, fmtUSDPrecise, fmtUSDCompact, fmtPercent } from "../../data/format";
import { useBedrockCost, useBedrockAccountCost } from "../../bedrock/useBedrock";
import { bedrockCostIntervalSec } from "../../bedrock/queries";
import { intervalPhrase } from "../../scope/chartInterval";
import type { BedrockScope } from "../../bedrock/types";
import { useAccountNames } from "../../scope/AccountNamesContext";
import { BedrockCostChart, buildModelColorMap, modelTotals } from "./BedrockCostChart";

export interface BedrockCostZoneProps {
  scope: BedrockScope;
}

// Cap the donut at the top spenders + an "Other" rollup — a 15-slice donut is
// unreadable, but the chart above still shows every model (bounded in
// practice by how many Bedrock models an org actually calls). Mirrors the
// topN + "Other" rollup pattern Models/finopsLogic.groupConcentration uses
// for the same shape of problem.
const TOP_MODELS = 7;

const SUBHEAD: React.CSSProperties = { fontSize: 12.5, fontWeight: 600 };

/**
 * Cost & Usage zone (D4): the signature cache-savings ghost chart, plus two
 * breakdowns of the same `daily[].byModel` data — cost SHARE by model (a
 * donut, colored identically to the chart via `buildModelColorMap`) and cost
 * BY ACCOUNT (a `BarList`, via the new `useBedrockAccountCost` hook wired
 * onto the previously-unused `buildAccountModelQuery`). Wrapped in
 * MaximizablePanel for a full-screen focused view; the show/hide ghost
 * toggle rides in the panel header via `headerRight`. The BedrockCostChart
 * itself (a custom stacked-bar, not an AreaChart) and the donut/breakdown are
 * unchanged — only the donut size and BarList limit scale up when expanded.
 */
export const BedrockCostZone = ({ scope }: BedrockCostZoneProps) => {
  const { daily, summary, isLoading: costLoading } = useBedrockCost(scope);
  const { rows: accountRows, isLoading: accountLoading } = useBedrockAccountCost(scope);
  const { names: accountNames } = useAccountNames();
  const [showGhost, setShowGhost] = useState(true);

  const modelSlices = useMemo<DonutSlice[]>(() => {
    const colorFor = buildModelColorMap(daily);
    const sorted = [...modelTotals(daily).entries()]
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);
    const head = sorted.slice(0, TOP_MODELS);
    const tail = sorted.slice(TOP_MODELS);
    const slices: DonutSlice[] = head.map(([model, value]) => ({
      key: model,
      label: model,
      value,
      color: colorFor.get(model) ?? "var(--text-4)",
    }));
    if (tail.length > 0) {
      slices.push({
        key: "other",
        label: `Other (${tail.length})`,
        value: tail.reduce((s, [, v]) => s + v, 0),
        color: "var(--text-4)",
      });
    }
    return slices;
  }, [daily]);

  const accountItems = useMemo<BarListItem[]>(
    () =>
      accountRows
        .filter((r) => r.cost > 0)
        .slice(0, 10)
        .map((r) => ({
          key: r.account || "(unknown account)",
          label: fmtAccount(r.account, accountNames[r.account]) || "(unknown account)",
          value: r.cost,
          displayValue: fmtUSDPrecise(r.cost),
          secondary: r.blended ? "includes an estimated-rate model" : undefined,
        })),
    [accountRows, accountNames],
  );

  const costInitial = costLoading && daily.length === 0;
  const accountInitial = accountLoading && accountRows.length === 0;
  const modelTotal = modelSlices.reduce((s, x) => s + x.value, 0);
  // Same ladder the daily-cost query builder (bedrock/queries.ts) keys the
  // chart's own bucket width off of — surfaced here purely for the "N
  // buckets" title suffix, so the wording doesn't lie about granularity now
  // that it's adaptive instead of a fixed "Daily".
  const intervalSec = bedrockCostIntervalSec(scope.timeframe.from);

  // modelSlices' "Other" rollup (if any) is always appended after the
  // sorted head, so index 0 is always the top real model, never "other".
  const topModel = modelSlices[0];
  const topModelShare = topModel && modelTotal > 0 ? topModel.value / modelTotal : null;
  const stats = [
    { label: "Total spend", value: fmtUSDPrecise(summary.total) },
    ...(topModel
      ? [{ label: "Top model", value: topModel.label, sub: topModelShare != null ? `${fmtPercent(topModelShare * 100)} of spend` : undefined }]
      : []),
    ...(summary.savedByCache > 0 ? [{ label: "Cache savings", value: fmtUSDPrecise(summary.savedByCache) }] : []),
  ];

  const toggle = (
    <Flex alignItems="center" gap={8}>
      <Text
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--text-3)",
        }}
      >
        Cache savings
      </Text>
      <div
        role="radiogroup"
        aria-label="Cache savings ghost overlay"
        style={{
          display: "inline-flex",
          padding: 2,
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: 999,
          flex: "0 0 auto",
        }}
      >
        {(
          [
            { value: true, label: "Shown" },
            { value: false, label: "Hidden" },
          ] as const
        ).map((opt) => {
          const active = showGhost === opt.value;
          return (
            <button
              key={String(opt.value)}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setShowGhost(opt.value)}
              style={{
                all: "unset",
                cursor: "pointer",
                padding: "3px 10px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: active ? 600 : 500,
                color: active ? "var(--text)" : "var(--text-2)",
                background: active ? "var(--surface)" : "transparent",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </Flex>
  );

  const body = (expanded: boolean) => {
    const donutSize = expanded ? 200 : 140;
    const barLimit = expanded ? 20 : 10;
    return (
      <Flex flexDirection="column" gap={16}>
        <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
          {showGhost
            ? "Stacked by model; the hatched cap is the counterfactual spend that caching avoided that day (savedByCache re-priced as full-cost input)."
            : "Stacked by model."}
        </Text>

        <BedrockCostChart daily={daily} isLoading={costLoading} showGhost={showGhost} />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
            gap: 24,
            paddingTop: 16,
            borderTop: "1px solid var(--border)",
          }}
        >
          <Flex flexDirection="column" gap={8}>
            <Heading level={4} style={SUBHEAD}>
              Cost share by model
            </Heading>
            {costInitial ? (
              <Skeleton style={{ height: 140, borderRadius: 8 }} />
            ) : modelSlices.length === 0 ? (
              <Text style={{ fontSize: 12, color: "var(--text-3)" }}>No model spend in this scope.</Text>
            ) : (
              <Donut
                slices={modelSlices}
                size={donutSize}
                centerValue={fmtUSDCompact(modelTotal)}
                centerLabel="total"
                valueFormatter={(n) => fmtUSDPrecise(n)}
              />
            )}
          </Flex>

          <Flex flexDirection="column" gap={8}>
            <Heading level={4} style={SUBHEAD}>
              Cost by account
            </Heading>
            {accountInitial ? (
              <Skeleton style={{ height: 140, borderRadius: 8 }} />
            ) : accountItems.length === 0 ? (
              <Text style={{ fontSize: 12, color: "var(--text-3)" }}>
                No per-account cost in this scope.
              </Text>
            ) : (
              <BarList items={accountItems} color="var(--blue)" limit={barLimit} />
            )}
          </Flex>
        </div>
      </Flex>
    );
  };

  return (
    <MaximizablePanel
      title={`Cost by model over time${showGhost ? " — with cache-savings ghost" : ""} · ${intervalPhrase(intervalSec)} buckets`}
      subtitle="Stacked spend by model, cache-savings ghost, and the same cost broken down by share and by account."
      stats={stats}
      headerRight={toggle}
      expanded={body(true)}
    >
      {body(false)}
    </MaximizablePanel>
  );
};
