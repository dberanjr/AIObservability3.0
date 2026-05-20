import React, { useMemo } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { AreaChart } from "../../components/charts/AreaChart";
import { fmtTokens, fmtUSDCompact } from "../../data/format";
import type { UseTokenConsumptionResult } from "./useTokenConsumption";

/**
 * Build a friendly "Xm ago" / "Xh ago" label for each timeseries bucket so
 * the AreaChart cursor tooltip can show where in the window the cursor sits.
 */
const buildRelativeLabels = (
  pointCount: number,
  intervalMs: number,
): string[] => {
  const totalMs = pointCount * intervalMs;
  return Array.from({ length: pointCount }, (_, i) => {
    const agoMs = totalMs - i * intervalMs;
    if (agoMs < 60_000) return "just now";
    if (agoMs < 3_600_000) return `${Math.round(agoMs / 60_000)}m ago`;
    if (agoMs < 86_400_000) return `${Math.round(agoMs / 3_600_000)}h ago`;
    return `${Math.round(agoMs / 86_400_000)}d ago`;
  });
};

export interface TokenConsumptionChartProps {
  result: UseTokenConsumptionResult;
}

export const TokenConsumptionChart = ({ result }: TokenConsumptionChartProps) => {
  const xLabels = useMemo(
    () => buildRelativeLabels(result.points.length, result.intervalMs),
    [result.points.length, result.intervalMs],
  );

  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={12}>
        <Flex alignItems="baseline" justifyContent="space-between">
          <Flex flexDirection="column" gap={2}>
            <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
              Token consumption
            </Heading>
            <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
              Tokens (solid) · Est. cost (dashed, right axis)
            </Text>
          </Flex>
          <Flex alignItems="baseline" gap={12}>
            <Text style={{ fontSize: 11.5, color: "var(--text-2)" }}>
              <strong>{fmtTokens(result.totalTokens)}</strong> tokens
            </Text>
            <Text style={{ fontSize: 11.5, color: "var(--text-2)" }}>
              <strong>{fmtUSDCompact(result.totalCost)}</strong> blended est.
            </Text>
          </Flex>
        </Flex>

        {result.isLoading ? (
          <Skeleton style={{ height: 220 }} />
        ) : result.points.length === 0 ? (
          <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
            No data in the current scope.
          </Text>
        ) : (
          <AreaChart
            height={220}
            formatLeft={(n) => fmtTokens(n)}
            formatRight={(n) => fmtUSDCompact(n)}
            xLabels={xLabels}
            series={[
              {
                label: "Tokens",
                color: "var(--blue)",
                values: result.points.map((p) => p.tokens),
                axis: "left",
              },
              {
                label: "Est. cost",
                color: "var(--purple)",
                values: result.points.map((p) => p.estCost),
                axis: "right",
                dashed: true,
              },
            ]}
          />
        )}
      </Flex>
    </Surface>
  );
};
