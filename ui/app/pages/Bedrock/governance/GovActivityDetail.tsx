import React, { useMemo } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { BarList, type BarListItem } from "../../../components/charts/BarList";
import { AreaChart } from "../../../components/charts/AreaChart";
import { EmptyState } from "../../../components/EmptyState";
import { InfoTooltip } from "../../../components/InfoTooltip";
import { MaximizablePanel } from "../../../components/MaximizablePanel";
import { DataTable, type DataColumn } from "../../../components/DataTable";
import { CATEGORICAL } from "../../../theme/palette";
import { STATUS_COLOR } from "../../../theme/statusColor";
import { fmtCount } from "../../../data/format";
import { useGovApiActions, useGovIdentities } from "../../../bedrock/governance/useGovernance";
import type { GovScope, IdentityMfaRow, SourceIpRow } from "../../../bedrock/governance/types";

export interface GovActivityDetailProps {
  scope: GovScope;
}

const buildAxisTicks = (labels: string[]): { index: number; label: string }[] => {
  if (labels.length === 0) return [];
  const step = Math.max(1, Math.floor(labels.length / 6));
  return labels.map((label, index) => ({ index, label })).filter((_, i) => i % step === 0);
};

const SUBHEAD: React.CSSProperties = { fontSize: 12.5, fontWeight: 600 };

/** CloudTrail leaves `mfaAuthenticated` unset for most programmatic sessions;
 *  normalize the empty / "null" values to a muted "n/a". */
const mfaLabel = (mfa: string): string => {
  const v = mfa.trim().toLowerCase();
  return v === "" || v === "null" || v === "undefined" ? "n/a" : mfa;
};
const mfaColor = (mfa: string): string => {
  const v = mfa.trim().toLowerCase();
  if (v === "true") return STATUS_COLOR.good;
  if (v === "false") return STATUS_COLOR.warning;
  return "var(--text-3)";
};

const ipColumns: DataColumn<SourceIpRow>[] = [
  { key: "ip", header: "Source IP", render: (r) => r.sourceIp || "—", mono: true, width: 200 },
  { key: "calls", header: "Calls", render: (r) => fmtCount(r.calls), align: "right", width: 110 },
  { key: "identities", header: "Identities", render: (r) => fmtCount(r.identities), align: "right", width: 120 },
];

const mfaColumns: DataColumn<IdentityMfaRow>[] = [
  // "Identity/Account", shown in FULL (noTruncate) per request — resize/ wrap
  // keeps it inside the column instead of clipping with an ellipsis.
  { key: "identity", header: "Identity/Account", render: (r) => r.identity || "—", mono: true, width: 260, noTruncate: true },
  { key: "mfa", header: "MFA", render: (r) => <span style={{ color: mfaColor(r.mfa), fontWeight: 600 }}>{mfaLabel(r.mfa)}</span>, width: 90 },
  { key: "calls", header: "Calls", render: (r) => fmtCount(r.calls), align: "right", width: 110 },
  { key: "ips", header: "Source IPs", render: (r) => fmtCount(r.sourceIps), align: "right", width: 120 },
];

/**
 * Activity & identity (D7 detail): who called Bedrock, with what action, from
 * where, and whether the session carried MFA. Wrapped in MaximizablePanel so it
 * has a full-screen focused view; the calls-over-time chart carries an
 * interactive legend (click a series to isolate it); tables use the resizable
 * DataTable, and the identity column ("Identity/Account") shows the full value.
 */
