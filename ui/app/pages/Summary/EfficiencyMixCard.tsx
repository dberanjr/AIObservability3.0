import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { StackedBar, type StackedSegment } from "../../components/charts/StackedBar";
import { MiniPartialDonut } from "../../components/charts/TileGlyphs";
import { fmtCount } from "../../data/format";
import { SummaryCard } from "./SummaryCard";
import { useTokenEfficiency } from "../Pulse/useTokenEfficiency";
import { useProviderMix } from "../Pulse/useProviderMix";

/**
 * Efficiency & provider-mix tile: the composite token-efficiency score (a gauge)
 * with output-per-dollar, and a provider-mix donut (Bedrock-proxied vendors
 * unwrapped, provider colors from the app palette). Drills to Models / FinOps.
 */
export const EfficiencyMixCard = () => {
  const eff = useTokenEfficiency();
  const mix = useProviderMix();

  const slices: StackedSegment[] = mix.shares.map((s) => ({
    key: s.provider,
    label: s.displayName,
    value: s.requests,
    color: s.color,
    sub: s.isBedrockProxy ? "Bedrock proxy" : undefined,
    filter: { attribute: "gen_ai.provider.name", values: s.rawProviders, label: s.displayName },
  }));

  return (
    <SummaryCard title="Efficiency & mix" drill={{ label: "Models", to: "/models" }}>
      {/* Two segmented halves: the efficiency gauge up top, the provider-mix
          donut centered in the space that remains below a hairline divider —
          so the tile reads as two deliberate blocks rather than a gauge with a
          donut floating in dead space. */}
      <Flex flexDirection="column" style={{ height: "100%" }}>
        <Flex alignItems="center" gap={16} style={{ paddingBottom: 16 }}>
          {eff.isLoading && eff.score == null ? (
            <Skeleton style={{ height: 80, width: 80, borderRadius: "50%" }} />
          ) : (
            <MiniPartialDonut
              size={80}
              thickness={12}
              percent={eff.score ?? 0}
              color="var(--primary, var(--blue))"
              centerValue={eff.score != null ? String(Math.round(eff.score)) : "—"}
            />
          )}
          <Flex flexDirection="column" gap={4}>
            <Text
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                color: "var(--text-3)",
              }}
            >
              Token efficiency
            </Text>
            <Text style={{ fontSize: 24, fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
              {eff.outputPerDollar != null ? `${fmtCount(eff.outputPerDollar)}` : "—"}
            </Text>
            <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
              output tokens per dollar
            </Text>
          </Flex>
        </Flex>

        <Flex
          flexDirection="column"
          gap={8}
          justifyContent="center"
          style={{
            flex: 1,
            minHeight: 0,
            paddingTop: 16,
            borderTop: "1px solid var(--border)",
          }}
        >
          <Text
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "var(--text-3)",
            }}
          >
            Provider mix
          </Text>
          {mix.isLoading && slices.length === 0 ? (
            <Skeleton style={{ height: 120, borderRadius: 8 }} />
          ) : slices.length === 0 ? (
            <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>No provider activity in scope.</Text>
          ) : (
            <StackedBar segments={slices} height={16} />
          )}
        </Flex>
      </Flex>
    </SummaryCard>
  );
};
