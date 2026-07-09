import React, { useMemo } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { MaximizablePanel } from "../../../components/MaximizablePanel";
import { DataTable, type DataColumn } from "../../../components/DataTable";
import { STATUS_COLOR } from "../../../theme/statusColor";
import { fmtCount } from "../../../data/format";
import type { GovScope, ThrottleRow } from "../../../bedrock/governance/types";
import { useGovThrottles } from "../../../bedrock/governance/useGovernance";

export interface GovThrottlingCardProps {
  scope: GovScope;
}

const throttleColumns: DataColumn<ThrottleRow>[] = [
  // "Identity/Account", shown in FULL (noTruncate) per request — resize/wrap
  // keeps it inside the column instead of clipping with an ellipsis.
  {
    key: "identity",
    header: "Identity/Account",
    render: (r) => r.identity || "(unknown identity)",
    mono: true,
    width: 260,
    noTruncate: true,
  },
  { key: "action", header: "Action", render: (r) => r.eventName, width: 180 },
  { key: "region", header: "Region", render: (r) => r.region || "—", width: 120 },
  {
    key: "throttled",
    header: "Throttled",
    render: (r) => (
      <span style={{ color: STATUS_COLOR.warning, fontWeight: 600 }}>
        {fmtCount(r.throttledCalls)}
      </span>
    ),
    align: "right",
    width: 110,
  },
  { key: "lastSeen", header: "Last seen", render: (r) => r.lastSeen || "—", width: 160 },
];

/**
 * Reliability/quota card (D-band, Access & Governance). Reads
 * `useGovThrottles`, which parses CloudTrail data-plane events for
 * ThrottlingException / TooManyRequestsException against Bedrock. On the
 * target tenant there is usually NO throttling in-window — that is the
 * expected, healthy outcome, so the empty state reads calm/green rather than
 * the app's default neutral "nothing here" treatment (which would look like
 * the query failed to find anything, not that everything is fine). Wrapped in
 * MaximizablePanel so the (rare) full throttle table gets a focused, full-screen
 * view via DataTable.
 */
export const GovThrottlingCard = ({ scope }: GovThrottlingCardProps) => {
  const { rows, isLoading } = useGovThrottles(scope);

  const total = useMemo(() => rows.reduce((sum, r) => sum + r.throttledCalls, 0), [rows]);
  const sorted = useMemo(
    () => [...rows].sort((a, b) => b.throttledCalls - a.throttledCalls),
    [rows],
  );
  const distinctIdentities = useMemo(
    () => new Set(rows.map((r) => r.identity || "(unknown identity)")).size,
    [rows],
  );

  const initial = isLoading && rows.length === 0;

  const stats = [
    { label: "Throttled calls", value: fmtCount(total) },
    { label: "Throttled identities", value: fmtCount(distinctIdentities) },
  ];

  const healthyEmptyState = (large: boolean) => (
    <Flex
      flexDirection="column"
      alignItems="center"
      gap={8}
      style={{ padding: large ? "40px 16px" : "20px 16px", textAlign: "center" }}
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
      <Text style={{ fontSize: large ? 15 : 13, fontWeight: 600, color: "var(--text)" }}>
        No throttling in this window
      </Text>
      <Text style={{ fontSize: 11.5, color: "var(--text-3)", maxWidth: 420, lineHeight: 1.5 }}>
        No ThrottlingException / TooManyRequestsException on Bedrock calls in scope.
      </Text>
      <Text style={{ fontSize: 11.5, color: "var(--text-3)", maxWidth: 420, lineHeight: 1.5 }}>
        Watch TPM headroom on the Runtime Observability tab for early warning.
      </Text>
    </Flex>
  );

  const body = (expanded: boolean) => {
    const tableH = expanded ? 460 : 220;
    if (initial) {
      return <Skeleton style={{ height: 140, borderRadius: 8 }} />;
    }
    if (rows.length === 0) {
      return healthyEmptyState(expanded);
    }
    return (
      <Flex flexDirection="column" gap={16}>
        <DataTable
          columns={throttleColumns}
          rows={sorted}
          rowKey={(r, i) => `${r.identity}-${r.eventName}-${r.sourceIp}-${i}`}
          maxHeight={tableH}
        />
        <Text style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.5 }}>
          CloudTrail data-plane logging can be partial; CloudWatch InvocationThrottles is
          authoritative.
        </Text>
      </Flex>
    );
  };

  return (
    <MaximizablePanel
      title="Throttling & rate limits"
      subtitle="ThrottlingException / TooManyRequestsException on Bedrock calls, from CloudTrail data-plane events in scope."
      stats={rows.length === 0 ? undefined : stats}
      expanded={body(true)}
    >
      {body(false)}
    </MaximizablePanel>
  );
};
