import React, { useMemo } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { Histogram } from "../../components/charts/Histogram";
import type { ChartTimeDomain } from "../../components/charts/AreaChart";
import {
  ChartModal,
  useChartExpander,
} from "../../components/charts/ChartExpander";
import { InfoTooltip } from "../../components/InfoTooltip";
import { fmtCount } from "../../data/format";
import { useScope } from "../../scope/ScopeContext";
import type { UseActivityHistogramResult } from "./useActivityHistogram";

const formatHour = (h: number): string => {
  if (h === 0) return "12a";
  if (h === 12) return "12p";
  return h > 12 ? `${h - 12}p` : `${h}a`;
};

export interface ActivityHistogramPanelProps {
  result: UseActivityHistogramResult;
}

export const ActivityHistogramPanel = ({ result }: ActivityHistogramPanelProps) => {
  const { setTimeframe } = useScope();
  const bars = result.buckets.map((b) => ({
    label: formatHour(b.hour),
    value: b.requests,
    highlighted: result.peakHour != null && b.hour === result.peakHour,
  }));

  // Histogram is fixed to "last 24 hours" — domain anchors there so brush
  // emits the correct ISO range regardless of the scope's active timeframe.
  const xDomain: ChartTimeDomain = useMemo(() => {
    const now = Date.now();
    return { startMs: now - 24 * 60 * 60 * 1000, endMs: now };
  }, []);

  const expander = useChartExpander();
  const stats = useMemo(() => {
    if (bars.length === 0) return [];
    const values = bars.map((b) => b.value);
    const total = values.reduce((a, b) => a + b, 0);
    const min = values.reduce((a, b) => Math.min(a, b), Infinity);
    const max = values.reduce((a, b) => Math.max(a, b), -Infinity);
    const avg = total / values.length;
    return [
      { label: "Total requests", value: fmtCount(total) },
      {
        label: "Peak",
        value:
          result.peakHour != null
            ? `${fmtCount(result.peakRequests)} req`
            : "—",
        sub: result.peakHour != null ? formatHour(result.peakHour) : undefined,
      },
      { label: "Quietest hour", value: fmtCount(min) },
      { label: "Avg per hour", value: fmtCount(avg) },
      { label: "Max per hour", value: fmtCount(max) },
    ];
  }, [bars, result.peakHour, result.peakRequests]);

  const renderChart = (height: number) => (
    <Histogram
      bars={bars}
      height={height}
      valueFormatter={(n) => `${fmtCount(n)} req`}
      xDomain={xDomain}
      onBrushSelect={(range) => setTimeframe(range)}
    />
  );

  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={12}>
        <Flex alignItems="baseline" justifyContent="space-between">
          <Flex flexDirection="column" gap={2}>
            <Flex alignItems="center" gap={6}>
              <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
                24h activity
              </Heading>
              <InfoTooltip text="Hourly request counts across all GenAI spans in the last 24 hours, regardless of the active scope timeframe. Always scans 5 TB so the rollup stays accurate even when the toolbar's scan limit is lowered. Click-and-drag to brush a narrower range; the peak hour is highlighted in purple." />
            </Flex>
            <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
              Requests per hour, last 24 hours · 1h buckets
            </Text>
          </Flex>
          <Flex alignItems="center" gap={8}>
            {result.peakHour != null && (
              <Text style={{ fontSize: 11.5, color: "var(--text-2)" }}>
                Peak {formatHour(result.peakHour)} ·{" "}
                <strong>{fmtCount(result.peakRequests)}</strong> req
              </Text>
            )}
            {expander.expandButton("Expand 24h activity chart")}
          </Flex>
        </Flex>

        {result.isLoading ? (
          <Skeleton style={{ height: 180 }} />
        ) : (
          renderChart(180)
        )}
      </Flex>
      <ChartModal
        open={expander.open}
        onClose={() => expander.setOpen(false)}
        title="24h activity"
        subtitle="Requests per hour, last 24 hours"
        stats={stats}
      >
        {renderChart(440)}
      </ChartModal>
    </Surface>
  );
};
