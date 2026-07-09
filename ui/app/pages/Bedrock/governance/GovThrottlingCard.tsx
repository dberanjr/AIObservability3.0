import React, { useMemo } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { StatTile } from "../../../components/StatTile";
import { STATUS_COLOR } from "../../../theme/statusColor";
import { fmtCount } from "../../../data/format";
import type { GovScope } from "../../../bedrock/governance/types";
import { useGovThrottles } from "../../../bedrock/governance/useGovernance";

export interface GovThrottlingCardProps {
  scope: GovScope;
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: "var(--text-3)",
  borderBottom: "1px solid var(--border)",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "6px 8px",
  fontSize: 12,
  color: "var(--text)",
  borderBottom: "1px solid var(--border)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  maxWidth: 220,
};

/**
 * Reliability/quota card (D-band, Access & Governance). Reads
 * `useGovThrottles`, which parses CloudTrail data-plane events for
 * ThrottlingException / TooManyRequestsException against Bedrock. On the
 * target tenant there is usually NO throttling in-window — that is the
 * expected, healthy outcome, so the empty state reads calm/green rather than
 * the app's default neutral "nothing here" treatment (which would look like
 * the query failed to find anything, not that everything is fine).
 */
export const GovThrottlingCard = ({ scope }: GovThrottlingCardProps) => {
  const { rows, isLoading } = useGovThrottles(scope);

  const total = useMemo(() => rows.reduce((sum, r) => sum + r.throttledCalls, 0), [rows]);
  const sorted = useMemo(
    () => [...rows].sort((a, b) => b.throttledCalls - a.throttledCalls),
    [rows],
  );

  const initial = isLoading && rows.length === 0;

  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={16}>
        <Flex flexDirection="column" gap={2}>
          <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
            Throttling & rate limits
          </Heading>
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            ThrottlingException / TooManyRequestsException on Bedrock calls, from CloudTrail
            data-plane events in scope.
          </Text>
        </Flex>

        {initial ? (
          <Skeleton style={{ height: 140, borderRadius: 8 }} />
        ) : rows.length === 0 ? (
          <Flex
            flexDirection="column"
            alignItems="center"
            gap={8}
            style={{ padding: "20px 16px", textAlign: "center" }}
          >
            <span
              aria-hidden
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: STATUS_COLOR.good,
                display: "inline-block",
              }}
            />
            <Text style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
              No throttling in this window
            </Text>
            <Text style={{ fontSize: 11.5, color: "var(--text-3)", maxWidth: 420, lineHeight: 1.5 }}>
              No ThrottlingException / TooManyRequestsException on Bedrock calls in scope.
            </Text>
            <Text style={{ fontSize: 11.5, color: "var(--text-3)", maxWidth: 420, lineHeight: 1.5 }}>
              Watch TPM headroom on the Runtime Observability tab for early warning.
            </Text>
          </Flex>
        ) : (
          <Flex flexDirection="column" gap={16}>
            <StatTile
              label="Throttled calls"
              value={fmtCount(total)}
              tone="warn"
              cue
              info="Total Bedrock calls in scope that returned ThrottlingException or TooManyRequestsException (CloudTrail data-plane events)."
            />
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Identity</th>
                    <th style={thStyle}>Action</th>
                    <th style={thStyle}>Region</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Throttled</th>
                    <th style={thStyle}>Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r, i) => (
                    <tr key={`${r.identity}-${r.eventName}-${r.sourceIp}-${i}`}>
                      <td
                        style={{ ...tdStyle, fontFamily: "var(--mono, monospace)" }}
                        title={r.identity || "(unknown identity)"}
                      >
                        {r.identity || "(unknown identity)"}
                      </td>
                      <td style={tdStyle} title={r.eventName}>
                        {r.eventName}
                      </td>
                      <td style={tdStyle} title={r.region}>
                        {r.region || "—"}
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          color: STATUS_COLOR.warning,
                          fontWeight: 600,
                        }}
                      >
                        {fmtCount(r.throttledCalls)}
                      </td>
                      <td style={tdStyle} title={r.lastSeen}>
                        {r.lastSeen || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Text style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.5 }}>
              CloudTrail data-plane logging can be partial; CloudWatch InvocationThrottles is
              authoritative.
            </Text>
          </Flex>
        )}
      </Flex>
    </Surface>
  );
};
