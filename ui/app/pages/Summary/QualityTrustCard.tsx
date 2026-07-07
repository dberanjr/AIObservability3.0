import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { InfoTooltip } from "../../components/InfoTooltip";
import { EmptyState } from "../../components/EmptyState";
import { fmtPercent } from "../../data/format";
import { useCapability } from "../../scope/CapabilityContext";
import { useTweaks } from "../../tweaks/TweaksContext";
import { SummaryCard } from "./SummaryCard";
import { useAgentEval } from "../Agents/useAgentEval";

const QualBar = ({
  label,
  pct,
  target = 90,
}: {
  label: string;
  pct: number;
  target?: number;
}) => {
  const barColor = pct >= target ? "var(--green-2)" : "var(--amber)";
  return (
    <Flex flexDirection="column" gap={4}>
      <Flex justifyContent="space-between" alignItems="baseline">
        <Text style={{ fontSize: 12.5, color: "var(--text-2)" }}>{label}</Text>
        <Text style={{ fontSize: 12.5, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
          {Math.round(pct)}
        </Text>
      </Flex>
      <div
        style={{
          position: "relative",
          height: 6,
          background: "var(--surface-3)",
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${Math.max(0, Math.min(100, pct))}%`,
            height: "100%",
            background: barColor,
            borderRadius: 999,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: `${target}%`,
            top: 0,
            bottom: 0,
            width: 2,
            background: "var(--text-3)",
            opacity: 0.6,
          }}
        />
      </div>
    </Flex>
  );
};

const MiniTile = ({
  label,
  value,
  tone = "default",
  info,
}: {
  label: string;
  value: string;
  tone?: "default" | "risk";
  info?: string;
}) => (
  <Flex
    flexDirection="column"
    gap={2}
    style={{
      flex: 1,
      padding: "8px 10px",
      borderRadius: 8,
      background:
        tone === "risk"
          ? "color-mix(in oklab, var(--red) 8%, var(--surface))"
          : "var(--surface-2)",
    }}
  >
    <Flex alignItems="center" gap={4} style={{ minWidth: 0 }}>
      <Text
        style={{
          fontSize: 9.5,
          fontWeight: 600,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: tone === "risk" ? "var(--red)" : "var(--text-3)",
        }}
      >
        {label}
      </Text>
      {info && <InfoTooltip text={info} size={12} />}
    </Flex>
    <Text
      style={{
        fontSize: 16,
        fontWeight: 700,
        fontVariantNumeric: "tabular-nums",
        color: tone === "risk" ? "var(--red)" : "var(--text)",
      }}
    >
      {value}
    </Text>
  </Flex>
);

/** Clearly-labeled illustrative values, shown only under the Tweaks
 *  "Show with example data" toggle when eval scores aren't emitted. */
const EXAMPLE = {
  groundedness: 91,
  relevance: 88,
  taskSuccess: 86,
  toolCorrectness: 93,
  hallucination: 4.3,
  coverage: 35,
};

export const QualityTrustCard = () => {
  const cap = useCapability();
  const { pageConfig } = useTweaks();
  const eval_ = useAgentEval();

  const hasEval = cap.has("evalScore") || eval_.hasAnyEval;
  const showExample = !hasEval && pageConfig.showExampleData;

  // Setup state — no eval scores and example data toggle off.
  if (!hasEval && !showExample) {
    return (
      <SummaryCard
        title="Is it good? · Quality & trust"
        info="Agent answer-quality from gen_ai.evaluation.* attributes on agent spans. Each bar is the average of that evaluation score × 100 (task-success and tool-call correctness are live; groundedness and answer relevance only render under the example-data toggle). The dashed line on each bar marks the 90 target. Halluc. and Coverage are summarized in the two tiles below."
        drill={{ label: "Agents", to: "/agents" }}
      >
        <Flex flexDirection="column" gap={12} style={{ height: "100%" }}>
          <EmptyState
            bare
            title="No evaluation scores yet"
            description="Emit gen_ai.evaluation.* (tool-call correctness, hallucination, task success) to light up quality bars here."
            hint="Enable “Show with example data” in Tweaks to preview this panel."
          />
        </Flex>
      </SummaryCard>
    );
  }

  const v = showExample
    ? EXAMPLE
    : {
        groundedness: null as number | null,
        relevance: null as number | null,
        taskSuccess: eval_.taskSuccessPct,
        toolCorrectness: eval_.toolCorrectnessPct,
        hallucination: eval_.hallucinationPct,
        coverage:
          eval_.coverage.total > 0
            ? (eval_.coverage.success / eval_.coverage.total) * 100
            : null,
      };

  return (
    <SummaryCard
      title="Is it good? · Quality & trust"
      info="Agent answer-quality from gen_ai.evaluation.* attributes on agent spans. Each bar is the average of that evaluation score × 100 (task-success and tool-call correctness are live; groundedness and answer relevance only render under the example-data toggle). The dashed line on each bar marks the 90 target. Halluc. and Coverage are summarized in the two tiles below."
      drill={{ label: "Agents", to: "/agents" }}
      headerRight={
        showExample ? (
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--amber)",
              border: "1px solid var(--amber)",
              borderRadius: 4,
              padding: "0 5px",
            }}
          >
            Example data
          </span>
        ) : undefined
      }
    >
      <Flex flexDirection="column" gap={16} style={{ height: "100%" }}>
        <Flex flexDirection="column" gap={12}>
          {v.groundedness != null && <QualBar label="Groundedness" pct={v.groundedness} />}
          {v.relevance != null && <QualBar label="Answer relevance" pct={v.relevance} />}
          {v.taskSuccess != null && <QualBar label="Task-success rate" pct={v.taskSuccess} />}
          {v.toolCorrectness != null && <QualBar label="Tool-call correctness" pct={v.toolCorrectness} />}
        </Flex>
        <Flex gap={8}>
          <MiniTile
            label="Halluc."
            value={v.hallucination != null ? fmtPercent(v.hallucination) : "—"}
            tone="risk"
            info="Average hallucination rate = avg(gen_ai.evaluation.hallucination) × 100 across agent spans that carry the score. Lower is better."
          />
          <MiniTile
            label="Coverage"
            value={v.coverage != null ? fmtPercent(v.coverage, 0) : "—"}
            info="Evaluation coverage = agent spans carrying a task-success score ÷ all agent spans, as a %. Low coverage means most agent activity is unevaluated, so the quality bars rest on a small sample."
          />
        </Flex>
      </Flex>
    </SummaryCard>
  );
};
