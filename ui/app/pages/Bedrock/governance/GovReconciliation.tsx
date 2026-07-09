import React, { useMemo } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { EmptyState } from "../../../components/EmptyState";
import { MaximizablePanel } from "../../../components/MaximizablePanel";
import { DataTable, type DataColumn } from "../../../components/DataTable";
import { CATEGORICAL } from "../../../theme/palette";
import { STATUS_COLOR } from "../../../theme/statusColor";
import { fmtCount, fmtPercent } from "../../../data/format";
import { useGovReconciliation } from "../../../bedrock/governance/useGovernance";
import type { AccountRegionRow, GovScope } from "../../../bedrock/governance/types";

export interface GovReconciliationProps {
  scope: GovScope;
}

const EYEBROW: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: "var(--text-3)",
};

/** One labeled comparison bar: eyebrow label + count on the right, a filled
 *  track scaled against `max`. Built inline (rather than BarList) because
 *  this is a fixed two-row comparison, not an arbitrary ranked list. */
const CompareBar = ({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) => {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <Flex flexDirection="column" gap={4}>
      <Flex alignItems="baseline" justifyContent="space-between" gap={8}>
        <Text style={{ fontSize: 12.5, color: "var(--text-2)" }}>{label}</Text>
        <Text
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: "var(--text)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {fmtCount(value)}
        </Text>
      </Flex>
      <div
        title={`${label}: ${fmtCount(value)}`}
        style={{
          position: "relative",
          height: 10,
          background: "var(--surface-3)",
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct.toFixed(1)}%`,
            height: "100%",
            background: `linear-gradient(90deg, ${color}, color-mix(in oklab, ${color} 50%, transparent))`,
            borderRadius: 999,
          }}
        />
      </div>
    </Flex>
  );
};

const rowsByCallsDesc = (rows: AccountRegionRow[]): AccountRegionRow[] =>
  [...rows].sort((a, b) => b.calls - a.calls);

const accountColumns: DataColumn<AccountRegionRow>[] = [
  // Full account id shown untruncated per request — resize/wrap keeps it
  // inside the column instead of clipping with an ellipsis.
  { key: "account", header: "Account", render: (r) => r.accountId || "—", mono: true, noTruncate: true, width: 200 },
  { key: "region", header: "Region", render: (r) => r.region || "—", width: 140 },
  { key: "calls", header: "Calls", render: (r) => fmtCount(r.calls), align: "right", width: 110 },
  { key: "identities", header: "Identities", render: (r) => fmtCount(r.identities), align: "right", width: 120 },
];

/**
 * Access & Governance reconciliation card (D-band): the bridge that proves
 * CloudTrail (the invoke-API call record) and ModelInvocationLog (the metered
 * invocation record) agree. A gap between the two is a logging blind spot —
 * calls Bedrock accepted that never made it into the metering log, which
 * would silently under-count cost/token telemetry everywhere else in this
 * app. Below the headline, an account/region breakdown of raw CloudTrail
 * call volume gives the gap a "where" to start investigating. Wrapped in
 * MaximizablePanel for a full-screen focused view; the account/region
 * breakdown uses the resizable DataTable with the full account id shown.
 */
export const GovReconciliation = ({ scope }: GovReconciliationProps) => {
  const { reconciliation, accountRegion, isLoading } = useGovReconciliation(scope);
  const initial = isLoading && reconciliation.length === 0 && accountRegion.length === 0;

  const { ctVal, logVal, gap, coveragePct } = useMemo(() => {
    const ct = reconciliation.find((r) => r.source.includes("CloudTrail"));
    const log = reconciliation.find((r) => r.source.includes("ModelInvocationLog"));
    const ctV = ct?.invocations ?? 0;
    const logV = log?.invocations ?? 0;
    const g = ctV - logV;
    const cov = ctV > 0 ? (logV / ctV) * 100 : 100;
    return { ctVal: ctV, logVal: logV, gap: g, coveragePct: cov };
  }, [reconciliation]);

  const acctRows = useMemo(() => rowsByCallsDesc(accountRegion), [accountRegion]);
  const maxVal = Math.max(1, ctVal, logVal);
  const hasReconciliation = ctVal > 0 || logVal > 0;

  const stats = [
    { label: "CloudTrail invokes", value: fmtCount(ctVal) },
    { label: "Metering count", value: fmtCount(logVal) },
    { label: "Gap", value: fmtCount(gap) },
    { label: "Coverage", value: fmtPercent(coveragePct) },
  ];

  const body = (expanded: boolean) => {
    const tableH = expanded ? 460 : 220;
    return (
      <Flex flexDirection="column" gap={16}>
        {initial ? (
          <Skeleton style={{ height: 180, borderRadius: 8 }} />
        ) : !hasReconciliation ? (
          <EmptyState
            bare
            title="No reconciliation data in this scope"
            description="Neither CloudTrail nor the ModelInvocationLog has invocations to compare in the current scope."
          />
        ) : (
          <Flex flexDirection="column" gap={12}>
            <Flex flexDirection="column" gap={8}>
              <CompareBar label="CloudTrail" value={ctVal} max={maxVal} color={STATUS_COLOR.info} />
              <CompareBar
                label="ModelInvocationLog"
                value={logVal}
                max={maxVal}
                color={CATEGORICAL[2]}
              />
            </Flex>

            {gap > 0 ? (
              <Text
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: STATUS_COLOR.warning,
                  lineHeight: 1.4,
                }}
              >
                {fmtCount(gap)} invocations ({fmtPercent(100 - coveragePct)}) recorded by
                CloudTrail but missing from the metering log
              </Text>
            ) : (
              <Text
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: STATUS_COLOR.good,
                  lineHeight: 1.4,
                }}
              >
                Metering log covers all CloudTrail invocations.
              </Text>
            )}
          </Flex>
        )}

        <Flex flexDirection="column" gap={8} style={{ paddingTop: 16, borderTop: "1px solid var(--border)" }}>
          <Text style={EYEBROW}>Activity by account &amp; region</Text>
          {initial ? (
            <Skeleton style={{ height: 140, borderRadius: 8 }} />
          ) : acctRows.length === 0 ? (
            <EmptyState
              bare
              title="No account/region activity in this scope"
              description="No CloudTrail rows carried an account and region in the current scope."
            />
          ) : (
            <DataTable
              columns={accountColumns}
              rows={acctRows}
              rowKey={(r) => `${r.accountId}-${r.region}`}
              maxHeight={tableH}
            />
          )}
        </Flex>
      </Flex>
    );
  };

  return (
    <MaximizablePanel
      title="Logging coverage (CloudTrail vs metering)"
      subtitle="CloudTrail records the invoke API call; ModelInvocationLog records the metered invocation. A gap means calls happened that the metering log didn't capture — a logging blind spot."
      stats={stats}
      expanded={body(true)}
    >
      {body(false)}
    </MaximizablePanel>
  );
};
