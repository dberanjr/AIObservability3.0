import React, { useMemo } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { AreaChart, type AxisTick } from "../../components/charts/AreaChart";
import { InfoTooltip } from "../../components/InfoTooltip";
import { fmtCount } from "../../data/format";
import type { McpActivitySeries } from "./useMcpHealth";

export interface McpActivityChartProps {
  series: McpActivitySeries;
  isLoading: boolean;
}

/**
 * Hourly MCP server request volume (filled area, primary axis) with the error
 * count on a secondary axis so a small error burst stands out against large
 * request volume. Matches the dual-axis pattern used by the Token Consumption
 * chart for visual consistency.
 */
export const McpActivityChart = ({ series, isLoading }: McpActivityChartProps) => {
  const axisTicks = useMemo<AxisTick[]>(() => {
    const len = series.labels.length;
    if (len <= 1) return [];
    const count = Math.min(6, len);
    return Array.from({ length: count }, (_, k) => {
      const idx = Math.round((k / (count - 1)) * (len - 1));
      return { index: idx, label: series.labels[idx] ?? "" };
    });
  }, [series.labels]);

  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={12}>
        <Flex flexDirection="column" gap={2}>
          <Flex alignItems="center" gap={6}>
            <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
              MCP activity and errors
            </Heading>
            <InfoTooltip text="MCP server request volume per bucket on the left axis, error count on the right axis. The error scale is independent so a small error burst stays visible against high request volume. Counts are extrapolated to the unsampled population when sampling is on." />
          </Flex>
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            Requests and errors per bucket · {series.intervalLabel} buckets
          </Text>
        </Flex>

        {isLoading ? (
          <Skeleton style={{ height: 280 }} />
        ) : series.mcpServerCalls.length <= 1 ? (
          <Flex
            alignItems="center"
            justifyContent="center"
            style={{ height: 280, color: "var(--text-3)", fontSize: 12 }}
          >
            Not enough data points to plot a trend in this window.
          </Flex>
        ) : (
          <AreaChart
            height={280}
            formatLeft={(n) => fmtCount(Math.round(n))}
            formatRight={(n) => fmtCount(Math.round(n))}
            xLabels={series.labels}
            axisTicks={axisTicks}
            series={[
              {
                label: "MCP requests",
                color: "var(--blue)",
                values: series.mcpServerCalls,
                axis: "left",
              },
              {
                label: "Errors",
                color: "var(--red)",
                values: series.errors,
                axis: "right",
              },
            ]}
          />
        )}
      </Flex>
    </Surface>
  );
};
