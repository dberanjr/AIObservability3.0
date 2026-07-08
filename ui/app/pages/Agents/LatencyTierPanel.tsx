import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { fmtCount, fmtMs, fmtPercent } from "../../data/format";
import { CollapsibleCard } from "../../components/CollapsibleCard";
import { EmptyState, emptyCause } from "../../components/EmptyState";
import { useScanGroup, useScanScope } from "../../scope/ScanReportContext";
import { TIER_COLORS } from "./constants";
import {
  useLatencyDecomposition,
  type LatencyTier,
} from "./useLatencyDecomposition";

// Shared hue-per-concept map so the LLM/Tool/Retrieval/Orchestration tiers are
// colored identically here and in the row-level StageBreakdownBar above.
const TIER_COLOR: Record<LatencyTier, string> = {
  LLM: TIER_COLORS.llm,
  "Retrieval/DB": TIER_COLORS.retrieval,
  Tool: TIER_COLORS.tool,
  Orchestration: TIER_COLORS.orchestration,
};

// Body is a separate component so the query (useLatencyDecomposition) only runs
// when the section is expanded — CollapsibleCard renders children solely while
// open, so a collapsed section issues no DQL.
const LatencyTierBody = () => {
  const { tiers, totalMs, dominant, isLoading, error } =
    useLatencyDecomposition();
  // Classify the empty honestly: a query error must read as an error, and a
  // scan capped at its budget as "truncated", not a false "no AI spans"
  // (STATE-2 / STATE-4). limitHit is this tile's own scan-group truncation —
  // the "Latency by tier" scope holds exactly this one query, so it's precise.
  const limitHit = useScanGroup(useScanScope())?.limitHit ?? false;
  const emptyKind = emptyCause({ error, limitHit });

  return (
      <Flex flexDirection="column" gap={0}>
        {dominant && totalMs > 0 && (
          <Text
            style={{ fontSize: 11, color: "var(--text-3)", padding: "10px 16px 0" }}
          >
            <strong style={{ color: "var(--text)" }}>{dominant.tier}</strong>{" "}
            accounts for {fmtPercent(dominant.sharePct, 0)} of total execution
            time across the AI stack.
          </Text>
        )}
        {isLoading && tiers.length === 0 ? (
          <Flex flexDirection="column" gap={6} style={{ padding: 16 }}>
            <Skeleton style={{ height: 16 }} />
            <Skeleton style={{ height: 80 }} />
          </Flex>
        ) : tiers.length === 0 ? (
          <EmptyState
            bare
            cause={emptyKind}
            title={
              emptyKind === "no-activity"
                ? "No AI spans in the current scope."
                : undefined
            }
          />
        ) : (
          <Flex flexDirection="column" gap={12} style={{ padding: 16 }}>
            {/* Stacked share-of-total-time bar */}
            <div
              style={{
                display: "flex",
                width: "100%",
                height: 14,
                borderRadius: 7,
                overflow: "hidden",
                background: "var(--surface-3)",
              }}
            >
              {tiers.map((t) =>
                t.sharePct > 0 ? (
                  <div
                    key={t.tier}
                    title={`${t.tier} · ${fmtPercent(t.sharePct, 1)} of total time · ${fmtCount(
                      t.spans,
                    )} spans · avg ${fmtMs(t.avgMs)} · P95 ${fmtMs(t.p95Ms)}`}
                    style={{
                      width: `${t.sharePct}%`,
                      background: TIER_COLOR[t.tier],
                    }}
                  />
                ) : null,
              )}
            </div>

            {/* Per-tier table */}
            <Flex flexDirection="column" gap={0}>
              <Flex
                style={{
                  padding: "4px 0",
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  color: "var(--text-3)",
                }}
              >
                <span style={{ flex: 1 }}>Tier</span>
                <span style={{ width: 90, textAlign: "right" }}>Share</span>
                <span style={{ width: 90, textAlign: "right" }}>Spans</span>
                <span style={{ width: 90, textAlign: "right" }}>Avg</span>
                <span style={{ width: 90, textAlign: "right" }}>P95</span>
              </Flex>
              {tiers.map((t) => (
                <Flex
                  key={t.tier}
                  alignItems="center"
                  style={{
                    padding: "7px 0",
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  <Flex alignItems="center" gap={8} style={{ flex: 1, minWidth: 0 }}>
                    <span
                      aria-hidden
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 2,
                        background: TIER_COLOR[t.tier],
                        flex: "0 0 auto",
                      }}
                    />
                    <Text style={{ fontSize: 12.5 }}>{t.tier}</Text>
                  </Flex>
                  <Text
                    style={{
                      width: 90,
                      textAlign: "right",
                      fontSize: 12.5,
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: 600,
                    }}
                  >
                    {fmtPercent(t.sharePct, 1)}
                  </Text>
                  <Text
                    style={{
                      width: 90,
                      textAlign: "right",
                      fontSize: 12.5,
                      fontFamily: "var(--mono, monospace)",
                      fontVariantNumeric: "tabular-nums",
                      color: "var(--text-2)",
                    }}
                  >
                    {fmtCount(t.spans)}
                  </Text>
                  <Text
                    style={{
                      width: 90,
                      textAlign: "right",
                      fontSize: 12.5,
                      fontFamily: "var(--mono, monospace)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {fmtMs(t.avgMs)}
                  </Text>
                  <Text
                    style={{
                      width: 90,
                      textAlign: "right",
                      fontSize: 12.5,
                      fontFamily: "var(--mono, monospace)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {fmtMs(t.p95Ms)}
                  </Text>
                </Flex>
              ))}
            </Flex>
            <Text style={{ fontSize: 10.5, color: "var(--text-4)", lineHeight: 1.5 }}>
              Share = tier's summed span duration ÷ total across tiers. Note LLM
              spans run on the central proxy, so "share of total time" is a
              fleet-level view, not per-trace self-time.
            </Text>
          </Flex>
        )}
      </Flex>
  );
};

export const LatencyTierPanel = () => (
  <CollapsibleCard
    title="Latency by execution tier"
    info="Where wall-clock time is spent across the AI stack, by classifying every span into a tier (LLM / Retrieval-DB / Tool / Orchestration). Share = the tier's summed span duration ÷ the total across tiers. LLM spans run on the central proxy, so this is a fleet-level view of time, not per-trace self-time."
    subtitle="Where wall-clock time goes across the AI stack — model inference, retrieval/DB, tools, and orchestration."
    defaultOpen
  >
    <LatencyTierBody />
  </CollapsibleCard>
);
