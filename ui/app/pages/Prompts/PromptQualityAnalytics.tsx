import React, { useState } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { Skeleton } from "@dynatrace/strato-components/content";
import { ChevronDownIcon, ChevronRightIcon } from "@dynatrace/strato-icons";
import { fmtPercent } from "../../data/format";
import { QUALITY_EVAL_SETUP_GUIDE } from "../Pulse/types";
import type {
  PromptQuality,
  QualityMetricSnapshot,
} from "./usePromptQuality";

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

export interface PromptQualityAnalyticsProps {
  quality: PromptQuality;
}

export const PromptQualityAnalytics = ({ quality }: PromptQualityAnalyticsProps) => {
  const [open, setOpen] = useState(false);
  return (
  <Surface elevation="raised" padding={16}>
    <Flex flexDirection="column" gap={open ? 12 : 0}>
      <Flex alignItems="center" justifyContent="space-between">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          style={{
            all: "unset",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
            flex: 1,
            minWidth: 0,
          }}
        >
          {open ? (
            <ChevronDownIcon size={16} style={{ color: "var(--text-3)", flex: "0 0 auto" }} />
          ) : (
            <ChevronRightIcon size={16} style={{ color: "var(--text-3)", flex: "0 0 auto" }} />
          )}
          <Flex flexDirection="column" gap={2}>
            <Heading level={3} style={{ fontSize: 14, fontWeight: 600 }}>
              Prompt quality analytics
            </Heading>
            {open && (
              <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                Aggregate evaluation scores across LLM spans in the current scope
              </Text>
            )}
          </Flex>
        </button>
        {quality.hasAnyEval && (
          <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            {quality.totalLlmSpans.toLocaleString()} LLM spans
          </Text>
        )}
      </Flex>

      {!open ? null : quality.isLoading && !quality.hasAnyEval ? (
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

      {open && (
        <Text
          style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.5 }}
        >
          Three paths to populate: add eval attrs to LLM spans, run a Workflow
          LLM-as-judge, or push offline eval results as business events.
        </Text>
      )}
    </Flex>
  </Surface>
  );
};
