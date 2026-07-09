import React, { useMemo } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { AreaChart } from "../../../components/charts/AreaChart";
import { EmptyState } from "../../../components/EmptyState";
import { CATEGORICAL } from "../../../theme/palette";
import { STATUS_COLOR } from "../../../theme/statusColor";
import { fmtCount } from "../../../data/format";
import { useGovErrorsSeries, useGovControlPlane } from "../../../bedrock/governance/useGovernance";
import type { GovScope } from "../../../bedrock/governance/types";

export interface GovSecurityDetailProps {
  scope: GovScope;
}

/** "2026-07-08T14:03:11.000Z" -> "7/8 14:03". Falls back to the raw string
 *  when the timestamp doesn't parse (CloudTrail rows are always ISO, but
 *  never trust a log-sourced string blindly). */
const fmtTimestamp = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || "—";
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${md} ${hh}:${mm}`;
};

const buildAxisTicks = (labels: string[]): { index: number; label: string }[] => {
  if (labels.length === 0) return [];
  const step = Math.max(1, Math.floor(labels.length / 6));
  return labels
    .map((label, index) => ({ index, label }))
    .filter((_, i) => i % step === 0);
};

const TH_STYLE: React.CSSProperties = {
  textAlign: "left",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-3)",
  padding: "0 8px 6px 8px",
  borderBottom: "1px solid var(--border)",
  whiteSpace: "nowrap",
};

const TD_STYLE: React.CSSProperties = {
  fontSize: 12,
  padding: "6px 8px",
  borderBottom: "1px solid var(--border)",
  verticalAlign: "middle",
};

const truncateStyle: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  maxWidth: 160,
  display: "inline-block",
  verticalAlign: "bottom",
};

/**
 * Errors & control-plane changes (D8 detail): left half plots the
 * `errorCode`-grouped denial/error timeseries (AreaChart, one series per
 * distinct error code, sorted busiest-first by `foldGovTimeseries`); right
 * half lists the raw control-plane WRITE events (`readOnly=false` CloudTrail
 * rows, e.g. StartIngestionJob) — the audit trail of configuration changes
 * to Bedrock resources, as opposed to the data-plane invocation traffic
 * shown elsewhere on this tab.
 */
export const GovSecurityDetail = ({ scope }: GovSecurityDetailProps) => {
  const { timeseries, isLoading: errorsLoading } = useGovErrorsSeries(scope);
  const { rows, isLoading: controlLoading } = useGovControlPlane(scope);

  const areaSeries = useMemo(
    () =>
      timeseries.series.map((s, i) => ({
        key: s.key,
        label: s.key,
        color: CATEGORICAL[i % CATEGORICAL.length],
        values: s.values,
      })),
    [timeseries.series],
  );
  const axisTicks = useMemo(() => buildAxisTicks(timeseries.labels), [timeseries.labels]);

  const errorsInitial = errorsLoading && timeseries.series.length === 0;
  const controlInitial = controlLoading && rows.length === 0;

  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={16}>
        <Flex flexDirection="column" gap={2}>
          <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
            Errors & control-plane changes
          </Heading>
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            Denial/error trend by error code, plus the raw audit trail of Bedrock
            configuration-changing API calls in scope.
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
            <Heading level={4} style={{ fontSize: 12.5, fontWeight: 600 }}>
              Errors & denials over time
            </Heading>
            {errorsInitial ? (
              <Skeleton style={{ height: 200, borderRadius: 8 }} />
            ) : areaSeries.length === 0 ? (
              <EmptyState
                bare
                title="No errors in this window"
                description={
                  <>
                    No CloudTrail rows carrying an error code were found in the
                    current scope —{" "}
                    <span style={{ color: STATUS_COLOR.good, fontWeight: 600 }}>
                      a clean signal
                    </span>
                    , not a data gap.
                  </>
                }
              />
            ) : (
              <>
                <AreaChart
                  series={areaSeries}
                  height={200}
                  formatLeft={fmtCount}
                  xLabels={timeseries.labels}
                  axisTicks={axisTicks}
                  ariaLabel="Errors and denials over time by error code"
                />
                <Flex gap={12} style={{ flexWrap: "wrap" }}>
                  {areaSeries.map((s) => (
                    <Flex key={s.key} alignItems="center" gap={4}>
                      <span
                        aria-hidden
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 2,
                          background: s.color,
                          flex: "0 0 auto",
                        }}
                      />
                      <Text style={{ fontSize: 11, color: "var(--text-3)" }}>{s.label}</Text>
                    </Flex>
                  ))}
                </Flex>
              </>
            )}
          </Flex>

          <Flex flexDirection="column" gap={8}>
            <Heading level={4} style={{ fontSize: 12.5, fontWeight: 600 }}>
              Control-plane changes (write events)
            </Heading>
            {controlInitial ? (
              <Skeleton style={{ height: 200, borderRadius: 8 }} />
            ) : rows.length === 0 ? (
              <EmptyState
                bare
                title="No control-plane write events"
                description="No configuration-changing Bedrock API calls in scope."
              />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={TH_STYLE}>Time</th>
                      <th style={TH_STYLE}>Action</th>
                      <th style={TH_STYLE}>Identity</th>
                      <th style={TH_STYLE}>Region</th>
                      <th style={TH_STYLE}>Source IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={`${r.timestamp}-${r.identity}-${i}`}>
                        <td
                          style={{
                            ...TD_STYLE,
                            fontVariantNumeric: "tabular-nums",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {fmtTimestamp(r.timestamp)}
                        </td>
                        <td style={TD_STYLE} title={r.eventName}>
                          <span style={truncateStyle}>{r.eventName || "—"}</span>
                        </td>
                        <td style={TD_STYLE} title={r.identity}>
                          <span
                            style={{ ...truncateStyle, fontFamily: "var(--mono, monospace)" }}
                          >
                            {r.identity || "—"}
                          </span>
                        </td>
                        <td style={TD_STYLE} title={r.region}>
                          <span style={truncateStyle}>{r.region || "—"}</span>
                        </td>
                        <td style={TD_STYLE} title={r.sourceIp}>
                          <span
                            style={{ ...truncateStyle, fontFamily: "var(--mono, monospace)" }}
                          >
                            {r.sourceIp || "—"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Flex>
        </div>
      </Flex>
    </Surface>
  );
};
