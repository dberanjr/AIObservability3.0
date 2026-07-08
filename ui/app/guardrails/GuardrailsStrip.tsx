import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { fmtCount, fmtPercent } from "../data/format";
import { useGuardrails } from "./useGuardrails";
import { guardrailTone } from "./guardrailsLogic";
import { GUARDRAIL_TONE_COLOR } from "./GuardrailsSummaryCard";

/**
 * Compact guardrails strip for the Prompts page — guardrails gate the prompt /
 * response I/O this page analyzes, so it surfaces the fleet intervention rate
 * and the top blocking guardrails inline (metrics are guardrail-scoped, not
 * per-prompt). Renders nothing while loading-empty; a one-line note when there's
 * no guardrail activity. Full detail lives on Pulse.
 */
export const GuardrailsStrip = () => {
  const g = useGuardrails();
  if (g.isLoading && !g.hasData) return null;
  if (g.error) return null;

  const tone = guardrailTone(g.fleet.interventionRate, g.fleet.invocations);
  const top = g.rows.filter((r) => r.intervened > 0).slice(0, 3);

  return (
    <Surface
      elevation="raised"
      padding={12}
      style={{ minWidth: 0, overflow: "hidden" }}
    >
      <Flex alignItems="center" gap={12} style={{ flexWrap: "wrap", minWidth: 0 }}>
        <Text
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "var(--text-3)",
            flex: "0 0 auto",
          }}
        >
          AI Guardrails
        </Text>

        {!g.hasData ? (
          <Text style={{ fontSize: 12, color: "var(--text-3)" }}>
            No Bedrock guardrail activity in this timeframe.
          </Text>
        ) : (
          <>
            <Flex alignItems="baseline" gap={6} style={{ flex: "0 0 auto" }}>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  lineHeight: 1,
                  color: GUARDRAIL_TONE_COLOR[tone],
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {fmtPercent(g.fleet.interventionRate)}
              </Text>
              <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                intervention rate · {fmtCount(g.fleet.intervened)} of{" "}
                {fmtCount(g.fleet.invocations)} blocked · {g.fleet.activeGuardrails} active
              </Text>
            </Flex>

            {top.length > 0 && (
              <Flex alignItems="center" gap={6} style={{ flexWrap: "wrap", minWidth: 0 }}>
                <Text style={{ fontSize: 10.5, color: "var(--text-3)", flex: "0 0 auto" }}>
                  Top blockers:
                </Text>
                {top.map((r) => (
                  <span
                    key={r.arn}
                    title={`${r.arn} · ${fmtCount(r.intervened)} of ${fmtCount(r.invocations)} blocked`}
                    style={{
                      fontFamily: "var(--mono, monospace)",
                      fontSize: 10.5,
                      color: "var(--text-2)",
                      background: "var(--surface-2)",
                      borderRadius: 999,
                      padding: "2px 8px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.guardrailId} · {fmtPercent(r.interventionRate)}
                  </span>
                ))}
              </Flex>
            )}

            <Text style={{ fontSize: 10.5, color: "var(--text-3)", marginLeft: "auto", flex: "0 0 auto" }}>
              Full guardrails view on Pulse →
            </Text>
          </>
        )}
      </Flex>
    </Surface>
  );
};
