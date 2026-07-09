import React, { useMemo } from "react";
import { Skeleton } from "@dynatrace/strato-components/content";
import { EmptyState } from "../../../components/EmptyState";
import { MaximizablePanel } from "../../../components/MaximizablePanel";
import { DataTable, type DataColumn } from "../../../components/DataTable";
import { STATUS_COLOR } from "../../../theme/statusColor";
import { fmtCount } from "../../../data/format";
import type { AccessDeniedRow, GovScope } from "../../../bedrock/governance/types";
import { useGovAccessDenied } from "../../../bedrock/governance/useGovernance";

export interface GovAccessDeniedCardProps {
  scope: GovScope;
}

const columns: DataColumn<AccessDeniedRow>[] = [
  // "Identity/Account", shown in FULL (noTruncate) per request — resize/wrap
  // keeps it inside the column instead of clipping with an ellipsis.
  { key: "identity", header: "Identity/Account", render: (r) => r.identity || "—", mono: true, width: 260, noTruncate: true },
  { key: "action", header: "Action", render: (r) => r.eventName || "—", width: 160 },
  { key: "sourceIp", header: "Source IP", render: (r) => r.sourceIp || "—", mono: true, width: 160 },
  {
    key: "denied",
    header: "Denied",
    render: (r) => (
      <span style={{ color: STATUS_COLOR.warning, fontWeight: 600 }}>{fmtCount(r.deniedCalls)}</span>
    ),
    align: "right",
    width: 110,
  },
];

/**
 * "Access denied" (D-band problem-pattern card). AccessDenied on Bedrock calls
 * is deliberately ambiguous — it can be a working policy/SCP boundary doing its
 * job, or a broken pipeline silently failing — so this card just surfaces the
 * top identities/actions by denied-call volume for a human to triage, rather
 * than asserting either verdict itself. Wrapped in MaximizablePanel so it has a
 * full-screen focused view; the table is only rendered once rows exist — an
 * empty result reads as "no denials", not a broken widget.
 */
export const GovAccessDeniedCard = ({ scope }: GovAccessDeniedCardProps) => {
  const { rows, isLoading } = useGovAccessDenied(scope);

  const totalDenied = useMemo(
    () => rows.reduce((sum, r) => sum + r.deniedCalls, 0),
    [rows],
  );

  const initial = isLoading && rows.length === 0;

  const stats = [
    { label: "Denied calls", value: fmtCount(totalDenied) },
    { label: "Denied principals", value: fmtCount(rows.length) },
  ];

  const body = (expanded: boolean) => {
    const tableH = expanded ? 460 : 220;
    return initial ? (
      <Skeleton style={{ height: 140, borderRadius: 8 }} />
    ) : rows.length === 0 ? (
      <EmptyState
        bare
        title="No access-denied events"
        description="No Bedrock call returned AccessDenied in this scope."
      />
    ) : (
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r, i) => `${r.identity}-${r.sourceIp}-${r.eventName}-${i}`}
        maxHeight={tableH}
      />
    );
  };

  return (
    <MaximizablePanel
      title="Access denied"
      subtitle="AccessDenied can be an intentional policy/SCP denial (good governance) or a broken pipeline — investigate identities with a sudden burst."
      stats={stats}
      expanded={body(true)}
    >
      {body(false)}
    </MaximizablePanel>
  );
};
