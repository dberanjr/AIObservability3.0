import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { StackedBar, type StackedSegment } from "../../components/charts/StackedBar";
import { MiniPartialDonut } from "../../components/charts/TileGlyphs";
import { InfoTooltip } from "../../components/InfoTooltip";
import { fmtCount } from "../../data/format";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { SummaryCard } from "./SummaryCard";
import { useTokenEfficiency } from "../Pulse/useTokenEfficiency";
import { useProviderMix } from "../Pulse/useProviderMix";

/**
 * Efficiency & provider-mix tile: the composite token-efficiency score (a gauge)
 * with output-per-dollar, and a provider-mix donut (Bedrock-proxied vendors
 * unwrapped, provider colors from the app palette). Drills to Models / FinOps.
 */
export const EfficiencyMixCard = ({ showExample = false }: { showExample?: boolean }) => {
  const eff = useTokenEfficiency(showExample);
  const mix = useProviderMix(showExample);

  const slices: StackedSegment[] = mix.shares.map((s) => ({
    key: s.provider,
    label: s.displayName,
    value: s.requests,
    color: s.color,
    sub: s.isBedrockProxy ? "Bedrock proxy" : undefined,
    filter: { attribute: "gen_ai.provider.name", values: s.rawProviders, label: s.displayName },
  }));

  return (
    <SummaryCard
      title="Efficiency & mix"
      info="Two views. Left: the token-efficiency score (a composite gauge — see its own tooltip) with output tokens per dollar = total output tokens ÷ total cost, each model priced at its own rate, embedding/rerank models excluded. Right: provider mix = share of requests by gen_ai.provider.name, extrapolated for sampling, with Bedrock-proxied vendors unwrapped to the real vendor."
      drill={{ label: "Models", to: "/models" }}
    >
      {/* Two segmented halves: the efficiency gauge up top, the provider-mix
          donut centered in the space that remains below a hairline divider —
          so the tile reads as two deliberate blocks rather than a gauge with a
          donut floating in dead space. */}
      <Flex flexDirection="column" style={{ height: "100%" }}>
        {eff.error ? (
          // Surface the efficiency query's own error instead of silently
          // rendering the "—" placeholders as if the score were absent (SUM-3).
          <div style={{ paddingBottom: 16 }}>
            <ErrorState bare error={eff.error} />
          </div>
        ) : (
          <Flex alignItems="center" gap={16} style={{ paddingBottom: 16 }}>
            {eff.isLoading && eff.score == null ? (
              <Skeleton style={{ height: 80, width: 80, borderRadius: "50%" }} />
            ) : (
              // Caption the gauge as a /100 score + track ring so it reads as a
              // distinct metric from the output-per-dollar figure beside it, not
              // a second scale of the same number (SUM-12).
              <Flex flexDirection="column" alignItems="center" gap={2} style={{ flex: "0 0 auto" }}>
                <MiniPartialDonut
                  size={80}
                  thickness={12}
                  track
                  percent={eff.score ?? 0}
                  color="var(--primary, var(--blue))"
                  centerValue={eff.score != null ? String(Math.round(eff.score)) : "—"}
                  ariaLabel={`Token-efficiency score ${eff.score != null ? Math.round(eff.score) : "unavailable"} of 100`}
                />
                <Flex alignItems="center" gap={4}>
                  <Text style={{ fontSize: 9.5, color: "var(--text-3)" }}>score / 100</Text>
                  <InfoTooltip
                    text="Token-efficiency score, 0–100 = 100 × (0.5 × leverage + 0.3 × completion + 0.2 × throughput). Leverage = output ÷ (input + output) tokens; completion = 1 − truncation rate; throughput = min(1, output tokens/sec ÷ 60 target). Embedding/rerank models are excluded. This measures cost/throughput efficiency, not answer quality."
                    size={12}
                  />
                </Flex>
              </Flex>
            )}
            <Flex flexDirection="column" gap={4}>
              <Flex alignItems="center" gap={4}>
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
                <InfoTooltip
                  text="Output tokens produced per US dollar = total output tokens ÷ total cost, with each model priced at its own per-token rate. Embedding/rerank models are excluded (they emit no output tokens). Higher means more generated text per dollar spent."
                  size={12}
                />
              </Flex>
              {/* Skeleton the figure while it loads instead of a bare em-dash,
                  so the tile uses the same loading idiom as the gauge and the
                  provider-mix half below (STATE-5). A genuine null (loaded, no
                  priced output) still reads as "—". */}
              {eff.isLoading && eff.outputPerDollar == null ? (
                <Skeleton style={{ height: 24, width: 88, borderRadius: 6 }} />
              ) : (
                <Text style={{ fontSize: 24, fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                  {eff.outputPerDollar != null ? `${fmtCount(eff.outputPerDollar)}` : "—"}
                </Text>
              )}
              <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
                output tokens per dollar
              </Text>
            </Flex>
          </Flex>
        )}

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
          <Flex alignItems="center" gap={4}>
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
            <InfoTooltip
              text="Share of requests by provider = each provider's request count ÷ total requests (gen_ai.provider.name), extrapolated for sampling. Bedrock-proxied vendors are unwrapped to the real vendor and flagged 'Bedrock proxy'. Each segment click-filters to that provider."
              size={12}
            />
          </Flex>
          {mix.isLoading && slices.length === 0 ? (
            <Skeleton style={{ height: 120, borderRadius: 8 }} />
          ) : mix.error ? (
            <ErrorState bare error={mix.error} />
          ) : slices.length === 0 ? (
            <EmptyState
              bare
              title="No provider activity in scope"
              description="No spans carried a gen_ai.provider.name for this timeframe and scope."
            />
          ) : (
            <StackedBar
              segments={slices}
              height={16}
              // Segment value is a request count (extrapolated for sampling) —
              // round to a grouped integer with an explicit unit on hover
              // instead of the raw fractional default.
              formatValue={(seg) => `${fmtCount(seg.value)} req`}
            />
          )}
        </Flex>
      </Flex>
    </SummaryCard>
  );
};
