import React, { useMemo } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { BarList, type BarListItem } from "../../../components/charts/BarList";
import { EmptyState } from "../../../components/EmptyState";
import { InfoTooltip } from "../../../components/InfoTooltip";
import { MaximizablePanel } from "../../../components/MaximizablePanel";
import { DataTable, type DataColumn } from "../../../components/DataTable";
import { STATUS_COLOR } from "../../../theme/statusColor";
import { fmtCount } from "../../../data/format";
import type { GovScope } from "../../../bedrock/governance/types";
import { useGovIdentities } from "../../../bedrock/governance/useGovernance";

export interface GovAnomalousAccessCardProps {
  scope: GovScope;
}

const EYEBROW: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: "var(--text-3)",
};

/** An identity is flagged once its CloudTrail sessions touch 3+ distinct
 *  source IPs — a single identity fanning out across many IPs is the
 *  clearest shared/stolen-credential (shadow-AI, LLM-jacking) tell
 *  CloudTrail exposes. */
const SPREAD_THRESHOLD = 3;
/** A source IP is "shared" once 2+ distinct identities have called from it. */
const SHARED_THRESHOLD = 2;

interface WatchRow {
  identity: string;
  calls: number;
  sourceIps: number;
  flagged: boolean;
}

const watchColumns: DataColumn<WatchRow>[] = [
  // "Identity/Account", shown in FULL (noTruncate) per request — resize/wrap
  // keeps it inside the column instead of clipping with an ellipsis.
  {
    key: "identity",
    header: "Identity/Account",
    render: (r) => (
      <span style={{ color: r.sourceIps >= SPREAD_THRESHOLD ? STATUS_COLOR.warning : undefined }}>
        {r.identity || "—"}
      </span>
    ),
    mono: true,
    width: 280,
    noTruncate: true,
  },
  {
    key: "ips",
    header: "Source IPs",
    render: (r) => (
      <span style={{ color: r.sourceIps >= SPREAD_THRESHOLD ? STATUS_COLOR.warning : undefined, fontWeight: r.sourceIps >= SPREAD_THRESHOLD ? 600 : undefined }}>
        {fmtCount(r.sourceIps)}
      </span>
    ),
    align: "right",
    width: 110,
  },
  { key: "calls", header: "Calls", render: (r) => fmtCount(r.calls), align: "right", width: 110 },
];

/**
 * Headline security card (D-band): the strongest shadow-AI / credential-abuse
 * signal CloudTrail exposes, built from two angles on the same identity ↔
 * source-IP relationship:
 *  - left: identities collapsed from `identityMfa` (which carries one row per
 *    identity × mfa value — e.g. an identity seen both with and without MFA
 *    lands as two rows) into one row per identity, summing calls and taking
 *    the MAX sourceIps across its mfa rows, ranked by IP spread;
 *  - right: `topSourceIps` filtered to IPs shared by 2+ identities, ranked by
 *    identity count.
 * Both are correlational, not proof of compromise — a spread identity may be
 * a legitimate multi-AZ service role. That's why rows are flagged, not
 * removed: the card surfaces the pattern for a human to triage. Wrapped in
 * MaximizablePanel; the full-screen focused view adds the full watchlist as a
 * resizable DataTable (rows with 3+ source IPs tinted STATUS_COLOR.warning)
 * alongside the two BarLists.
 */
