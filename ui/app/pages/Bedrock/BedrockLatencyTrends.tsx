import React, { useMemo } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { AreaChart, type AxisTick } from "../../components/charts/AreaChart";
import { EmptyState } from "../../components/EmptyState";
import { MaximizablePanel } from "../../components/MaximizablePanel";
import { CATEGORICAL } from "../../theme/palette";
import { STATUS_COLOR } from "../../theme/statusColor";
import { fmtMs } from "../../data/format";
import { useLatencyBands } from "../../bedrock/useRuntimeMetrics";
import type { BedrockScope } from "../../bedrock/types";
import type { MetricBands } from "../../bedrock/runtimeMetrics";

export interface BedrockLatencyTrendsProps {
  scope: BedrockScope;
}

/** Sample ~6 evenly-spaced axis ticks out of a full label array so the
 *  x-axis doesn't get crowded with one tick per bucket. */
const sampleAxisTicks = (labels: string[]): AxisTick[] => {
  if (labels.length === 0) return [];
  const step = Math.max(1, Math.floor(labels.length / 6));
  return labels
    .map((label, index) => ({ index, label }))
    .filter((_, i) => i % step === 0);
};

/** Mean of a numeric array, ignoring NaN/empty input (0 when nothing to average). */
const mean = (values: number[]): number => {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return 0;
  return finite.reduce((sum, v) => sum + v, 0) / finite.length;
};

/** Max of a numeric array, ignoring NaN/empty input (0 when nothing to compare). */
const maxOf = (values: number[]): number => {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return 0;
  return Math.max(...finite);
};

/**
 * One trend chart for a min/avg/max metric band. Series are drawn in
 * max → avg → min order so the avg line reads on top of the max band
 * (min is thin and mostly sits at/near the baseline).
 */
const BandChart = ({
  bands,
  title,
  description,
  ariaLabel,
  height,
}: {
  bands: MetricBands;
  title: string;
  description: string;
  ariaLabel: string;
  height: number;
}) => {
  const axisTicks = useMemo(() => sampleAxisTicks(bands.labels), [bands.labels]);

  return (
    <Flex flexDirection="column" gap={8}>
      <Flex flexDirection="column" gap={2}>
        <Heading level={4} style={{ fontSize: 12.5, fontWeight: 600 }}>
          {title}
        </Heading>
        <Text style={{ fontSize: 11, color: "var(--text-3)" }}>{description}</Text>
      </Flex>
      <AreaChart
        height={height}
        formatLeft={fmtMs}
        xLabels={bands.labels}
        axisTicks={axisTicks}
        ariaLabel={ariaLabel}
        interactiveLegend
        series={[
          { values: bands.max, color: CATEGORICAL[5], label: "max" },
          { values: bands.avg, color: STATUS_COLOR.info, label: "avg" },
          { values: bands.min, color: CATEGORICAL[2], label: "min" },
        ]}
      />
    </Flex>
  );
};

/**
 * Latency & TTFT trend zone (Runtime 2.0): min/avg/max bands over time for
 * invocation latency and time-to-first-token, sourced from cloud metric
 * bucket statistics (`cloud.aws.bedrock.InvocationLatency` /
 * `TimeToFirstToken`). These are metric-bucket min/avg/max, NOT true
 * per-invocation percentiles — the description below says so explicitly so
 * this isn't mistaken for a p50/p90 view.
 */
export const BedrockLatencyTrends = ({ scope }: BedrockLatencyTrendsProps) => {
  const { latency, ttft, isLoading } = useLatencyBands(scope);

  const initialLoading = isLoading && latency.avg.length === 0 && ttft.avg.length === 0;
  const latencyEmpty = latency.avg.length === 0 && latency.max.length === 0 && latency.min.length === 0;
  const ttftEmpty = ttft.avg.length === 0 && ttft.max.length === 0 && ttft.min.length === 0;
  const bothEmpty = latencyEmpty && ttftEmpty;

  const stats = [
    { label: "Avg latency", value: fmtMs(mean(latency.avg)) },
    { label: "Max latency", value: fmtMs(maxOf(latency.max)) },
    { label: "Avg time to first token", value: fmtMs(mean(ttft.avg)) },
  ];

  const body = (expanded: boolean) => {
    const chartH = expanded ? 320 : 200;

    if (initialLoading) {
      return (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
            gap: 24,
          }}
        >
          <Skeleton style={{ height: chartH + 60, borderRadius: 8 }} />
          <Skeleton style={{ height: chartH + 60, borderRadius: 8 }} />
        </div>
      );
    }

    if (bothEmpty) {
      return <EmptyState bare title="No latency metric in scope" />;
    }

    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 24,
        }}
      >
        {latencyEmpty ? (
          <Flex flexDirection="column" gap={8}>
            <Heading level={4} style={{ fontSize: 12.5, fontWeight: 600 }}>
              Invocation latency
            </Heading>
            <EmptyState bare title="No latency metric in scope" />
          </Flex>
        ) : (
          <BandChart
            bands={latency}
            title="Invocation latency"
            description="cloud.aws.bedrock.InvocationLatency — min / avg / max per bucket"
            ariaLabel="Invocation latency min, average, and max over time"
            height={chartH}
          />
        )}

        {ttftEmpty ? (
          <Flex flexDirection="column" gap={8}>
            <Heading level={4} style={{ fontSize: 12.5, fontWeight: 600 }}>
              Time to first token
            </Heading>
            <EmptyState bare title="No TTFT metric in scope" />
          </Flex>
        ) : (
          <BandChart
            bands={ttft}
            title="Time to first token"
            description="cloud.aws.bedrock.TimeToFirstToken — min / avg / max per bucket"
            ariaLabel="Time to first token min, average, and max over time"
            height={chartH}
          />
        )}
      </div>
    );
  };

  return (
    <MaximizablePanel
      title="Latency & time-to-first-token trends"
      subtitle="Min / average / max over time, from cloud metric bucket statistics (not per-invocation percentiles)."
      stats={stats}
      expanded={body(true)}
    >
      {body(false)}
    </MaximizablePanel>
  );
};
