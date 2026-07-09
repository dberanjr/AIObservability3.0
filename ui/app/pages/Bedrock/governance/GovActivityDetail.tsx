import React, { useMemo } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { BarList, type BarListItem } from "../../../components/charts/BarList";
import { AreaChart } from "../../../components/charts/AreaChart";
import { EmptyState } from "../../../components/EmptyState";
import { InfoTooltip } from "../../../components/InfoTooltip";
import { CATEGORICAL } from "../../../theme/palette";
import { STATUS_COLOR } from "../../../theme/statusColor";
import { fmtCount } from "../../../data/format";
import { useGovApiActions, useGovIdentities } from "../../../bedrock/governance/useGovernance";
import type { GovScope } from "../../../bedrock/governance/types";

export interface GovActivityDetailProps {
  scope: GovScope;
}

const buildAxisTicks = (labels: string[]): { index: number; label: string }[] => {
  if (labels.length === 0) return [];
  const step = Math.max(1, Math.floor(labels.length / 6));
  return labels
    .map((label, index) => ({ index, label }))
    .filter((_, i) => i % step === 0);
};

const TH_STYLE: React.CSSProperties = {
  textAlign: "left",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-3)",
  padding: "0 8px 6px 8px",
  borderBottom: "1px solid var(--border)",
  whiteSpace: "nowrap",
};

const TD_STYLE: React.CSSProperties = {
  fontSize: 12,
  padding: "6px 8px",
  borderBottom: "1px solid var(--border)",
  verticalAlign: "middle",
};

const truncateStyle: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  maxWidth: 200,
  display: "inline-block",
  verticalAlign: "bottom",
};

/** CloudTrail leaves `mfaAuthenticated` unset for most programmatic/service
 *  sessions, so the raw field commonly arrives as an empty string or the
 *  literal "null" — normalize those to a muted "n/a" instead of parroting
 *  the raw log noise back at the reader. */
const mfaLabel = (mfa: string): string => {
  const v = mfa.trim().toLowerCase();
  if (v === "" || v === "null" || v === "undefined") return "n/a";
  return mfa;
};

const mfaColor = (mfa: string): string => {
  const v = mfa.trim().toLowerCase();
  if (v === "true") return STATUS_COLOR.good;
  if (v === "false") return STATUS_COLOR.warning;
  return "var(--text-3)";
};

/**
 * Activity & identity (D7 detail): who called Bedrock, with what action, from
 * where, and whether the calling session carried MFA — the CloudTrail
 * identity surface that the D-band KPIs (GovKpiBand) only summarize as
 * counters. Three stacked rows: API-action mix + calls-over-time trend by
 * action, top identities/source IPs, then the full identity x MFA breakdown.
 *
 * All four `useGov*` queries here run at full fidelity (samplingRatio 1, see
 * useGovernance.ts) — these are security/audit counts, not approximated
 * chart trends, so no row is a sampled estimate.
 */
