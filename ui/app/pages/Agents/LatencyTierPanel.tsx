import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { fmtCount, fmtMs, fmtPercent } from "../../data/format";
import {
  useLatencyDecomposition,
  type LatencyTier,
} from "./useLatencyDecomposition";

const TIER_COLOR: Record<LatencyTier, string> = {
  LLM: "var(--purple-2)",
  "Retrieval/DB": "var(--cyan)",
  Tool: "var(--amber)",
  Orchestration: "var(--text-4)",
};

export const LatencyTierPanel = () => {
  const { tiers, totalMs, dominant, isLoading } = useLatencyDecomposition();

  return (
    <Surface elevation="raised" padding={0}>
      <Flex flexDirection="column" gap={0}>
        <Flex
          flexDirection="column"
          gap={2}
          style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}
        >
          <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
            Latency by execution tier
          </Heading>
          <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
            Where wall-clock time goes across the AI stack — model inference,
            retrieval/DB, tools, and orchestration.
            {dominant && totalMs > 0 && (
              <>
                {" "}
                <strong style={{ color: "var(--text)" }}>
                  {dominant.tier}
                </strong>{" "}
                accounts for {fmtPercent(dominant.sharePct, 0)} of total
                execution time.
              </>
            )}
          </Text>
        </Flex>

        {isLoading && tiers.length === 0 ? (
          <Flex flexDirection="column" gap={6} style={{ padding: 16 }}>
            <Skeleton style={{ height: 16 }} />
            <Skeleton style={{ height: 80 }} />
          </Flex>
        ) : tiers.length === 0 ? (
          <Flex style={{ padding: "28px 16px" }}>
            <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
              No AI spans in the current scope.
            </Text>
          </Flex>
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
                    title={`${t.tier} · ${fmtPercent(t.sharePct, 1)} of total time`}
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
    </Surface>
  );
};
