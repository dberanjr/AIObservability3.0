import React, { useMemo } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { BarList, type BarListItem } from "../../components/charts/BarList";
import { InfoTooltip } from "../../components/InfoTooltip";
import { CATEGORICAL } from "../../theme/palette";
import { STATUS_COLOR } from "../../theme/statusColor";
import { fmtCount, fmtMs, fmtPercent } from "../../data/format";
import { useBedrockOverview, useBedrockPerf } from "../../bedrock/useBedrock";
import type { BedrockScope } from "../../bedrock/types";
import type { PerfByModelRow } from "../../bedrock/parse";

export interface BedrockPerfZoneProps {
  scope: BedrockScope;
}

const EYEBROW: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: "var(--text-3)",
};

/** Model rows -> sorted-desc BarList items for one metric (latencyMs or
 *  ttftMs). Rows with no signal (value <= 0, e.g. a model with no metric
 *  data in scope) are dropped rather than drawn as an empty bar. */
const perfBarItems = (
  rows: PerfByModelRow[],
  metric: (r: PerfByModelRow) => number,
): BarListItem[] =>
  rows
    .map((r) => ({ row: r, value: metric(r) }))
    .filter(({ value }) => value > 0)
    .sort((a, b) => b.value - a.value)
    .map(({ row, value }) => ({
      key: row.model,
      label: row.model,
      value,
      displayValue: fmtMs(value),
      secondary: `${fmtCount(row.invocations)} invocations`,
    }));

/**
 * Peak-usage headroom bar for `tpmPeakPct`. `useBedrockPerf` only returns a
 * single tenant-wide peak scalar — there's no per-bucket TPM history to plot
 * — so this deliberately renders a static gauge instead of fabricating a
 * fake trend line out of one number (an AreaChart/Sparkline would imply a
 * time axis that doesn't exist here).
 */
const TpmHeadroomBar = ({ pct }: { pct: number }) => {
  const clamped = Math.max(0, Math.min(100, pct));
  const color =
    pct > 90 ? STATUS_COLOR.critical : pct > 75 ? STATUS_COLOR.warning : STATUS_COLOR.good;
  return (
    <div
      role="img"
      aria-label={`${fmtPercent(pct)} of TPM quota used at peak`}
      title={`${fmtPercent(pct)} of TPM quota used at peak`}
      style={{
        position: "relative",
        height: 8,
        background: "var(--surface-3)",
        borderRadius: 999,
        overflow: "hidden",
      }}
    >
      <div style={{ width: `${clamped}%`, height: "100%", background: color, borderRadius: 999 }} />
    </div>
  );
};

/**
 * Performance zone (D6): latency-by-model and TTFT-by-model BarLists (both
 * sorted worst-first), a peak-TPM headroom gauge, and an honest errors
 * summary sourced from the log `errorCode` field (there's no dedicated
 * Bedrock error-RATE metric in this tenant — see BedrockKpiRow's Error rate
 * tile, which carries the same caveat).
 *
 * Known gap (pre-existing, not introduced here): `useBedrockPerf`'s queries
 * (`metricQueries.ts`) take only `scope.timeframe`, not the full scope — the
 * account/model filters from the D6 scope selectors do NOT narrow this
 * zone's latency/TTFT/TPM numbers, only the log-sourced zones (cost,
 * sessions, invocations/tokens/errors/sessions in the KPI row) respect them.
 */
