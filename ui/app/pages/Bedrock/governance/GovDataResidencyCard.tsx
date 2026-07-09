import React, { useMemo } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { StatTile } from "../../../components/StatTile";
import { EmptyState } from "../../../components/EmptyState";
import { InfoTooltip } from "../../../components/InfoTooltip";
import { MaximizablePanel } from "../../../components/MaximizablePanel";
import { DataTable, type DataColumn } from "../../../components/DataTable";
import { STATUS_COLOR } from "../../../theme/statusColor";
import { fmtCount } from "../../../data/format";
import type { GovScope, CrossRegionRow } from "../../../bedrock/governance/types";
import { useGovCrossRegion } from "../../../bedrock/governance/useGovernance";
import { isResidencyException } from "../../../bedrock/governance/parse";

export interface GovDataResidencyCardProps {
  scope: GovScope;
}

const routeColumns: DataColumn<CrossRegionRow>[] = [
  {
    key: "route",
    header: "region → inferenceRegion",
    render: (r) => `${r.region} → ${r.inferenceRegion}`,
    mono: true,
    width: 260,
  },
  { key: "calls", header: "Calls", render: (r) => fmtCount(r.calls), align: "right", width: 110 },
  {
    key: "residency",
    header: "Residency",
    render: (r) =>
      isResidencyException(r.region, r.inferenceRegion) ? (
        <span style={{ color: STATUS_COLOR.critical, fontWeight: 600 }}>⚠ out-of-country</span>
      ) : (
        <span style={{ color: "var(--text-3)" }}>in-country</span>
      ),
    width: 160,
  },
];

/**
 * Data-sovereignty compliance card (D-band, Access & Governance). Reads
 * `useGovCrossRegion` (region → inferenceRegion routing pairs from
 * CloudTrail) and applies the shared residency policy from parse.ts: a
 * cross-region route is only a *residency exception* when inference crossed
 * a geography boundary (region family), not merely a different region in the
 * same country (e.g. us-east-1 → us-east-2 is normal cross-region inference;
 * us-east-1 → ap-northeast-2 is a flag). Wrapped in MaximizablePanel for a
 * full-screen focused view; the routing list is a resizable DataTable with
 * exceptions sorted to the front so they're never scrolled out of view.
 */
export const GovDataResidencyCard = ({ scope }: GovDataResidencyCardProps) => {
  const { rows, isLoading } = useGovCrossRegion(scope);
  const initial = isLoading && rows.length === 0;

  const exceptions = useMemo(
    () => rows.filter((r) => isResidencyException(r.region, r.inferenceRegion)),
    [rows],
  );
  const exceptionCalls = useMemo(
    () => exceptions.reduce((sum, r) => sum + r.calls, 0),
    [exceptions],
  );
  const totalCalls = useMemo(() => rows.reduce((sum, r) => sum + r.calls, 0), [rows]);
  const distinctDestinations = useMemo(
    () => new Set(rows.map((r) => r.inferenceRegion)).size,
    [rows],
  );

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const aEx = isResidencyException(a.region, a.inferenceRegion);
      const bEx = isResidencyException(b.region, b.inferenceRegion);
      if (aEx !== bEx) return aEx ? -1 : 1;
      return b.calls - a.calls;
    });
  }, [rows]);

  const stats = [
    { label: "Out-of-country calls", value: fmtCount(exceptionCalls) },
    { label: "Cross-region calls", value: fmtCount(totalCalls) },
    { label: "Distinct destinations", value: fmtCount(distinctDestinations) },
  ];

  const body = (expanded: boolean) => {
    const tableH = expanded ? 460 : 220;
    if (initial) return <Skeleton style={{ height: 140, borderRadius: 8 }} />;
    if (rows.length === 0) return <EmptyState bare title="No cross-region inference in scope" />;
    return (
      <Flex flexDirection="column" gap={16}>
        <StatTile
          label="calls left the request's country"
          value={fmtCount(exceptionCalls)}
          tone={exceptionCalls > 0 ? "critical" : "good"}
          cue
          sub={exceptionCalls === 0 ? "all inference stayed in-country" : undefined}
          info="Calls whose inference region belongs to a different geography than the requested region — a genuine data-sovereignty exception, not just ordinary cross-region inference within the same country."
        />
        <DataTable
          columns={routeColumns}
          rows={sortedRows}
          rowKey={(r) => `${r.region}->${r.inferenceRegion}`}
          maxHeight={tableH}
        />
        <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
          Open the Cross-region KPI tile for the full data-residency deep-dive.
        </Text>
      </Flex>
    );
  };

  return (
    <MaximizablePanel
      title="Cross-region inference & data residency"
      subtitle="Where inference actually ran vs where it was requested. Same-country routing is normal; inference leaving the country is a residency flag."
      headerRight={
        <InfoTooltip text="A residency exception is a call whose inference ran in a different geography (region family) than requested — e.g. us-east-1 → ap-northeast-2. Same-family cross-region (us-east-1 → us-east-2) is normal cross-region inference, not a residency flag." />
      }
      stats={stats}
      expanded={body(true)}
    >
      {body(false)}
    </MaximizablePanel>
  );
};
