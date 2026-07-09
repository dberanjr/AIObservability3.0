import React, { useMemo } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { Sparkline } from "../../components/charts/Sparkline";
import { EstimatedBadge } from "../../components/DetailModal";
import { fmtUSDPrecise } from "../../data/format";
import { useBedrockCost, useBedrockCostSpark, useBedrockPerf } from "../../bedrock/useBedrock";
import { STATUS_COLOR } from "../../theme/statusColor";
import type { BedrockScope } from "../../bedrock/types";
import { computeInsights, buildInsightsInput, type Insight } from "./insights";
import { windowDays } from "../../scope/chartInterval";

export interface BedrockHeroProps {
  scope: BedrockScope;
}

const TONE_COLOR: Record<Insight["tone"], string> = {
  warn: STATUS_COLOR.warning,
  info: STATUS_COLOR.info,
  good: STATUS_COLOR.good,
};

const InsightRow = ({ insight }: { insight: Insight }) => (
  <Flex alignItems="flex-start" gap={8}>
    <span
      aria-hidden
      style={{
        marginTop: 5,
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: TONE_COLOR[insight.tone],
        flex: "0 0 auto",
      }}
    />
    <Text style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.5 }}>
      {insight.text}
    </Text>
  </Flex>
);

/**
 * Narrative hero: the page's cost headline (total, an estimated-rate badge
 * when any model fell back to blended pricing, a 30-day run-rate projection,
 * and a spend sparkline) paired with up to three computed insight sentences
 * (cost concentration, latency outlier, cache savings — see insights.ts).
 *
 * The insights-input derivation (re-keying `daily[].byModel` through
 * `normalizeBedrockModelId` so it lines up with `perfRows`' `model` field —
 * see `buildInsightsInput`'s doc comment for why the re-key matters) is
 * shared with BedrockFindings (D6), which renders the same insights as
 * FindingCards.
 */
export const BedrockHero = ({ scope }: BedrockHeroProps) => {
  const { daily, summary, isLoading: costLoading } = useBedrockCost(scope);
  const { values: sparkSeries, labels: sparkLabels } = useBedrockCostSpark(scope);
  const { rows: perfRows, isLoading: perfLoading } = useBedrockPerf(scope);

  const insights = useMemo(
    () => computeInsights(buildInsightsInput({ daily, summary, perfRows })),
    [daily, summary, perfRows],
  );

  // Real elapsed days in the scope window (NOT the chart's bucket count, which
  // only equals the day count at a 1-day interval — the adaptive granularity
  // broke that), so the 30-day run-rate projection is correct at every timeframe.
  const dayCount = windowDays(scope.timeframe.from);
  const projected = (summary.total * 30) / dayCount;

  const initialLoading = (costLoading && daily.length === 0) || (perfLoading && perfRows.length === 0);
  // Finer-grained series for the spark (useBedrockCostSpark) so the trend reads
  // smooth; fall back to the daily points until the spark query resolves.
  const sparkValues = sparkSeries.length > 0 ? sparkSeries : daily.map((d) => d.actual);
  const sparkDayLabels = sparkSeries.length > 0 ? sparkLabels : daily.map((d) => d.day);

  return (
    <Surface elevation="raised" padding={0}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 24,
          padding: "18px 20px",
        }}
      >
        <Flex
          flexDirection="column"
          gap={8}
          style={{
            borderRight: "1px solid var(--border)",
            paddingRight: 24,
            minWidth: 0,
          }}
        >
          <Text
            style={{
              fontSize: "var(--eyebrow-size, 11px)",
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "var(--text-3)",
            }}
          >
            Total spend
          </Text>
          {initialLoading ? (
            <Skeleton style={{ height: 34, width: "60%", borderRadius: 6 }} />
          ) : (
            <Flex alignItems="baseline" gap={8} style={{ flexWrap: "wrap" }}>
              <Text
                style={{
                  fontSize: 30,
                  fontWeight: 700,
                  lineHeight: 1,
                  color: "var(--text)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {summary.total > 0 ? fmtUSDPrecise(summary.total) : "$0"}
              </Text>
              {summary.estimated > 0 && <EstimatedBadge />}
            </Flex>
          )}
          {!initialLoading && (
            <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
              ≈ {projected > 0 ? fmtUSDPrecise(projected) : "$0"} projected over 30 days
            </Text>
          )}
          {initialLoading ? (
            <Skeleton style={{ height: 32, borderRadius: 6 }} />
          ) : (
            <Sparkline
              values={sparkValues}
              labels={sparkDayLabels}
              color="var(--blue)"
              height={32}
              valueFormatter={(n) => fmtUSDPrecise(n)}
              ariaLabel="Bedrock spend trend"
            />
          )}
        </Flex>

        <Flex flexDirection="column" gap={8} style={{ minWidth: 0, justifyContent: "center" }}>
          <Text
            style={{
              fontSize: "var(--eyebrow-size, 11px)",
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "var(--text-3)",
            }}
          >
            Signals in this scope
          </Text>
          {initialLoading ? (
            <Flex flexDirection="column" gap={8}>
              <Skeleton style={{ height: 14, width: "90%", borderRadius: 4 }} />
              <Skeleton style={{ height: 14, width: "75%", borderRadius: 4 }} />
            </Flex>
          ) : insights.length > 0 ? (
            <Flex flexDirection="column" gap={8}>
              {insights.map((insight) => (
                <InsightRow key={insight.text} insight={insight} />
              ))}
            </Flex>
          ) : (
            <Text style={{ fontSize: 12.5, color: "var(--text-3)" }}>
              No concentrated cost or latency signals in this scope.
            </Text>
          )}
        </Flex>
      </div>
    </Surface>
  );
};
