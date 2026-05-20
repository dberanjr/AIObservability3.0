import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { Switch } from "@dynatrace/strato-components/forms";
import { Skeleton } from "@dynatrace/strato-components/content";
import { fmtPercent, fmtTokens } from "../../data/format";
import type { AgentEvalSnapshot } from "./useAgentEval";
import { QUALITY_EVAL_SETUP_GUIDE } from "../Pulse/types";

interface EvalTileProps {
  label: string;
  value: string;
  pct: number | null;
  /** True when higher is worse (hallucination). */
  inverted?: boolean;
  isPlaceholder: boolean;
}

const EvalTile = ({ label, value, pct, inverted, isPlaceholder }: EvalTileProps) => {
  const color = (() => {
    if (pct == null) return "var(--text-4)";
    if (inverted) {
      if (pct > 10) return "var(--red)";
      if (pct > 3) return "var(--amber)";
      return "var(--green-2)";
    }
    if (pct < 60) return "var(--red)";
    if (pct < 80) return "var(--amber)";
    return "var(--green-2)";
  })();
  const fillPct = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <Surface elevation="raised" padding={12}>
      <Flex flexDirection="column" gap={6}>
        <Text
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "var(--text-3)",
            minHeight: 28,
            whiteSpace: "normal",
            lineHeight: 1.2,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: isPlaceholder ? "var(--text-3)" : color,
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
          }}
        >
          {value}
        </Text>
        <div
          style={{
            height: 4,
            borderRadius: 999,
            background: "var(--surface-3)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${fillPct}%`,
              height: "100%",
              background: color,
              opacity: isPlaceholder ? 0.4 : 1,
            }}
          />
        </div>
      </Flex>
    </Surface>
  );
};

export interface EvaluationBannerProps {
  snapshot: AgentEvalSnapshot;
  previewMode: boolean;
  onPreviewToggle: (next: boolean) => void;
}

export const EvaluationBanner = ({
  snapshot,
  previewMode,
  onPreviewToggle,
}: EvaluationBannerProps) => {
  const showPlaceholders = !snapshot.hasAnyEval;
  // Sample values for the "Preview with data" toggle so reviewers can see the future state.
  const sample = {
    tool: 92,
    halluc: 4.2,
    success: 87,
    ctx: 4250,
  };

  const t = (real: number | null, fallback: number) =>
    showPlaceholders ? (previewMode ? fallback : null) : real;

  const isPlaceholder = showPlaceholders && !previewMode;

  return (
    <Flex flexDirection="column" gap={8}>
      <Flex
        alignItems="center"
        gap={12}
        style={{
          padding: "10px 14px",
          borderRadius: 8,
          background: snapshot.hasAnyEval
            ? "var(--surface-2)"
            : "color-mix(in oklab, var(--amber) 12%, var(--surface))",
          border: snapshot.hasAnyEval
            ? "1px solid var(--border)"
            : "1px solid color-mix(in oklab, var(--amber) 50%, transparent)",
        }}
      >
        <Text style={{ fontSize: 12.5, color: "var(--text)", flex: 1 }}>
          {snapshot.hasAnyEval ? (
            <>
              <strong>Evaluation data detected.</strong>{" "}
              {snapshot.coverage.correctness}/{snapshot.coverage.total} spans carry
              gen_ai.evaluation.* attributes.
            </>
          ) : (
            <>
              <strong>No evaluation data yet.</strong> Wire up{" "}
              <code>gen_ai.evaluation.*</code> on LLM spans, run an LLM-as-judge
              workflow, or push offline evals as business events.
            </>
          )}
        </Text>
        {!snapshot.hasAnyEval && (
          <Flex alignItems="center" gap={6}>
            <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
              Preview with data
            </Text>
            <Switch
              name="preview-eval"
              value={previewMode}
              onChange={onPreviewToggle}
            />
          </Flex>
        )}
        <Button
          as="a"
          href={QUALITY_EVAL_SETUP_GUIDE}
          target="_blank"
          rel="noopener noreferrer"
          variant="default"
        >
          Setup guide
        </Button>
      </Flex>

      {snapshot.isLoading && !snapshot.hasAnyEval ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 10,
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} style={{ height: 80, borderRadius: 10 }} />
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
          <EvalTile
            label="Tool call correctness"
            value={
              isPlaceholder
                ? "—"
                : fmtPercent(t(snapshot.toolCorrectnessPct, sample.tool), 0)
            }
            pct={t(snapshot.toolCorrectnessPct, sample.tool)}
            isPlaceholder={isPlaceholder}
          />
          <EvalTile
            label="Hallucination rate"
            value={
              isPlaceholder
                ? "—"
                : fmtPercent(t(snapshot.hallucinationPct, sample.halluc), 1)
            }
            pct={t(snapshot.hallucinationPct, sample.halluc)}
            inverted
            isPlaceholder={isPlaceholder}
          />
          <EvalTile
            label="Task success rate"
            value={
              isPlaceholder
                ? "—"
                : fmtPercent(t(snapshot.taskSuccessPct, sample.success), 0)
            }
            pct={t(snapshot.taskSuccessPct, sample.success)}
            isPlaceholder={isPlaceholder}
          />
          <EvalTile
            label="Avg context tokens"
            value={
              isPlaceholder ? "—" : fmtTokens(t(snapshot.avgCtxTokens, sample.ctx))
            }
            pct={null}
            isPlaceholder={isPlaceholder}
          />
        </div>
      )}
    </Flex>
  );
};
