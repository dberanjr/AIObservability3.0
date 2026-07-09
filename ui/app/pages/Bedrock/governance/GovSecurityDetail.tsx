import React, { useMemo } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { AreaChart } from "../../../components/charts/AreaChart";
import { EmptyState } from "../../../components/EmptyState";
import { MaximizablePanel } from "../../../components/MaximizablePanel";
import { DataTable, type DataColumn } from "../../../components/DataTable";
import { CATEGORICAL } from "../../../theme/palette";
import { STATUS_COLOR } from "../../../theme/statusColor";
import { fmtCount } from "../../../data/format";
import { useGovErrorsSeries, useGovControlPlane } from "../../../bedrock/governance/useGovernance";
import type { GovScope, ControlPlaneRow } from "../../../bedrock/governance/types";

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

const SUBHEAD: React.CSSProperties = { fontSize: 12.5, fontWeight: 600 };

const controlColumns: DataColumn<ControlPlaneRow>[] = [
  { key: "time", header: "Time", render: (r) => fmtTimestamp(r.timestamp), width: 110 },
  { key: "action", header: "Action", render: (r) => r.eventName || "—", width: 220 },
  // "Identity/Account", shown in FULL (noTruncate) per request — resize/wrap
  // keeps it inside the column instead of clipping with an ellipsis.
  { key: "identity", header: "Identity/Account", render: (r) => r.identity || "—", mono: true, noTruncate: true, width: 260 },
  { key: "region", header: "Region", render: (r) => r.region || "—", width: 120 },
  { key: "ip", header: "Source IP", render: (r) => r.sourceIp || "—", mono: true, width: 160 },
];

/**
 * Errors & control-plane changes (D8 detail): left half plots the
 * `errorCode`-grouped denial/error timeseries (AreaChart, one series per
 * distinct error code, sorted busiest-first by `foldGovTimeseries`), with an
 * interactive legend (click a series to isolate it); right half lists the raw
 * control-plane WRITE events (`readOnly=false` CloudTrail rows, e.g.
 * StartIngestionJob) in a resizable DataTable — the audit trail of
 * configuration changes to Bedrock resources, as opposed to the data-plane
 * invocation traffic shown elsewhere on this tab. Wrapped in MaximizablePanel
 * for a full-screen focused view.
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

  const totalErrors = useMemo(
    () => timeseries.series.reduce((sum, s) => sum + s.values.reduce((a, b) => a + b, 0), 0),
    [timeseries.series],
  );
  const stats = [
    { label: "Total errors", value: fmtCount(totalErrors) },
    { label: "Error codes", value: fmtCount(areaSeries.length) },
    { label: "Control-plane events", value: fmtCount(rows.length) },
  ];

  const body = (expanded: boolean) => {
    const chartH = expanded ? 320 : 200;
    const tableH = expanded ? 460 : 220;
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 24,
        }}
      >
        <Flex flexDirection="column" gap={8}>
          <Heading level={4} style={SUBHEAD}>
            Errors & denials over time
          </Heading>
          {errorsInitial ? (
            <Skeleton style={{ height: chartH, borderRadius: 8 }} />
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
            <AreaChart
              series={areaSeries}
              height={chartH}
              formatLeft={fmtCount}
              xLabels={timeseries.labels}
              axisTicks={axisTicks}
              ariaLabel="Errors and denials over time by error code"
              interactiveLegend
            />
          )}
        </Flex>

        <Flex flexDirection="column" gap={8}>
          <Heading level={4} style={SUBHEAD}>
            Control-plane changes (write events)
          </Heading>
          {controlInitial ? (
            <Skeleton style={{ height: chartH, borderRadius: 8 }} />
          ) : rows.length === 0 ? (
            <EmptyState
              bare
              title="No control-plane write events"
              description="No configuration-changing Bedrock API calls in scope."
            />
          ) : (
            <DataTable
              columns={controlColumns}
              rows={rows}
              rowKey={(r, i) => `${r.timestamp}-${r.identity}-${i}`}
              maxHeight={tableH}
            />
          )}
        </Flex>
      </div>
    );
  };

  return (
    <MaximizablePanel
      title="Errors & control-plane changes"
      subtitle="Denial/error trend by error code, plus the raw audit trail of Bedrock configuration-changing API calls in scope."
      stats={stats}
      expanded={body(true)}
    >
      {body(false)}
    </MaximizablePanel>
  );
};
