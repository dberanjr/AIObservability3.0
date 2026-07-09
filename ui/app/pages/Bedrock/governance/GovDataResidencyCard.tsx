import React, { useMemo } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { StatTile } from "../../../components/StatTile";
import { EmptyState } from "../../../components/EmptyState";
import { InfoTooltip } from "../../../components/InfoTooltip";
import { STATUS_COLOR } from "../../../theme/statusColor";
import { fmtCount } from "../../../data/format";
import type { GovScope, CrossRegionRow } from "../../../bedrock/governance/types";
import { useGovCrossRegion } from "../../../bedrock/governance/useGovernance";
import { isResidencyException, regionFamily } from "../../../bedrock/governance/parse";

export interface GovDataResidencyCardProps {
  scope: GovScope;
}

/** Rows beyond this are collapsed behind a "+N more" footnote. Exceptions are
 *  always sorted to the front, so a residency flag never gets truncated away
 *  even on a tenant with many routine same-region routes. */
const ROW_CAP = 15;

/** Row color: a genuine residency exception (inference left the country) is
 *  critical; same-country cross-region inference is informational; a route
 *  that never left its own region is muted — it isn't "cross-region" at all,
 *  just a KPI-parity row from the same underlying query. */
const rowColor = (r: CrossRegionRow): string => {
  if (r.region === r.inferenceRegion) return STATUS_COLOR.neutral;
  const fa = regionFamily(r.region);
  const fb = regionFamily(r.inferenceRegion);
  return fa !== "" && fa === fb ? STATUS_COLOR.info : STATUS_COLOR.critical;
};

/**
 * Data-sovereignty compliance card (D-band, Access & Governance). Reads
 * `useGovCrossRegion` (region → inferenceRegion routing pairs from
 * CloudTrail) and applies the shared residency policy from parse.ts: a
 * cross-region route is only a *residency exception* when inference crossed
 * a geography boundary (region family), not merely a different region in the
 * same country (e.g. us-east-1 → us-east-2 is normal cross-region inference;
 * us-east-1 → ap-northeast-2 is a flag). For a bank this is the headline
 * signal — same-region and same-country rows exist for context but are
 * deliberately muted so the exception rows read as the point of the card.
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

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const aEx = isResidencyException(a.region, a.inferenceRegion);
      const bEx = isResidencyException(b.region, b.inferenceRegion);
      if (aEx !== bEx) return aEx ? -1 : 1;
      return b.calls - a.calls;
    });
  }, [rows]);

  const visibleRows = sortedRows.slice(0, ROW_CAP);
  const extra = sortedRows.length - visibleRows.length;
  const maxCalls = Math.max(1, ...rows.map((r) => r.calls));

  return (
    <Surface elevation="raised" padding={16}>
      <Flex flexDirection="column" gap={16}>
        <Flex flexDirection="column" gap={4}>
          <Flex alignItems="center" gap={6}>
            <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
              Cross-region inference &amp; data residency
            </Heading>
            <InfoTooltip text="A residency exception is a call whose inference ran in a different geography (region family) than requested — e.g. us-east-1 → ap-northeast-2. Same-family cross-region (us-east-1 → us-east-2) is normal cross-region inference, not a residency flag." />
          </Flex>
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            Where inference actually ran vs where it was requested. Same-country routing is
            normal; inference leaving the country is a residency flag.
          </Text>
        </Flex>

        {initial ? (
          <Skeleton style={{ height: 140, borderRadius: 8 }} />
        ) : rows.length === 0 ? (
          <EmptyState bare title="No cross-region inference in scope" />
        ) : (
          <Flex flexDirection="column" gap={16}>
            <StatTile
              label="calls left the request's country"
              value={fmtCount(exceptionCalls)}
              tone={exceptionCalls > 0 ? "critical" : "good"}
              cue
              sub={exceptionCalls === 0 ? "all inference stayed in-country" : undefined}
              info="Calls whose inference region belongs to a different geography than the requested region — a genuine data-sovereignty exception, not just ordinary cross-region inference within the same country."
            />

            <Flex flexDirection="column" gap={8}>
              {visibleRows.map((r) => {
                const isException = isResidencyException(r.region, r.inferenceRegion);
                const color = rowColor(r);
                const pct = maxCalls > 0 ? (r.calls / maxCalls) * 100 : 0;
                return (
                  <Flex
                    key={`${r.region}->${r.inferenceRegion}`}
                    flexDirection="column"
                    gap={4}
                  >
                    <Flex alignItems="baseline" justifyContent="space-between" gap={8}>
                      <Flex alignItems="center" gap={6} style={{ minWidth: 0, flex: 1 }}>
                        <Text
                          style={{
                            fontFamily: "var(--mono, monospace)",
                            fontSize: 12.5,
                            color: "var(--text)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={`${r.region} → ${r.inferenceRegion}`}
                        >
                          {r.region} → {r.inferenceRegion}
                        </Text>
                        {isException && (
                          <span
                            title="Inference ran outside the requested region's country."
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 3,
                              flex: "0 0 auto",
                              border: `1px solid ${STATUS_COLOR.critical}`,
                              borderRadius: 4,
                              padding: "0 4px",
                              whiteSpace: "nowrap",
                            }}
                          >
                            <span aria-hidden style={{ color: STATUS_COLOR.critical, fontSize: 10 }}>
                              ⚠
                            </span>
                            <Text
                              style={{
                                fontSize: 9.5,
                                fontWeight: 600,
                                color: STATUS_COLOR.critical,
                                whiteSpace: "nowrap",
                              }}
                            >
                              out-of-country
                            </Text>
                          </span>
                        )}
                      </Flex>
                      <Text
                        style={{
                          fontSize: 12.5,
                          fontWeight: 600,
                          color: "var(--text)",
                          fontVariantNumeric: "tabular-nums",
                          flex: "0 0 auto",
                        }}
                      >
                        {fmtCount(r.calls)}
                      </Text>
                    </Flex>
                    <div
                      title={`${r.region} → ${r.inferenceRegion}: ${fmtCount(r.calls)} calls`}
                      style={{
                        position: "relative",
                        height: 6,
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
              })}
            </Flex>
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
