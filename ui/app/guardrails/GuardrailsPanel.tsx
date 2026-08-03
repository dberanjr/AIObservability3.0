import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { Sparkline } from "../components/charts/Sparkline";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { fmtCount, fmtPercent, fmtMs } from "../data/format";
import { useGuardrails } from "./useGuardrails";
import { guardrailTone, type GuardrailRow } from "./guardrailsLogic";
import { GUARDRAIL_TONE_COLOR } from "./GuardrailsSummaryCard";
import { GUARDRAIL_PROVIDERS } from "./providers";

const eyebrow: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: "var(--text-3)",
};

const GuardrailRowView = ({ r }: { r: GuardrailRow }) => {
  const tone = guardrailTone(r.interventionRate, r.invocations);
  const color = GUARDRAIL_TONE_COLOR[tone];
  return (
    <Flex alignItems="center" gap={8} style={{ minWidth: 0, padding: "5px 0", borderTop: "1px solid var(--border)" }}>
      <Text
        style={{ fontFamily: "var(--mono, monospace)", fontSize: 11.5, color: "var(--text)", width: 108, flex: "0 0 auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        title={r.arn}
      >
        {r.guardrailId}
      </Text>
      <Text style={{ fontSize: 10.5, color: "var(--text-3)", width: 68, flex: "0 0 auto" }}>{r.region}</Text>
      <Text style={{ fontSize: 11.5, fontVariantNumeric: "tabular-nums", color: "var(--text-2)", width: 60, textAlign: "right", flex: "0 0 auto" }}>
        {fmtCount(r.invocations)}
      </Text>
      <div style={{ flex: 1, minWidth: 40, height: 8, borderRadius: 999, background: "var(--surface-3, var(--border))", overflow: "hidden" }}>
        <div style={{ width: `${Math.max(0, Math.min(100, r.interventionRate))}%`, height: "100%", borderRadius: 999, background: color }} />
      </div>
      <Text style={{ fontSize: 11.5, fontWeight: 700, fontVariantNumeric: "tabular-nums", color, width: 48, textAlign: "right", flex: "0 0 auto" }}>
        {fmtPercent(r.interventionRate)}
      </Text>
      <Text style={{ fontSize: 10.5, color: "var(--text-3)", width: 56, textAlign: "right", flex: "0 0 auto" }}>{fmtMs(r.avgLatencyMs)}</Text>
    </Flex>
  );
};

/**
 * Pulse guardrails panel: the fleet intervention-rate trend, a per-guardrail
 * table (invocations · intervention-rate bar · latency), and configured-vs-active
 * coverage. Rich view; the Summary card + Prompts strip link here.
 */
export const GuardrailsPanel = ({ showExample = false }: { showExample?: boolean }) => {
  const g = useGuardrails(showExample);
  const tone = guardrailTone(g.fleet.interventionRate, g.fleet.invocations);
  const rows = g.rows.slice(0, 12);
  const dormant = GUARDRAIL_PROVIDERS.filter((p) => !p.available).map((p) => p.label);
  const trendVals = g.trendRate.map((v) => (v == null ? 0 : v));

  return (
    <Surface elevation="raised" padding={16} style={{ minWidth: 0, overflow: "hidden" }}>
      <Flex flexDirection="column" gap={12} style={{ minWidth: 0 }}>
        <Flex alignItems="center" gap={8} justifyContent="space-between" style={{ minWidth: 0 }}>
          <Flex alignItems="center" gap={8} style={{ minWidth: 0 }}>
            <Text style={{ fontSize: 14, fontWeight: 700 }}>AI Guardrails</Text>
            <Text style={eyebrow}>AWS Bedrock</Text>
          </Flex>
          {g.hasData && (
            <Text style={{ fontSize: 12, color: "var(--text-3)" }}>
              <Text as="span" style={{ fontSize: 18, fontWeight: 700, color: GUARDRAIL_TONE_COLOR[tone], fontVariantNumeric: "tabular-nums" }}>
                {fmtPercent(g.fleet.interventionRate)}
              </Text>{" "}
              fleet intervention rate
            </Text>
          )}
        </Flex>

        {g.isLoading && !g.hasData ? (
          <Skeleton style={{ height: 180, borderRadius: 8 }} />
        ) : g.error ? (
          <ErrorState bare error={g.error} />
        ) : !g.hasData ? (
          <EmptyState
            bare
            title="No guardrail activity in scope"
            description="No AWS Bedrock Guardrails reported invocations in this timeframe. These CloudWatch metrics are sparse — widen the timeframe. Azure Content Safety and GCP Model Armor will appear here automatically once their data is present."
          />
        ) : (
          <>
            {trendVals.length > 1 && (
              <div>
                <Text style={eyebrow}>Intervention rate · trend</Text>
                <Sparkline values={trendVals} color={GUARDRAIL_TONE_COLOR[tone]} height={44} />
              </div>
            )}

            <div>
              <Flex alignItems="center" gap={8} style={{ padding: "0 0 4px" }}>
                <Text style={{ ...eyebrow, width: 108, flex: "0 0 auto" }}>Guardrail</Text>
                <Text style={{ ...eyebrow, width: 68, flex: "0 0 auto" }}>Region</Text>
                <Text style={{ ...eyebrow, width: 60, textAlign: "right", flex: "0 0 auto" }}>Evals</Text>
                <Text style={{ ...eyebrow, flex: 1 }}>Intervention rate</Text>
                <Text style={{ ...eyebrow, width: 48, textAlign: "right", flex: "0 0 auto" }}>Rate</Text>
                <Text style={{ ...eyebrow, width: 56, textAlign: "right", flex: "0 0 auto" }}>Latency</Text>
              </Flex>
              {rows.map((r) => (
                <GuardrailRowView key={r.arn} r={r} />
              ))}
              {g.rows.length > rows.length && (
                <Text style={{ fontSize: 10.5, color: "var(--text-3)", paddingTop: 6 }}>
                  +{g.rows.length - rows.length} more guardrails
                </Text>
              )}
            </div>

            <Flex alignItems="center" gap={8} style={{ flexWrap: "wrap", paddingTop: 4, borderTop: "1px solid var(--border)" }}>
              <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
                <strong>{g.fleet.activeGuardrails}</strong> active of{" "}
                <strong>{g.fleet.guardrails}</strong> configured
                {g.rows[0]?.account ? ` · account ${g.rows[0].account}` : ""}
                {" · "}
                {fmtCount(g.fleet.invocations)} evaluations · {fmtCount(g.fleet.intervened)} blocked
              </Text>
              {dormant.length > 0 && (
                <Text style={{ fontSize: 10, color: "var(--text-3)", marginLeft: "auto", fontStyle: "italic" }}>
                  ready for: {dormant.join(" · ")}
                </Text>
              )}
            </Flex>
          </>
        )}
      </Flex>
    </Surface>
  );
};
