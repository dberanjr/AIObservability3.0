import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { fmtCount, fmtTokens } from "../../data/format";
import { useFleetPosture } from "../Summary/useFleetPosture";
import type { PulseSummary } from "./usePulseSummary";

/** Trust-band color — mirrors the Summary hero gauge so the grade reads the same
 *  on both pages. */
const bandColor = (score: number | null): string => {
  if (score == null) return "var(--text-4, var(--text-3))";
  if (score >= 85) return "var(--green-2)";
  if (score >= 70) return "var(--blue)";
  if (score >= 50) return "var(--amber)";
  return "var(--red)";
};

/**
 * Pulse's single top-line health answer (IA — Information-9). It reuses the SAME
 * fleet grade + trust index the Summary hero computes (useFleetPosture) so an
 * SRE scanning Pulse gets one "is the platform healthy right now" verdict before
 * the ten live tiles and the diagram — matching Summary's grade.
 *
 * It deliberately leads with the GRADE + trust index (which the architecture
 * map's at-rest tier verdict below does NOT show) rather than restating the
 * Healthy/Degraded tier line, so the two are complementary, not duplicative.
 */
export const PulseHealthHeadline = ({ summary }: { summary: PulseSummary }) => {
  const posture = useFleetPosture();
  const color = bandColor(posture.trustIndex);
  const loading = posture.isLoading && posture.trustIndex == null;

  const footprint = [
    summary.tokens != null ? `${fmtTokens(summary.tokens)} tokens` : null,
    posture.serviceCount != null
      ? `${fmtCount(posture.serviceCount)} AI services`
      : null,
    posture.agentCount != null ? `${fmtCount(posture.agentCount)} agents` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Surface elevation="raised" padding={12} style={{ minWidth: 0, overflow: "hidden" }}>
      <Flex alignItems="center" gap={16} style={{ flexWrap: "wrap", rowGap: 8 }}>
        {/* Grade badge — band-tinted so the letter meets contrast on any theme */}
        {loading ? (
          <Skeleton style={{ width: 48, height: 48, borderRadius: 10 }} />
        ) : (
          <div
            aria-hidden
            style={{
              width: 48,
              height: 48,
              borderRadius: 10,
              flex: "0 0 auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
              fontWeight: 800,
              lineHeight: 1,
              color,
              border: `1.5px solid ${color}`,
              background: `color-mix(in oklab, ${color} 12%, transparent)`,
            }}
          >
            {posture.grade ?? "—"}
          </div>
        )}

        <Flex flexDirection="column" gap={2} style={{ minWidth: 0, flex: "1 1 220px" }}>
          <Flex alignItems="center" gap={8} style={{ minWidth: 0, flexWrap: "wrap", rowGap: 2 }}>
            <Text
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--text-3)",
              }}
            >
              Platform health now
            </Text>
            {posture.gradeIncomplete && posture.grade != null && (
              <span
                title="This grade excludes an unmeasured pillar (quality)"
                style={{
                  fontSize: 8.5,
                  fontWeight: 700,
                  letterSpacing: "0.03em",
                  textTransform: "uppercase",
                  color: "var(--amber)",
                  border: "1px solid var(--amber)",
                  borderRadius: 999,
                  padding: "1px 5px",
                }}
              >
                partial
              </span>
            )}
          </Flex>
          <Flex alignItems="baseline" gap={8} style={{ minWidth: 0, flexWrap: "wrap", rowGap: 2 }}>
            <Text
              style={{
                fontSize: 16,
                fontWeight: 700,
                lineHeight: 1.2,
                color: "var(--text)",
              }}
            >
              {loading ? "Scoring…" : posture.status}
            </Text>
            {!loading && posture.trustIndex != null && (
              <Text style={{ fontSize: 12, color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>
                trust index {posture.trustIndex}/100
              </Text>
            )}
          </Flex>
        </Flex>

        {!loading && (
          <Text
            style={{
              fontSize: 12.5,
              color: "var(--text-2)",
              lineHeight: 1.4,
              minWidth: 0,
              flex: "2 1 260px",
            }}
          >
            {posture.headline}
            {footprint && (
              <Text as="span" style={{ color: "var(--text-3)" }}>
                {" · "}
                {footprint}
              </Text>
            )}
          </Text>
        )}
      </Flex>
    </Surface>
  );
};