export const GovActivityDetail = ({ scope }: GovActivityDetailProps) => {
  const {
    rows: actionRows,
    timeseries,
    isLoading: actionsLoading,
  } = useGovApiActions(scope);
  const {
    topIdentities,
    topSourceIps,
    identityMfa,
    isLoading: identitiesLoading,
  } = useGovIdentities(scope);

  const actionItems: BarListItem[] = useMemo(
    () =>
      actionRows.map((r) => ({
        key: r.eventName,
        label: r.eventName,
        value: r.calls,
        displayValue: fmtCount(r.calls),
      })),
    [actionRows],
  );

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

  const identityItems: BarListItem[] = useMemo(
    () =>
      topIdentities.map((r) => ({
        key: r.identity,
        label: r.identity,
        value: r.calls,
        displayValue: fmtCount(r.calls),
      })),
    [topIdentities],
  );

  const actionsInitial = actionsLoading && actionRows.length === 0;
  const seriesInitial = actionsLoading && timeseries.series.length === 0;
  const identitiesInitial = identitiesLoading && topIdentities.length === 0;
  const ipsInitial = identitiesLoading && topSourceIps.length === 0;
  const mfaInitial = identitiesLoading && identityMfa.length === 0;

  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={16}>
        <Flex flexDirection="column" gap={2}>
          <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
            Activity & identity
          </Heading>
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            Which API actions ran, by whom, and from where — CloudTrail identity
            detail behind the headline counters above.
          </Text>
        </Flex>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
            gap: 24,
          }}
        >
          <Flex flexDirection="column" gap={8}>
            <Heading level={4} style={{ fontSize: 12.5, fontWeight: 600 }}>
              API actions
            </Heading>
            {actionsInitial ? (
              <Skeleton style={{ height: 140, borderRadius: 8 }} />
            ) : actionItems.length === 0 ? (
              <EmptyState
                bare
                title="No API actions in scope"
                description="No CloudTrail events matched the current scope."
              />
            ) : (
              <BarList items={actionItems} color={STATUS_COLOR.info} limit={8} />
            )}
          </Flex>

          <Flex flexDirection="column" gap={8}>
            <Heading level={4} style={{ fontSize: 12.5, fontWeight: 600 }}>
              Calls over time by action
            </Heading>
            {seriesInitial ? (
              <Skeleton style={{ height: 200, borderRadius: 8 }} />
            ) : areaSeries.length === 0 ? (
              <EmptyState
                bare
                title="No call activity in this window"
                description="No CloudTrail events to chart for the current scope."
              />
            ) : (
              <>
                <AreaChart
                  series={areaSeries}
                  height={200}
                  formatLeft={fmtCount}
                  xLabels={timeseries.labels}
                  axisTicks={axisTicks}
                  ariaLabel="Bedrock API calls over time by action"
                />
                <Flex gap={12} style={{ flexWrap: "wrap" }}>
                  {areaSeries.map((s) => (
                    <Flex key={s.key} alignItems="center" gap={4}>
                      <span
                        aria-hidden
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 2,
                          background: s.color,
                          flex: "0 0 auto",
                        }}
                      />
                      <Text style={{ fontSize: 11, color: "var(--text-3)" }}>{s.label}</Text>
                    </Flex>
                  ))}
                </Flex>
              </>
            )}
          </Flex>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
            gap: 24,
            paddingTop: 16,
            borderTop: "1px solid var(--border)",
          }}
        >
          <Flex flexDirection="column" gap={8}>
            <Heading level={4} style={{ fontSize: 12.5, fontWeight: 600 }}>
              Top identities
            </Heading>
            {identitiesInitial ? (
              <Skeleton style={{ height: 140, borderRadius: 8 }} />
            ) : identityItems.length === 0 ? (
              <EmptyState
                bare
                title="No identities in scope"
                description="No calling identities matched the current scope."
              />
            ) : (
              <BarList items={identityItems} color={CATEGORICAL[1]} limit={10} />
            )}
          </Flex>

          <Flex flexDirection="column" gap={8}>
            <Heading level={4} style={{ fontSize: 12.5, fontWeight: 600 }}>
              Top source IPs
            </Heading>
            {ipsInitial ? (
              <Skeleton style={{ height: 140, borderRadius: 8 }} />
            ) : topSourceIps.length === 0 ? (
              <EmptyState
                bare
                title="No source IPs in scope"
                description="No calling IP addresses matched the current scope."
              />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={TH_STYLE}>Source IP</th>
                      <th style={{ ...TH_STYLE, textAlign: "right" }}>Calls</th>
                      <th style={{ ...TH_STYLE, textAlign: "right" }}>Identities</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topSourceIps.slice(0, 10).map((r) => (
                      <tr key={r.sourceIp}>
                        <td style={TD_STYLE} title={r.sourceIp}>
                          <span style={{ ...truncateStyle, fontFamily: "var(--mono, monospace)" }}>
                            {r.sourceIp || "—"}
                          </span>
                        </td>
                        <td
                          style={{ ...TD_STYLE, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                        >
                          {fmtCount(r.calls)}
                        </td>
                        <td
                          style={{ ...TD_STYLE, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
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
        </div>

        <Flex
          flexDirection="column"
          gap={8}
          style={{ paddingTop: 16, borderTop: "1px solid var(--border)" }}
        >
          <Flex alignItems="center" gap={4}>
            <Heading level={4} style={{ fontSize: 12.5, fontWeight: 600 }}>
              Access by identity & MFA
            </Heading>
            <InfoTooltip
              text="MFA reflects the CloudTrail session's mfaAuthenticated flag. Programmatic access via IAM roles (service-to-service calls) carries no MFA by design, so n/a or false is expected there — treat human/console identities without MFA as the real flag."
              size={12}
            />
          </Flex>
          {mfaInitial ? (
            <Skeleton style={{ height: 180, borderRadius: 8 }} />
          ) : identityMfa.length === 0 ? (
            <EmptyState
              bare
              title="No identity/MFA rows in scope"
              description="No CloudTrail sessions matched the current scope."
            />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={TH_STYLE}>Identity</th>
                    <th style={TH_STYLE}>MFA</th>
                    <th style={{ ...TH_STYLE, textAlign: "right" }}>Calls</th>
                    <th style={{ ...TH_STYLE, textAlign: "right" }}>Source IPs</th>
                  </tr>
                </thead>
                <tbody>
                  {identityMfa.slice(0, 15).map((r, i) => (
                    <tr key={`${r.identity}-${r.mfa}-${i}`}>
                      <td style={TD_STYLE} title={r.identity}>
                        <span style={{ ...truncateStyle, fontFamily: "var(--mono, monospace)" }}>
                          {r.identity || "—"}
                        </span>
                      </td>
                      <td style={{ ...TD_STYLE, color: mfaColor(r.mfa), fontWeight: 600 }}>
                        {mfaLabel(r.mfa)}
                      </td>
                      <td
                        style={{ ...TD_STYLE, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                      >
                        {fmtCount(r.calls)}
                      </td>
                      <td
                        style={{ ...TD_STYLE, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                      >
                        {fmtCount(r.sourceIps)}
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
