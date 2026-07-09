import React, { useMemo } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { BarList, type BarListItem } from "../../components/charts/BarList";
import { AreaChart } from "../../components/charts/AreaChart";
import { InfoTooltip } from "../../components/InfoTooltip";
import { MaximizablePanel } from "../../components/MaximizablePanel";
import { STATUS_COLOR } from "../../theme/statusColor";
import { fmtCount, fmtCountCompact } from "../../data/format";
import { useTpmByModel, useLogDelivery } from "../../bedrock/useRuntimeMetrics";
import type { BedrockScope } from "../../bedrock/types";

export interface BedrockQuotaDeliveryProps {
  scope: BedrockScope;
}

const SUBHEAD: React.CSSProperties = { fontSize: 12.5, fontWeight: 600 };

/** A few evenly-spaced x-axis ticks — keep it sparse (~`count`) so a dense
 *  series stays legible; used for the deliberately-subtle delivery axis. */
const axisTicks = (labels: string[], count = 5): { index: number; label: string }[] => {
  if (labels.length === 0) return [];
  const step = Math.max(1, Math.floor(labels.length / count));
  return labels.map((label, index) => ({ index, label })).filter((_, i) => i % step === 0);
};

/**
 * Runtime 2.0 quota-and-delivery zone: peak TPM pressure per model and
 * CloudWatch model-invocation-log delivery health. Wrapped in MaximizablePanel
 * for a focused view. Log delivery is drawn as a compact time-series with a
 * subtle date/time x-axis, so hovering surfaces the delivery count at each
 * timestamp (vs the old axis-less sparkline).
 */
export const BedrockQuotaDelivery = ({ scope }: BedrockQuotaDeliveryProps) => {
  const { rows: tpmRows, isLoading: tpmLoading } = useTpmByModel(scope);
  const { delivery, isLoading: deliveryLoading } = useLogDelivery(scope);

  const tpmItems = useMemo<BarListItem[]>(
    () =>
      [...tpmRows]
        .sort((a, b) => b.peak - a.peak)
        .map((r) => ({
          key: r.rawModel,
          label: r.model,
          value: r.peak,
          displayValue: `${fmtCountCompact(r.peak)} tok/min`,
        })),
    [tpmRows],
  );

  const tpmInitial = tpmLoading && tpmRows.length === 0;
  const deliveryInitial = deliveryLoading && delivery.total === 0 && delivery.values.length === 0;
  const hasDeliverySeries = delivery.values.length >= 2 && delivery.values.some((v) => v > 0);
  const deliveryTone = delivery.total > 0 ? STATUS_COLOR.good : STATUS_COLOR.warning;

  const topTpm = tpmRows.reduce((a, b) => (b.peak > a.peak ? b : a), tpmRows[0]);
  const stats = [
    { label: "CloudWatch deliveries", value: fmtCount(delivery.total) },
    { label: "Models with quota data", value: fmtCount(tpmRows.length) },
    ...(topTpm ? [{ label: "Peak TPM model", value: topTpm.model, sub: `${fmtCountCompact(topTpm.peak)} tok/min` }] : []),
  ];

  const body = (expanded: boolean) => {
    const chartH = expanded ? 200 : 96;
    return (
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 24 }}>
        <Flex flexDirection="column" gap={8}>
          <Flex alignItems="center" gap={4}>
            <Heading level={4} style={SUBHEAD}>Peak TPM by model</Heading>
            <InfoTooltip
              text="Peak estimated tokens-per-minute against the account's Bedrock TPM quota (cloud.aws.bedrock.EstimatedTPMQuotaUsage), per model. Shown as absolute tok/min — the per-model quota CEILING isn't in telemetry, so this can't be expressed as a % of quota."
              size={12}
            />
          </Flex>
          {tpmInitial ? (
            <Skeleton style={{ height: 140, borderRadius: 8 }} />
          ) : tpmItems.length === 0 ? (
            <Text style={{ fontSize: 12, color: "var(--text-3)" }}>No TPM quota-usage metric in this scope.</Text>
          ) : (
            <>
              <BarList items={tpmItems} color={STATUS_COLOR.info} limit={expanded ? 20 : 8} />
              <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
                % of quota needs the per-model limit (not ingested).
              </Text>
            </>
          )}
        </Flex>

        <Flex flexDirection="column" gap={8}>
          <Flex alignItems="center" gap={4}>
            <Heading level={4} style={SUBHEAD}>Log delivery health</Heading>
            <InfoTooltip
              // eslint-disable-next-line noSecrets/no-secrets -- public AWS CloudWatch metric name, not a secret
              text="Successful CloudWatch model-invocation-log deliveries (cloud.aws.bedrock.ModelInvocationLogsCloudWatchDeliverySuccess). Zero or a sudden drop means the audit trail is going dark."
              size={12}
            />
          </Flex>
          {deliveryInitial ? (
            <Skeleton style={{ height: 140, borderRadius: 8 }} />
          ) : delivery.values.length === 0 ? (
            <Text style={{ fontSize: 12, color: "var(--text-3)" }}>No log-delivery metric in this scope.</Text>
          ) : (
            <Flex flexDirection="column" gap={8}>
              <Flex flexDirection="column" gap={2}>
                <Text style={{ fontSize: 22, fontWeight: 600, color: deliveryTone, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                  {fmtCount(delivery.total)}
                </Text>
                <Text style={{ fontSize: 11, color: "var(--text-3)" }}>CloudWatch deliveries</Text>
              </Flex>
              {hasDeliverySeries && (
                <AreaChart
                  series={[{ values: delivery.values, color: STATUS_COLOR.good, label: "deliveries" }]}
                  xLabels={delivery.labels}
                  axisTicks={axisTicks(delivery.labels, expanded ? 8 : 4)}
                  formatLeft={(n) => fmtCount(n)}
                  height={chartH}
                  ariaLabel="CloudWatch log deliveries over time"
                />
              )}
            </Flex>
          )}
        </Flex>
      </div>
    );
  };

  return (
    <MaximizablePanel
      title="Throughput quota & log delivery"
      subtitle="Per-model TPM pressure against the account's Bedrock quota, plus CloudWatch model-invocation-log delivery health."
      stats={stats}
      expanded={body(true)}
    >
      {body(false)}
    </MaximizablePanel>
  );
};
