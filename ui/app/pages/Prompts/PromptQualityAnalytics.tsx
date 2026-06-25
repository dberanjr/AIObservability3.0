import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { Skeleton } from "@dynatrace/strato-components/content";
import { fmtPercent } from "../../data/format";
import { CollapsibleCard } from "../../components/CollapsibleCard";
import { useCapability } from "../../scope/CapabilityContext";
import { QUALITY_EVAL_SETUP_GUIDE } from "../Pulse/types";
import { usePromptQuality, type QualityMetricSnapshot } from "./usePromptQuality";

interface MetricTileProps {
  label: string;
  snapshot: QualityMetricSnapshot;
  inverted?: boolean;
}

const colorFor = (pct: number | null, inverted?: boolean): string => {
  if (pct == null) return "var(--text-4)";
  if (inverted) {
    if (pct > 10) return "var(--red)";
    if (pct > 3) return "var(--amber)";
    return "var(--green-2)";
  }
  if (pct < 60) return "var(--red)";
  if (pct < 80) return "var(--amber)";
  return "var(--green-2)";
};

const MetricTile = ({ label, snapshot, inverted }: MetricTileProps) => {
  const color = colorFor(snapshot.pct, inverted);
  const isEmpty = snapshot.pct == null;
  return (
    <Surface elevation="raised" padding={12}>
      <Flex flexDirection="column" gap={8}>
        <Text
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "var(--text-3)",
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontSize: 24,
            fontWeight: 600,
            color: isEmpty ? "var(--text-3)" : color,
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
          }}
        >
          {isEmpty ? "—" : fmtPercent(snapshot.pct, inverted ? 1 : 0)}
        </Text>
        <Text
          style={{
            fontSize: 10.5,
            color: "var(--text-3)",
            fontFamily: "var(--mono, monospace)",
          }}
        >
          {snapshot.attribute}
        </Text>
        {isEmpty ? (
          <Button
            as="a"
            href={QUALITY_EVAL_SETUP_GUIDE}
            target="_blank"
            rel="noopener noreferrer"
            variant="default"
          >
            Setup guide
          </Button>
        ) : (
          <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
            {snapshot.coverage.toLocaleString()} spans with this attribute
          </Text>
        )}
      </Flex>
    </Surface>
  );
};

// Body is a separate component so the query (usePromptQuality) only runs while
// the section is expanded — CollapsibleCard renders children solely when open,
// so a collapsed section issues no DQL.
const PromptQualityBody = () => {
  const quality = usePromptQuality();
  return (
    <Flex flexDirection="column" gap={12} style={{ padding: 16 }}>
      {quality.isLoading && !quality.hasAnyEval ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 10,
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} style={{ height: 120, borderRadius: 10 }} />
          ))}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 10,
          }}
        >
          <MetricTile
            label="Hallucination rate"
            snapshot={quality.hallucination}
            inverted
          />
          <MetricTile
            label="Correctness score"
            snapshot={quality.correctness}
          />
          <MetricTile
            label="Faithfulness"
            snapshot={quality.faithfulness}
          />
          <MetricTile label="Relevance" snapshot={quality.relevance} />
        </div>
      )}

      <Text style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.5 }}>
        Three paths to populate: add eval attrs to LLM spans, run a Workflow
        LLM-as-judge, or push offline eval results as business events.
      </Text>
    </Flex>
  );
};

export const PromptQualityAnalytics = () => {
  // Collapse by default when no eval data exists in this tenant. The evalScore
  // capability (gen_ai.evaluation.*) is probed cheaply app-wide, so we can
  // decide without running the section's own query. Mount only once the probe
  // settles so the initial defaultOpen reflects the real answer (CollapsibleCard
  // reads defaultOpen once). When eval data IS present the section opens as
  // before; the body query still runs only while expanded.
  const cap = useCapability();
  if (cap.isLoading) return null;
  return (
    <CollapsibleCard
      title="Prompt quality analytics"
      subtitle="Aggregate evaluation scores across LLM spans in the current scope"
      defaultOpen={cap.has("evalScore")}
    >
      <PromptQualityBody />
    </CollapsibleCard>
  );
};
