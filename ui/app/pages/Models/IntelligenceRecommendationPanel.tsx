import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { fmtUSDCompact } from "../../data/format";
import {
  DIMENSIONS,
  DIMENSION_LABEL,
  VERDICT_COLOR,
  VERDICT_LABEL,
  type ComparisonResult,
  type ScoreDimension,
} from "./scoring";

const ACCENT_A = "var(--blue)";
const ACCENT_B = "var(--purple)";

const Eyebrow = () => (
  <Flex alignItems="center" gap={8}>
    <span
      aria-hidden
      style={{
        width: 24,
        height: 24,
        borderRadius: "50%",
        background:
          "linear-gradient(135deg, var(--blue), var(--purple), var(--purple-2))",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "white",
        fontSize: 13,
        fontWeight: 700,
      }}
    >
      ✦
    </span>
    <Text
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--text)",
      }}
    >
      Dynatrace Intelligence · Recommendation
    </Text>
  </Flex>
);

const VerdictPill = ({ result }: { result: ComparisonResult }) => {
  // When the margin leans on the (estimated) Quality dimension, downgrade the
  // wording so a partly-synthetic score can't read as a confident verdict.
  const directional = result.qualityDriven && result.qualityEstimated;
  const color = directional ? "var(--text-3)" : VERDICT_COLOR[result.verdict];
  const label = directional
    ? "Directional · quality estimated"
    : VERDICT_LABEL[result.verdict];
  return (
    <span
      style={{
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        background: `color-mix(in oklab, ${color} 16%, transparent)`,
        border: `1px solid color-mix(in oklab, ${color} 50%, transparent)`,
        color,
      }}
    >
      {label}
    </span>
  );
};

const WinnerMark = ({ winner }: { winner: "a" | "b" | "tie" }) => {
  const label = winner === "tie" ? "=" : winner.toUpperCase();
  const accent = winner === "a" ? ACCENT_A : winner === "b" ? ACCENT_B : "var(--text-3)";
  return (
    <div
      aria-hidden
      style={{
        width: 56,
        height: 56,
        borderRadius: 14,
        background: `color-mix(in oklab, ${accent} 18%, transparent)`,
        border: `1px solid color-mix(in oklab, ${accent} 50%, transparent)`,
        color: accent,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 26,
        fontWeight: 700,
      }}
    >
      {label}
    </div>
  );
};

const ScoreBar = ({
  score,
  color,
  faded,
  winnerChip,
  estimated,
}: {
  score: number;
  color: string;
  faded?: boolean;
  winnerChip?: string;
  /** Render a hatched fill to signal a modeled (not measured) score. */
  estimated?: boolean;
}) => (
  <Flex alignItems="center" gap={6}>
    <div
      style={{
        flex: 1,
        position: "relative",
        height: 8,
        background: "var(--surface-3)",
        borderRadius: 999,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          width: `${Math.max(0, Math.min(100, score))}%`,
          background: estimated
            ? `repeating-linear-gradient(45deg, ${color}, ${color} 3px, color-mix(in oklab, ${color} 40%, transparent) 3px, color-mix(in oklab, ${color} 40%, transparent) 6px)`
            : color,
          opacity: faded ? 0.3 : 1,
        }}
      />
    </div>
    <Text
      style={{
        fontSize: 11.5,
        fontFamily: "var(--mono, monospace)",
        fontVariantNumeric: "tabular-nums",
        width: 26,
        textAlign: "right",
        color: faded ? "var(--text-3)" : "var(--text)",
      }}
    >
      {score.toFixed(0)}
    </Text>
    {winnerChip && (
      <span
        style={{
          padding: "1px 6px",
          borderRadius: 999,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color,
          background: `color-mix(in oklab, ${color} 18%, transparent)`,
          border: `1px solid color-mix(in oklab, ${color} 45%, transparent)`,
        }}
      >
        {winnerChip}
      </span>
    )}
  </Flex>
);

