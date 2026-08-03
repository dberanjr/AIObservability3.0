import React, { useMemo } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { Histogram } from "../../components/charts/Histogram";
import type { ChartTimeDomain } from "../../components/charts/AreaChart";
import {
  ChartModal,
  useChartExpander,
} from "../../components/charts/ChartExpander";
import { CollapsibleCard } from "../../components/CollapsibleCard";
import { fmtCount } from "../../data/format";
import { useScope } from "../../scope/ScopeContext";
import { useActivityHistogram } from "./useActivityHistogram";

const formatHour = (h: number): string => {
  if (h === 0) return "12a";
  if (h === 12) return "12p";
  return h > 12 ? `${h - 12}p` : `${h}a`;
};

const ActivityHistogramBody = ({ showExample = false }: { showExample?: boolean }) => {
  const result = useActivityHistogram(showExample);
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
      showYAxis
      yAxisFormatter={fmtCount}
      ariaLabel={`Requests per hour over the last 24 hours${
        result.peakHour != null
          ? `, peak ${formatHour(result.peakHour)} at ${fmtCount(
              result.peakRequests,
            )} requests`
          : ""
      }`}
    />
  );

  return (
      <Flex flexDirection="column" gap={12} style={{ padding: 16 }}>
        <Flex alignItems="center" justifyContent="flex-end" gap={8}>
          {result.peakHour != null && (
            <Text style={{ fontSize: 11.5, color: "var(--text-2)" }}>
              Peak {formatHour(result.peakHour)} ·{" "}
              <strong>{fmtCount(result.peakRequests)}</strong> req
            </Text>
          )}
          {expander.expandButton("Expand 24h activity chart")}
        </Flex>

        {result.isLoading ? (
          <Skeleton style={{ height: 180 }} />
        ) : (
          renderChart(180)
        )}
        <ChartModal
          open={expander.open}
          onClose={() => expander.setOpen(false)}
          title="24h activity"
          subtitle="Requests per hour, last 24 hours"
          stats={stats}
        >
          {renderChart(440)}
        </ChartModal>
      </Flex>
  );
};

export const ActivityHistogramPanel = ({ showExample = false }: { showExample?: boolean }) => (
  <CollapsibleCard
    title="24h activity"
    info="Hourly request counts across all GenAI spans in the last 24 hours, regardless of the active scope timeframe. Always scans 5 TB so the rollup stays accurate even when the toolbar's scan limit is lowered. Click-and-drag to brush a narrower range; the peak hour is highlighted in purple."
    subtitle="Requests per hour, last 24 hours · per 1 hour"
    defaultOpen
  >
    <ActivityHistogramBody showExample={showExample} />
  </CollapsibleCard>
);
