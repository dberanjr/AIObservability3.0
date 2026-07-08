import React, { useMemo } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { Donut, type DonutSlice } from "../../components/charts/Donut";
import { BarList, type BarListItem } from "../../components/charts/BarList";
import { fmtUSD, fmtUSDCompact } from "../../data/format";
import { useBedrockCost, useBedrockAccountCost } from "../../bedrock/useBedrock";
import { bedrockCostIntervalSec } from "../../bedrock/queries";
import { intervalPhrase } from "../../scope/chartInterval";
import type { BedrockScope } from "../../bedrock/types";
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

/**
 * Cost & Usage zone (D4): the signature cache-savings ghost chart, plus two
 * breakdowns of the same `daily[].byModel` data — cost SHARE by model (a
 * donut, colored identically to the chart via `buildModelColorMap`) and cost
 * BY ACCOUNT (a `BarList`, via the new `useBedrockAccountCost` hook wired
 * onto the previously-unused `buildAccountModelQuery`).
 */
export const BedrockCostZone = ({ scope }: BedrockCostZoneProps) => {
  const { daily, isLoading: costLoading } = useBedrockCost(scope);
  const { rows: accountRows, isLoading: accountLoading } = useBedrockAccountCost(scope);

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
          label: r.account || "(unknown account)",
          value: r.cost,
          displayValue: fmtUSD(r.cost),
          secondary: r.blended ? "includes an estimated-rate model" : undefined,
        })),
    [accountRows],
  );

  const costInitial = costLoading && daily.length === 0;
  const accountInitial = accountLoading && accountRows.length === 0;
  const modelTotal = modelSlices.reduce((s, x) => s + x.value, 0);
  // Same ladder the daily-cost query builder (bedrock/queries.ts) keys the
  // chart's own bucket width off of — surfaced here purely for the "N
  // buckets" title suffix, so the wording doesn't lie about granularity now
  // that it's adaptive instead of a fixed "Daily".
  const intervalSec = bedrockCostIntervalSec(scope.timeframe.from);

  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={16}>
        <Flex flexDirection="column" gap={2}>
          <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
            Cost by model over time — with cache-savings ghost · {intervalPhrase(intervalSec)} buckets
          </Heading>
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            Stacked by model; the hatched cap is the counterfactual spend that caching avoided that
            day (savedByCache re-priced as full-cost input).
          </Text>
        </Flex>

        <BedrockCostChart daily={daily} isLoading={costLoading} />

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
            <Heading level={4} style={{ fontSize: 12.5, fontWeight: 600 }}>
              Cost share by model
            </Heading>
            {costInitial ? (
              <Skeleton style={{ height: 140, borderRadius: 8 }} />
            ) : modelSlices.length === 0 ? (
              <Text style={{ fontSize: 12, color: "var(--text-3)" }}>No model spend in this scope.</Text>
            ) : (
              <Donut
                slices={modelSlices}
                centerValue={fmtUSDCompact(modelTotal)}
                centerLabel="total"
                valueFormatter={(n) => fmtUSD(n)}
              />
            )}
          </Flex>

          <Flex flexDirection="column" gap={8}>
            <Heading level={4} style={{ fontSize: 12.5, fontWeight: 600 }}>
              Cost by account
            </Heading>
            {accountInitial ? (
              <Skeleton style={{ height: 140, borderRadius: 8 }} />
            ) : accountItems.length === 0 ? (
              <Text style={{ fontSize: 12, color: "var(--text-3)" }}>
                No per-account cost in this scope.
              </Text>
            ) : (
              <BarList items={accountItems} color="var(--blue)" limit={10} />
            )}
          </Flex>
        </div>
      </Flex>
    </Surface>
  );
};