export const GovAnomalousAccessCard = ({ scope }: GovAnomalousAccessCardProps) => {
  const { topSourceIps, identityMfa, isLoading } = useGovIdentities(scope);

  const watchlist = useMemo<WatchRow[]>(() => {
    const byIdentity = new Map<string, { calls: number; sourceIps: number }>();
    for (const r of identityMfa) {
      if (!r.identity) continue;
      const prev = byIdentity.get(r.identity);
      if (prev) {
        prev.calls += r.calls;
        prev.sourceIps = Math.max(prev.sourceIps, r.sourceIps);
      } else {
        byIdentity.set(r.identity, { calls: r.calls, sourceIps: r.sourceIps });
      }
    }
    return Array.from(byIdentity.entries())
      .map(([identity, v]) => ({
        identity,
        calls: v.calls,
        sourceIps: v.sourceIps,
        flagged: v.sourceIps >= SPREAD_THRESHOLD,
      }))
      .sort((a, b) => b.sourceIps - a.sourceIps || b.calls - a.calls);
  }, [identityMfa]);

  const flaggedCount = useMemo(
    () => watchlist.filter((r) => r.flagged).length,
    [watchlist],
  );

  const leftItems = useMemo<BarListItem[]>(
    () =>
      watchlist.map((r) => ({
        key: r.identity,
        label: r.identity,
        value: r.sourceIps,
        displayValue: `${r.sourceIps} IPs`,
        secondary: `${fmtCount(r.calls)} calls`,
      })),
    [watchlist],
  );

  const sharedIps = useMemo(
    () =>
      topSourceIps
        .filter((r) => r.identities >= SHARED_THRESHOLD)
        .sort((a, b) => b.identities - a.identities || b.calls - a.calls),
    [topSourceIps],
  );

  const rightItems = useMemo<BarListItem[]>(
    () =>
      sharedIps.map((r) => ({
        key: r.sourceIp,
        label: r.sourceIp,
        value: r.identities,
        displayValue: `${r.identities} identities`,
        secondary: `${fmtCount(r.calls)} calls · ${r.sourceIp}`,
      })),
    [sharedIps],
  );

  const leftColor = (item: BarListItem): string => {
    const row = watchlist.find((r) => r.identity === item.key);
    return row?.flagged ? STATUS_COLOR.warning : STATUS_COLOR.info;
  };

  const initial = isLoading && identityMfa.length === 0;
  const empty = !initial && watchlist.length === 0 && sharedIps.length === 0;

  const stats = [
    { label: `Identities spanning ${SPREAD_THRESHOLD}+ IPs`, value: fmtCount(flaggedCount) },
    { label: "Shared source IPs", value: fmtCount(sharedIps.length) },
    { label: "Total identities", value: fmtCount(watchlist.length) },
  ];

  const body = (expanded: boolean) => (
    <Flex flexDirection="column" gap={16}>
      <Flex alignItems="baseline" gap={6}>
        {flaggedCount > 0 ? (
          <>
            <Text
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: STATUS_COLOR.warning,
                fontVariantNumeric: "tabular-nums",
                lineHeight: 1,
              }}
            >
              {fmtCount(flaggedCount)}
            </Text>
            <Text style={{ fontSize: 12.5, color: "var(--text-2)" }}>
              identities span {SPREAD_THRESHOLD}+ source IPs
            </Text>
          </>
        ) : (
          <Text
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: STATUS_COLOR.good,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            no identity IP-spread anomalies
          </Text>
        )}
      </Flex>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 24,
        }}
      >
        <Flex flexDirection="column" gap={8}>
          <Text style={EYEBROW}>Identities by IP spread</Text>
          {leftItems.length === 0 ? (
            <Text style={{ fontSize: 12, color: "var(--text-3)" }}>
              No identity access data in this scope.
            </Text>
          ) : (
            <BarList items={leftItems} color={leftColor} limit={expanded ? 20 : 8} />
          )}
        </Flex>

        <Flex flexDirection="column" gap={8}>
          <Text style={EYEBROW}>Shared source IPs</Text>
          {rightItems.length === 0 ? (
            <Text style={{ fontSize: 12, color: "var(--text-3)" }}>
              No source IP is shared across identities.
            </Text>
          ) : (
            <BarList items={rightItems} color={STATUS_COLOR.warning} limit={expanded ? 20 : 8} />
          )}
        </Flex>
      </div>

      {expanded && (
        <Flex
          flexDirection="column"
          gap={8}
          style={{ paddingTop: 16, borderTop: "1px solid var(--border)" }}
        >
          <Text style={EYEBROW}>Full watchlist</Text>
          {watchlist.length === 0 ? (
            <Text style={{ fontSize: 12, color: "var(--text-3)" }}>
              No identity access data in this scope.
            </Text>
          ) : (
            <DataTable columns={watchColumns} rows={watchlist} rowKey={(r) => r.identity} maxHeight={460} />
          )}
        </Flex>
      )}
    </Flex>
  );

  return (
    <MaximizablePanel
      title="Anomalous access watch"
      subtitle="Identities spread across many source IPs, and IPs shared by many identities — the strongest shadow-AI / credential-abuse signal CloudTrail exposes."
      headerRight={
        <InfoTooltip
          text="Flags identities whose CloudTrail sessions touched 3+ distinct source IPs, and source IPs called from by 2+ distinct identities — patterns consistent with shared/stolen credentials, shadow-AI tooling, or LLM-jacking. Correlational, not proof of compromise: investigate a flagged identity's call pattern (event names, regions, timing) before rotating credentials."
          size={12}
        />
      }
      stats={stats}
      expanded={body(true)}
    >
      {initial ? (
        <Skeleton style={{ height: 220, borderRadius: 8 }} />
      ) : empty ? (
        <EmptyState
          bare
          title="No anomalous access signal"
          description="No identity or source-IP activity in this scope to evaluate."
        />
      ) : (
        body(false)
      )}
    </MaximizablePanel>
  );
};