const DimensionRow = ({
  dim,
  result,
}: {
  dim: ScoreDimension;
  result: ComparisonResult;
}) => {
  const aScore = result.a.scores[dim];
  const bScore = result.b.scores[dim];
  const winner = aScore > bScore ? "a" : bScore > aScore ? "b" : "tie";
  const weight = result.profile.weights[dim];
  const estimated = dim === "quality" && result.qualityEstimated;
  return (
    <>
      <Flex alignItems="center" gap={4}>
        <Text style={{ fontSize: 12, color: "var(--text-2)" }}>
          {DIMENSION_LABEL[dim]}
        </Text>
        {estimated && (
          <span
            title="Modeled from the model's quality tier — no gen_ai.evaluation.* score yet"
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "var(--text-3)",
              background: "var(--surface-3)",
              borderRadius: 4,
              padding: "0 4px",
            }}
          >
            est.
          </span>
        )}
      </Flex>
      <ScoreBar
        score={aScore}
        color={ACCENT_A}
        faded={winner === "b"}
        winnerChip={winner === "a" ? "A" : undefined}
        estimated={estimated}
      />
      <ScoreBar
        score={bScore}
        color={ACCENT_B}
        faded={winner === "a"}
        winnerChip={winner === "b" ? "B" : undefined}
        estimated={estimated}
      />
      <Text
        style={{
          fontSize: 11,
          color: "var(--text-3)",
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {weight}%
      </Text>
    </>
  );
};

export interface IntelligenceRecommendationPanelProps {
  result: ComparisonResult;
}

export const IntelligenceRecommendationPanel = ({
  result,
}: IntelligenceRecommendationPanelProps) => {
  const winnerName =
    result.winner === "a"
      ? result.a.model
      : result.winner === "b"
        ? result.b.model
        : "Tie";

  return (
    <div
      style={{
        position: "relative",
        padding: 1,
        borderRadius: 12,
        background:
          "linear-gradient(135deg, var(--blue), var(--purple), var(--purple-2))",
      }}
    >
      <div
        style={{
          padding: 16,
          borderRadius: 11,
          background: "var(--surface)",
        }}
      >
        <Flex flexDirection="column" gap={12}>
          <Flex alignItems="center" justifyContent="space-between">
            <Eyebrow />
            <VerdictPill result={result} />
          </Flex>

          <Flex alignItems="center" gap={16}>
            <WinnerMark winner={result.winner} />
            <Flex flexDirection="column" gap={4} style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={{
                  fontFamily: "var(--mono, monospace)",
                  fontSize: 22,
                  fontWeight: 600,
                  color: "var(--text)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {winnerName}
              </Text>
              <Text style={{ fontSize: 12.5, color: "var(--text-2)" }}>
                {result.reasoning}
              </Text>
            </Flex>
            <Flex flexDirection="column" gap={6} style={{ minWidth: 160 }}>
              <Flex justifyContent="space-between">
                <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
                  Score
                </Text>
                <Text
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {(
                    result.winner === "a"
                      ? result.a.weightedTotal
                      : result.b.weightedTotal
                  ).toFixed(1)}
                </Text>
              </Flex>
              <Flex justifyContent="space-between">
                <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
                  Margin
                </Text>
                <Text
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  +{result.margin.toFixed(1)}
                </Text>
              </Flex>
              <Flex justifyContent="space-between">
                <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
                  Savings / mo
                </Text>
                <Text
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: "var(--green-2)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {fmtUSDCompact(result.estimatedMonthlySavings)}
                </Text>
              </Flex>
            </Flex>
          </Flex>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "120px 1fr 1fr 56px",
              columnGap: 12,
              rowGap: 8,
              alignItems: "center",
              paddingTop: 8,
              borderTop: "1px solid var(--border)",
            }}
          >
            <Text style={{ fontSize: 10.5, color: "var(--text-3)" }}>
              Dimension
            </Text>
            <Text style={{ fontSize: 10.5, color: ACCENT_A, fontWeight: 600 }}>
              A
            </Text>
            <Text style={{ fontSize: 10.5, color: ACCENT_B, fontWeight: 600 }}>
              B
            </Text>
            <Text
              style={{
                fontSize: 10.5,
                color: "var(--text-3)",
                textAlign: "right",
              }}
            >
              Weight
            </Text>
            {DIMENSIONS.map((dim) => (
              <DimensionRow key={dim} dim={dim} result={result} />
            ))}
          </div>

          <Flex
            alignItems="center"
            justifyContent="space-between"
            gap={8}
            style={{
              paddingTop: 8,
              borderTop: "1px solid var(--border)",
              flexWrap: "wrap",
            }}
          >
            <Text style={{ fontSize: 11, color: "var(--text-3)", flex: 1 }}>
              Quality is a tier proxy until <code>gen_ai.evaluation.*</code> is
              wired up. Real evaluation scores swap in automatically when they
              land.
            </Text>
            <Flex gap={6}>
              <Button variant="default" disabled>
                Open in Notebooks
              </Button>
              <Button variant="emphasized" disabled>
                Ask Intelligence to draft routing rule
              </Button>
            </Flex>
          </Flex>
        </Flex>
      </div>
    </div>
  );
};
