import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { Sparkline } from "../components/charts/Sparkline";
import { MiniStat } from "../components/MiniStat";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { fmtCount, fmtPercent, fmtMs } from "../data/format";
import { SummaryCard } from "../pages/Summary/SummaryCard";
import { useGuardrails } from "./useGuardrails";
import { guardrailTone, type GuardrailTone } from "./guardrailsLogic";

export const GUARDRAIL_TONE_COLOR: Record<GuardrailTone, string> = {
  quiet: "var(--text-3)",
  clean: "var(--green-2)",
  watch: "var(--amber)",
  high: "var(--red)",
};

/**
 * Summary front-door guardrails tile: the fleet intervention rate (blocked ÷
 * evaluated), a mini trend, and active/configured coverage + top blocker.
 * Drills to Pulse where the full guardrails panel lives.
 */
export const GuardrailsSummaryCard = () => {
  const g = useGuardrails();
  const tone = guardrailTone(g.fleet.interventionRate, g.fleet.invocations);
  const trendVals = g.trendRate.map((v) => (v == null ? 0 : v));

  return (
    <SummaryCard
      title="AI Guardrails"
      info="AWS Bedrock Guardrails, from cloud metrics (there are no span attributes for these). The headline intervention rate = total interventions ÷ total invocations across every guardrail in the window. Guardrail metrics are sparse — widen the timeframe if empty. The sparkline is the per-bucket intervention rate (gaps where a bucket had no invocations)."
      subtitle="Bedrock guardrail interventions"
      drill={{ label: "Pulse", to: "/pulse" }}
    >
      {g.isLoading && !g.hasData ? (
        <Skeleton style={{ height: 110, borderRadius: 8 }} />
      ) : g.error ? (
        <ErrorState bare error={g.error} />
      ) : !g.hasData ? (
        <EmptyState
          bare
          title="No guardrail activity in scope"
          description="No AWS Bedrock Guardrails reported invocations in this timeframe. Guardrail metrics are sparse — widen the timeframe to see activity."
        />
      ) : (
        <Flex flexDirection="column" gap={12} style={{ height: "100%" }}>
          <Flex alignItems="baseline" gap={8} style={{ flexWrap: "wrap" }}>
            <Text
              style={{
                fontSize: 26,
                fontWeight: 700,
                lineHeight: 1,
                color: GUARDRAIL_TONE_COLOR[tone],
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {fmtPercent(g.fleet.interventionRate)}
            </Text>
            <Text style={{ fontSize: 12, color: "var(--text-3)" }}>
              intervention rate · {fmtCount(g.fleet.intervened)} of{" "}
              {fmtCount(g.fleet.invocations)} blocked
            </Text>
          </Flex>
          {trendVals.length > 1 && (
            <Sparkline values={trendVals} color={GUARDRAIL_TONE_COLOR[tone]} height={30} />
          )}
          <Flex gap={16} style={{ marginTop: "auto" }}>
            <MiniStat
              label="Guardrails"
              value={`${g.fleet.activeGuardrails}/${g.fleet.guardrails}`}
              sub="active / configured"
              info="Active ÷ configured = guardrails with at least one invocation ÷ guardrails that reported any metric in the window."
            />
            <MiniStat
              label="Avg latency"
              value={fmtMs(g.fleet.avgLatencyMs)}
              sub="guardrail"
              info="Invocation-weighted average guardrail evaluation latency (ms), so a low-traffic guardrail can't skew the fleet number the way an unweighted mean would."
            />
            {g.fleet.topIntervening && (
              <MiniStat
                label="Top blocker"
                value={g.fleet.topIntervening.guardrailId}
                sub={`${fmtCount(g.fleet.topIntervening.intervened)} blocked`}
                info="The guardrail with the most interventions in the window; the sub-count is how many invocations it blocked."
              />
            )}
          </Flex>
        </Flex>
      )}
    </SummaryCard>
  );
};
