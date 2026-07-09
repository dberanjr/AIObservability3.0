import React, { useMemo } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { AreaChart, type AxisTick } from "../../components/charts/AreaChart";
import { EmptyState } from "../../components/EmptyState";
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

const LEGEND: Array<{ key: keyof Omit<MetricBands, "labels">; label: string; color: string }> = [
  { key: "max", label: "max", color: CATEGORICAL[5] },
  { key: "avg", label: "avg", color: STATUS_COLOR.info },
  { key: "min", label: "min", color: CATEGORICAL[2] },
];

const Legend = () => (
  <Flex gap={12} style={{ flexWrap: "wrap" }}>
    {LEGEND.map((l) => (
      <Flex key={l.key} alignItems="center" gap={4}>
        <span
          aria-hidden
          style={{ width: 8, height: 8, borderRadius: 2, background: l.color, flex: "0 0 auto" }}
        />
        <Text style={{ fontSize: 11, color: "var(--text-3)" }}>{l.label}</Text>
      </Flex>
    ))}
  </Flex>
);

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
}: {
  bands: MetricBands;
  title: string;
  description: string;
  ariaLabel: string;
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
        height={200}
        formatLeft={fmtMs}
        xLabels={bands.labels}
        axisTicks={axisTicks}
        ariaLabel={ariaLabel}
        series={[
          { values: bands.max, color: CATEGORICAL[5], label: "max" },
          { values: bands.avg, color: STATUS_COLOR.info, label: "avg" },
          { values: bands.min, color: CATEGORICAL[2], label: "min" },
        ]}
      />
      <Legend />
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

  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={16}>
        <Flex flexDirection="column" gap={2}>
          <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
            Latency & time-to-first-token trends
          </Heading>
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            Min / average / max over time, from cloud metric bucket statistics (not per-invocation
            percentiles).
          </Text>
        </Flex>

        {initialLoading ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
              gap: 24,
            }}
          >
            <Skeleton style={{ height: 260, borderRadius: 8 }} />
            <Skeleton style={{ height: 260, borderRadius: 8 }} />
          </div>
        ) : bothEmpty ? (
          <EmptyState bare title="No latency metric in scope" />
        ) : (
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
              />
            )}
          </div>
        )}
      </Flex>
    </Surface>
  );
};