export const GovActivityDetail = ({ scope }: GovActivityDetailProps) => {
  const { rows: actionRows, timeseries, isLoading: actionsLoading } = useGovApiActions(scope);
  const { topIdentities, topSourceIps, identityMfa, isLoading: identitiesLoading } = useGovIdentities(scope);

  const actionItems: BarListItem[] = useMemo(
    () => actionRows.map((r) => ({ key: r.eventName, label: r.eventName, value: r.calls, displayValue: fmtCount(r.calls) })),
    [actionRows],
  );
  const areaSeries = useMemo(
    () => timeseries.series.map((s, i) => ({ label: s.key, color: CATEGORICAL[i % CATEGORICAL.length], values: s.values })),
    [timeseries.series],
  );
  const axisTicks = useMemo(() => buildAxisTicks(timeseries.labels), [timeseries.labels]);
  const identityItems: BarListItem[] = useMemo(
    () => topIdentities.map((r) => ({ key: r.identity, label: r.identity, value: r.calls, displayValue: fmtCount(r.calls) })),
    [topIdentities],
  );

  const actionsInitial = actionsLoading && actionRows.length === 0;
  const seriesInitial = actionsLoading && timeseries.series.length === 0;
  const identitiesInitial = identitiesLoading && topIdentities.length === 0;
  const ipsInitial = identitiesLoading && topSourceIps.length === 0;
  const mfaInitial = identitiesLoading && identityMfa.length === 0;

  const totalCalls = actionRows.reduce((s, r) => s + r.calls, 0);
  const stats = [
    { label: "Total calls", value: fmtCount(totalCalls) },
    { label: "Actions", value: fmtCount(actionRows.length) },
    { label: "Identities", value: fmtCount(new Set(identityMfa.map((r) => r.identity)).size) },
    { label: "Source IPs", value: fmtCount(topSourceIps.length) },
  ];

  const body = (expanded: boolean) => {
    const chartH = expanded ? 320 : 200;
    const tableH = expanded ? 460 : 220;
    const barLimit = expanded ? 20 : 8;
    return (
      <Flex flexDirection="column" gap={16}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 24 }}>
          <Flex flexDirection="column" gap={8}>
            <Heading level={4} style={SUBHEAD}>API actions</Heading>
            {actionsInitial ? (
              <Skeleton style={{ height: 140, borderRadius: 8 }} />
            ) : actionItems.length === 0 ? (
              <EmptyState bare title="No API actions in scope" description="No CloudTrail events matched the current scope." />
            ) : (
              <BarList items={actionItems} color={STATUS_COLOR.info} limit={barLimit} />
            )}
          </Flex>

          <Flex flexDirection="column" gap={8}>
            <Heading level={4} style={SUBHEAD}>Calls over time by action</Heading>
            {seriesInitial ? (
              <Skeleton style={{ height: 200, borderRadius: 8 }} />
            ) : areaSeries.length === 0 ? (
              <EmptyState bare title="No call activity in this window" description="No CloudTrail events to chart for the current scope." />
            ) : (
              <AreaChart
                series={areaSeries}
                height={chartH}
                formatLeft={fmtCount}
                xLabels={timeseries.labels}
                axisTicks={axisTicks}
                ariaLabel="Bedrock API calls over time by action"
                interactiveLegend
              />
            )}
          </Flex>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 24, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
          <Flex flexDirection="column" gap={8}>
            <Heading level={4} style={SUBHEAD}>Top identities</Heading>
            {identitiesInitial ? (
              <Skeleton style={{ height: 140, borderRadius: 8 }} />
            ) : identityItems.length === 0 ? (
              <EmptyState bare title="No identities in scope" description="No calling identities matched the current scope." />
            ) : (
              <BarList items={identityItems} color={CATEGORICAL[1]} limit={expanded ? 15 : 10} />
            )}
          </Flex>

          <Flex flexDirection="column" gap={8}>
            <Heading level={4} style={SUBHEAD}>Top source IPs</Heading>
            {ipsInitial ? (
              <Skeleton style={{ height: 140, borderRadius: 8 }} />
            ) : topSourceIps.length === 0 ? (
              <EmptyState bare title="No source IPs in scope" description="No calling IP addresses matched the current scope." />
            ) : (
              <DataTable columns={ipColumns} rows={topSourceIps} rowKey={(r) => r.sourceIp} maxHeight={tableH} />
            )}
          </Flex>
        </div>

        <Flex flexDirection="column" gap={8} style={{ paddingTop: 16, borderTop: "1px solid var(--border)" }}>
          <Flex alignItems="center" gap={4}>
            <Heading level={4} style={SUBHEAD}>Access by identity &amp; MFA</Heading>
            <InfoTooltip
              text="MFA reflects the CloudTrail session's mfaAuthenticated flag. Programmatic access via IAM roles carries no MFA by design, so n/a or false is expected there — treat human/console identities without MFA as the real flag."
              size={12}
            />
          </Flex>
          {mfaInitial ? (
            <Skeleton style={{ height: 180, borderRadius: 8 }} />
          ) : identityMfa.length === 0 ? (
            <EmptyState bare title="No identity/MFA rows in scope" description="No CloudTrail sessions matched the current scope." />
          ) : (
            <DataTable columns={mfaColumns} rows={identityMfa} rowKey={(r, i) => `${r.identity}-${r.mfa}-${i}`} maxHeight={tableH} />
          )}
        </Flex>
      </Flex>
    );
  };

  return (
    <MaximizablePanel
      title="Activity & identity"
      subtitle="Which API actions ran, by whom, and from where — CloudTrail identity detail behind the headline counters above."
      stats={stats}
      expanded={body(true)}
    >
      {body(false)}
    </MaximizablePanel>
  );
};
