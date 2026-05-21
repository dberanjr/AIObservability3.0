import React, { useMemo } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { Histogram } from "../../components/charts/Histogram";
import type { ChartTimeDomain } from "../../components/charts/AreaChart";
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

  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={12}>
        <Flex alignItems="baseline" justifyContent="space-between">
          <Flex flexDirection="column" gap={2}>
            <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
              24h activity
            </Heading>
            <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
              Requests per hour, last 24 hours
            </Text>
          </Flex>
          {result.peakHour != null && (
            <Text style={{ fontSize: 11.5, color: "var(--text-2)" }}>
              Peak {formatHour(result.peakHour)} ·{" "}
              <strong>{fmtCount(result.peakRequests)}</strong> req
            </Text>
          )}
        </Flex>

        {result.isLoading ? (
          <Skeleton style={{ height: 180 }} />
        ) : (
          <Histogram
            bars={bars}
            height={180}
            valueFormatter={(n) => `${fmtCount(n)} req`}
            xDomain={xDomain}
            onBrushSelect={(range) => setTimeframe(range)}
          />
        )}
      </Flex>
    </Surface>
  );
};
