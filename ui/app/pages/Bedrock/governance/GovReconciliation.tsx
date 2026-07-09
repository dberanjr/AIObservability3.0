import React, { useMemo } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { EmptyState } from "../../../components/EmptyState";
import { InfoTooltip } from "../../../components/InfoTooltip";
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

/**
 * Access & Governance reconciliation card (D-band): the bridge that proves
 * CloudTrail (the invoke-API call record) and ModelInvocationLog (the metered
 * invocation record) agree. A gap between the two is a logging blind spot —
 * calls Bedrock accepted that never made it into the metering log, which
 * would silently under-count cost/token telemetry everywhere else in this
 * app. Below the headline, an account/region breakdown of raw CloudTrail
 * call volume gives the gap a "where" to start investigating.
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

  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={16}>
        <Flex flexDirection="column" gap={2}>
          <Flex alignItems="center" gap={4}>
            <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
              Logging coverage (CloudTrail vs metering)
            </Heading>
            <InfoTooltip
              text="CloudTrail records the invoke API call; ModelInvocationLog records the metered invocation. A gap means calls happened that the metering log didn't capture — a logging blind spot."
              size={12}
            />
          </Flex>
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            CloudTrail records the invoke API call; ModelInvocationLog records the metered
            invocation. A gap means calls happened that the metering log didn't capture — a
            logging blind spot.
          </Text>
        </Flex>

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
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "6px 8px",
                        color: "var(--text-3)",
                        fontWeight: 600,
                        fontSize: 11,
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      Account
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "6px 8px",
                        color: "var(--text-3)",
                        fontWeight: 600,
                        fontSize: 11,
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      Region
                    </th>
                    <th
                      style={{
                        textAlign: "right",
                        padding: "6px 8px",
                        color: "var(--text-3)",
                        fontWeight: 600,
                        fontSize: 11,
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      Calls
                    </th>
                    <th
                      style={{
                        textAlign: "right",
                        padding: "6px 8px",
                        color: "var(--text-3)",
                        fontWeight: 600,
                        fontSize: 11,
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      Identities
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {acctRows.map((r) => (
                    <tr key={`${r.accountId}-${r.region}`}>
                      <td
                        title={r.accountId}
                        style={{
                          padding: "6px 8px",
                          borderBottom: "1px solid var(--border)",
                          fontFamily: "var(--mono, monospace)",
                          color: "var(--text)",
                          maxWidth: 180,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {r.accountId}
                      </td>
                      <td
                        style={{
                          padding: "6px 8px",
                          borderBottom: "1px solid var(--border)",
                          color: "var(--text-2)",
                        }}
                      >
                        {r.region}
                      </td>
                      <td
                        style={{
                          padding: "6px 8px",
                          borderBottom: "1px solid var(--border)",
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          color: "var(--text)",
                        }}
                      >
                        {fmtCount(r.calls)}
                      </td>
                      <td
                        style={{
                          padding: "6px 8px",
                          borderBottom: "1px solid var(--border)",
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          color: "var(--text-2)",
                        }}
                      >
                        {fmtCount(r.identities)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Flex>
      </Flex>
    </Surface>
  );
};
