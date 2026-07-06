import React from "react";
import { Skeleton } from "@dynatrace/strato-components/content";
import { Text } from "@dynatrace/strato-components/typography";
import { Histogram, type HistogramBar } from "../../components/charts/Histogram";
import { fmtCount, fmtCountCompact } from "../../data/format";
import { SummaryCard } from "./SummaryCard";
import { useActivityHistogram } from "../Pulse/useActivityHistogram";

/**
 * 24h request-distribution histogram (peak hour highlighted). Drills to Pulse,
 * which owns the full activity + brush-zoom view.
 */
export const ActivityCard = () => {
  const { buckets, peakHour, isLoading } = useActivityHistogram();

  const bars: HistogramBar[] = buckets.map((b) => ({
    label: `${String(b.hour).padStart(2, "0")}:00`,
    value: b.requests,
    highlighted: b.hour === peakHour,
  }));
  const hasData = bars.some((b) => b.value > 0);

  return (
    <SummaryCard title="Activity · 24h" drill={{ label: "Pulse", to: "/pulse" }}>
      {isLoading && !hasData ? (
        <Skeleton style={{ height: 130, borderRadius: 8 }} />
      ) : !hasData ? (
        <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
          No requests in the last 24 hours.
        </Text>
      ) : (
        <Histogram
          bars={bars}
          height={200}
          xLabels={4}
          showYAxis
          yAxisFormatter={fmtCountCompact}
          valueFormatter={(n) => `${fmtCount(n)} req`}
        />
      )}
    </SummaryCard>
  );
};