export const BedrockPerfZone = ({ scope }: BedrockPerfZoneProps) => {
  const { rows, tpmPeakPct, isLoading: perfLoading } = useBedrockPerf(scope);
  const { totals, isLoading: overviewLoading } = useBedrockOverview(scope);

  const latencyItems = useMemo(() => perfBarItems(rows, (r) => r.latencyMs), [rows]);
  const ttftItems = useMemo(() => perfBarItems(rows, (r) => r.ttftMs), [rows]);

  const perfInitial = perfLoading && rows.length === 0;
  const overviewInitial = overviewLoading && totals.invocations === 0;
  const errorRatePct = totals.invocations > 0 ? (totals.errors / totals.invocations) * 100 : 0;
  const tpmColor =
    tpmPeakPct > 90 ? STATUS_COLOR.critical : tpmPeakPct > 75 ? STATUS_COLOR.warning : "var(--text)";

  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={16}>
        <Flex flexDirection="column" gap={2}>
          <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
            Performance by model
          </Heading>
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            Latency and time-to-first-token, worst model first — averages from cloud metrics, not
            true percentiles (no per-invocation percentile is ingested for this tenant).
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
                Latency by model
              </Heading>
              <InfoTooltip
                text="Average per-model invocation latency (cloud.aws.bedrock.InvocationLatency.By.ModelId), highest first. Metric-average based — NOT a true percentile across individual invocations."
                size={12}
              />
            </Flex>
            {perfInitial ? (
              <Skeleton style={{ height: 140, borderRadius: 8 }} />
            ) : latencyItems.length === 0 ? (
              <Text style={{ fontSize: 12, color: "var(--text-3)" }}>
                No latency metric in this scope.
              </Text>
            ) : (
              <BarList items={latencyItems} color={STATUS_COLOR.info} limit={8} />
            )}
          </Flex>

          <Flex flexDirection="column" gap={8}>
            <Flex alignItems="center" gap={4}>
              <Heading level={4} style={{ fontSize: 12.5, fontWeight: 600 }}>
                TTFT by model
              </Heading>
              <InfoTooltip
                text="Average per-model time-to-first-token (cloud.aws.bedrock.TimeToFirstToken.By.ModelId), highest first."
                size={12}
              />
            </Flex>
            {perfInitial ? (
              <Skeleton style={{ height: 140, borderRadius: 8 }} />
            ) : ttftItems.length === 0 ? (
              <Text style={{ fontSize: 12, color: "var(--text-3)" }}>
                No TTFT metric in this scope.
              </Text>
            ) : (
              <BarList items={ttftItems} color={CATEGORICAL[1]} limit={8} />
            )}
          </Flex>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
            gap: 24,
            paddingTop: 16,
            borderTop: "1px solid var(--border)",
          }}
        >
          <Flex flexDirection="column" gap={6}>
            <Flex alignItems="center" gap={4}>
              <Text style={EYEBROW}>Peak TPM usage</Text>
              <InfoTooltip
                text="Peak observed usage of the account's tokens-per-minute Bedrock quota in scope (cloud.aws.bedrock.EstimatedTPMQuotaUsage). Higher = closer to the throughput limit and potential throttling. A single tenant-wide peak, not broken out per model, and not narrowed by the Account/Model selectors (this metric carries no per-account/model dimension)."
                size={12}
              />
            </Flex>
            {perfInitial ? (
              <Skeleton style={{ height: 34, borderRadius: 6 }} />
            ) : (
              <>
                <Text
                  style={{
                    fontSize: 20,
                    fontWeight: 600,
                    color: tpmColor,
                    fontVariantNumeric: "tabular-nums",
                    lineHeight: 1,
                  }}
                >
                  {fmtPercent(tpmPeakPct)}
                </Text>
                <TpmHeadroomBar pct={tpmPeakPct} />
              </>
            )}
          </Flex>

          <Flex flexDirection="column" gap={6}>
            <Flex alignItems="center" gap={4}>
              <Text style={EYEBROW}>Errors</Text>
              <InfoTooltip
                text="Count of invocation log rows carrying a non-null errorCode. There's no dedicated Bedrock error-rate metric in this tenant, so this is a log-derived floor, not a full error rate — see the coverage-gap finding below."
                size={12}
              />
            </Flex>
            {overviewInitial ? (
              <Skeleton style={{ height: 34, borderRadius: 6 }} />
            ) : (
              <Text style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.4 }}>
                {fmtCount(totals.errors)} errors / period ({fmtPercent(errorRatePct)} of{" "}
                {fmtCount(totals.invocations)} invocations) · from log{" "}
                <code style={{ fontFamily: "var(--mono, monospace)" }}>errorCode</code>; no error
                metric in this tenant
              </Text>
            )}
          </Flex>
        </div>
      </Flex>
    </Surface>
  );
};
