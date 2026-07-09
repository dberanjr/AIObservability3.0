import React, { useMemo } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { BarList, type BarListItem } from "../../components/charts/BarList";
import { Sparkline } from "../../components/charts/Sparkline";
import { InfoTooltip } from "../../components/InfoTooltip";
import { STATUS_COLOR } from "../../theme/statusColor";
import { fmtCount, fmtCountCompact } from "../../data/format";
import { useTpmByModel, useLogDelivery } from "../../bedrock/useRuntimeMetrics";
import type { BedrockScope } from "../../bedrock/types";

export interface BedrockQuotaDeliveryProps {
  scope: BedrockScope;
}

/**
 * Runtime 2.0 quota-and-delivery zone: peak TPM pressure per model (D6) and
 * CloudWatch model-invocation-log delivery health. Both signals come from
 * `cloud.aws.bedrock.*` account/tenant-wide metrics, not per-invocation
 * telemetry — see the InfoTooltips for the exact source and the caveats
 * (no per-model TPM quota ceiling is ingested, so the left panel is an
 * absolute tok/min bar list rather than a % of quota).
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
  const hasDeliverySpark =
    delivery.values.length >= 2 && delivery.values.some((v) => v > 0);
  const deliveryTone = delivery.total > 0 ? STATUS_COLOR.good : STATUS_COLOR.warning;

  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={16}>
        <Flex flexDirection="column" gap={2}>
          <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
            Throughput quota & log delivery
          </Heading>
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            Per-model TPM pressure against the account's Bedrock quota, plus CloudWatch
            model-invocation-log delivery health.
          </Text>
        </Flex>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
            gap: 24,
          }}
        >
          <Flex flexDirection="column" gap={8}>
            <Flex alignItems="center" gap={4}>
              <Heading level={4} style={{ fontSize: 12.5, fontWeight: 600 }}>
                Peak TPM by model
              </Heading>
              <InfoTooltip
                text="Peak estimated tokens-per-minute against the account's Bedrock TPM quota (cloud.aws.bedrock.EstimatedTPMQuotaUsage), per model. Shown as absolute tok/min — the per-model quota CEILING isn't in telemetry, so this can't be expressed as a % of quota."
                size={12}
              />
            </Flex>
            {tpmInitial ? (
              <Skeleton style={{ height: 140, borderRadius: 8 }} />
            ) : tpmItems.length === 0 ? (
              <Text style={{ fontSize: 12, color: "var(--text-3)" }}>
                No TPM quota-usage metric in this scope.
              </Text>
            ) : (
              <>
                <BarList items={tpmItems} color={STATUS_COLOR.info} limit={8} />
                <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
                  % of quota needs the per-model limit (not ingested).
                </Text>
              </>
            )}
          </Flex>

          <Flex flexDirection="column" gap={8}>
            <Flex alignItems="center" gap={4}>
              <Heading level={4} style={{ fontSize: 12.5, fontWeight: 600 }}>
                Log delivery health
              </Heading>
              <InfoTooltip
                // eslint-disable-next-line noSecrets/no-secrets -- public AWS CloudWatch metric name, not a secret
                text="Successful CloudWatch model-invocation-log deliveries (cloud.aws.bedrock.ModelInvocationLogsCloudWatchDeliverySuccess). Zero or a sudden drop means the audit trail is going dark."
                size={12}
              />
            </Flex>
            {deliveryInitial ? (
              <Skeleton style={{ height: 140, borderRadius: 8 }} />
            ) : delivery.values.length === 0 ? (
              <Text style={{ fontSize: 12, color: "var(--text-3)" }}>
                No log-delivery metric in this scope.
              </Text>
            ) : (
              <Flex flexDirection="column" gap={8}>
                <Flex flexDirection="column" gap={2}>
                  <Text
                    style={{
                      fontSize: 22,
                      fontWeight: 600,
                      color: deliveryTone,
                      fontVariantNumeric: "tabular-nums",
                      lineHeight: 1,
                    }}
                  >
                    {fmtCount(delivery.total)}
                  </Text>
                  <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
                    CloudWatch deliveries
                  </Text>
                </Flex>
                {hasDeliverySpark && (
                  <Sparkline
                    values={delivery.values}
                    color={STATUS_COLOR.good}
                    height={32}
                    valueFormatter={fmtCount}
                    ariaLabel="Log delivery over time"
                  />
                )}
              </Flex>
            )}
          </Flex>
        </div>
      </Flex>
    </Surface>
  );
};
