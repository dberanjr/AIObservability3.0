import React from "react";
import { Skeleton } from "@dynatrace/strato-components/content";
import { Histogram, type HistogramBar } from "../../components/charts/Histogram";
import { fmtCount, fmtCountCompact } from "../../data/format";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { SummaryCard } from "./SummaryCard";
import { useActivityHistogram } from "../Pulse/useActivityHistogram";

/**
 * 24h request-distribution histogram (peak hour highlighted). Drills to Pulse,
 * which owns the full activity + brush-zoom view.
 */
export const ActivityCard = () => {
  const { buckets, peakHour, isLoading, error } = useActivityHistogram();

  const bars: HistogramBar[] = buckets.map((b) => ({
    label: `${String(b.hour).padStart(2, "0")}:00`,
    value: b.requests,
    highlighted: b.hour === peakHour,
  }));
  const hasData = bars.some((b) => b.value > 0);

  return (
    <SummaryCard
      title="Activity · 24h"
      info="Requests per hour over a FIXED trailing 24-hour window, independent of the global timeframe. Each hourly bar is a request count, extrapolated for sampling; the peak hour is highlighted. Honors the toolbar scan-limit like every other query."
      drill={{ label: "Pulse", to: "/pulse" }}
      headerRight={
        <span
          title="Fixed 24-hour overview — independent of the global timeframe"
          style={{
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: "0.02em",
            color: "var(--text-3)",
            background: "var(--surface-2)",
            borderRadius: 4,
            padding: "1px 5px",
          }}
        >
          fixed 24h
        </span>
      }
    >
      {isLoading && !hasData ? (
        <Skeleton style={{ height: 130, borderRadius: 8 }} />
      ) : error ? (
        <ErrorState bare error={error} />
      ) : !hasData ? (
        <EmptyState
          bare
          title="No requests in the last 24 hours"
          description="No AI requests were recorded in the fixed 24-hour window."
        />
      ) : (
        <Histogram
          bars={bars}
          height={200}
          xLabels={4}
          showYAxis
          yAxisFormatter={fmtCountCompact}
          valueFormatter={(n) => `${fmtCount(n)} req`}
          ariaLabel="Requests per hour over the last 24 hours"
        />
      )}
    </SummaryCard>
  );
};
