import React, { useMemo } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { EmptyState } from "../../../components/EmptyState";
import { InfoTooltip } from "../../../components/InfoTooltip";
import { STATUS_COLOR } from "../../../theme/statusColor";
import { fmtCount } from "../../../data/format";
import type { GovScope } from "../../../bedrock/governance/types";
import { useGovAccessDenied } from "../../../bedrock/governance/useGovernance";

export interface GovAccessDeniedCardProps {
  scope: GovScope;
}

const ROW_CAP = 12;

const th: React.CSSProperties = {
  padding: "6px 8px",
  textAlign: "left",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-3)",
  borderBottom: "1px solid var(--border)",
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "6px 8px",
  fontSize: 12,
  borderBottom: "1px solid var(--border)",
};

const truncate: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  maxWidth: 200,
};

/**
 * "Access denied" (D-band problem-pattern card). AccessDenied on Bedrock calls
 * is deliberately ambiguous — it can be a working policy/SCP boundary doing its
 * job, or a broken pipeline silently failing — so this card just surfaces the
 * top identities/actions by denied-call volume for a human to triage, rather
 * than asserting either verdict itself. Table only renders once rows exist;
 * an empty result reads as "no denials", not a broken widget.
 */
export const GovAccessDeniedCard = ({ scope }: GovAccessDeniedCardProps) => {
  const { rows, isLoading } = useGovAccessDenied(scope);

  const totalDenied = useMemo(
    () => rows.reduce((sum, r) => sum + r.deniedCalls, 0),
    [rows],
  );

  const initial = isLoading && rows.length === 0;
  const visibleRows = rows.slice(0, ROW_CAP);
  const extra = rows.length - visibleRows.length;

  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={16}>
        <Flex flexDirection="column" gap={4}>
          <Flex alignItems="center" gap={6}>
            <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
              Access denied
            </Heading>
            <InfoTooltip text="AccessDenied can be an intentional policy/SCP denial (good governance) or a broken pipeline — investigate identities with a sudden burst." />
          </Flex>
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            AccessDenied can be an intentional policy/SCP denial (good
            governance) or a broken pipeline — investigate identities with a
            sudden burst.
          </Text>
        </Flex>

        {initial ? (
          <Skeleton style={{ height: 140, borderRadius: 8 }} />
        ) : rows.length === 0 ? (
          <EmptyState
            bare
            title="No access-denied events"
            description="No Bedrock call returned AccessDenied in this scope."
          />
        ) : (
          <Flex flexDirection="column" gap={12}>
            <Text
              style={{
                fontSize: 22,
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
                color:
                  totalDenied > 0 ? STATUS_COLOR.warning : "var(--text)",
              }}
            >
              {fmtCount(totalDenied)}
              <Text
                as="span"
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--text-3)",
                  marginLeft: 6,
                }}
              >
                denied calls
              </Text>
            </Text>

            <div style={{ overflowX: "auto" }}>
              <table
                style={{ width: "100%", borderCollapse: "collapse" }}
              >
                <thead>
                  <tr>
                    <th style={th}>Identity</th>
                    <th style={th}>Action</th>
                    <th style={th}>Source IP</th>
                    <th style={{ ...th, textAlign: "right" }}>Denied</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r, i) => (
                    <tr key={`${r.identity}-${r.sourceIp}-${r.eventName}-${i}`}>
                      <td style={td}>
                        <span
                          title={r.identity}
                          style={{
                            ...truncate,
                            display: "inline-block",
                            fontFamily: "var(--mono, monospace)",
                          }}
                        >
                          {r.identity || "—"}
                        </span>
                      </td>
                      <td style={td}>{r.eventName || "—"}</td>
                      <td style={td}>
                        <span
                          style={{ fontFamily: "var(--mono, monospace)" }}
                        >
                          {r.sourceIp || "—"}
                        </span>
                      </td>
                      <td
                        style={{
                          ...td,
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          color: STATUS_COLOR.warning,
                          fontWeight: 600,
                        }}
                      >
                        {fmtCount(r.deniedCalls)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {extra > 0 && (
              <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
                +{fmtCount(extra)} more
              </Text>
            )}
          </Flex>
        )}
      </Flex>
    </Surface>
  );
};
