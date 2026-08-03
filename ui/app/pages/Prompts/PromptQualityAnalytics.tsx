import React from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { Skeleton } from "@dynatrace/strato-components/content";
import { fmtPercent } from "../../data/format";
import { CollapsibleCard } from "../../components/CollapsibleCard";
import { ScanScopedTile } from "../../scope/ScanScopedTile";
import { useCapability } from "../../scope/CapabilityContext";
import { QUALITY_EVAL_SETUP_GUIDE } from "../Pulse/types";
import { Sparkline } from "../../components/charts/Sparkline";
import { usePromptQuality, type QualityMetricSnapshot } from "./usePromptQuality";
import { qualityColor, coverageLabel } from "./promptCells";
import { isScopeFiltered } from "./filterScope";
import {
  worstModelsForMetric,
  evalTrendSeries,
  evalFailFilter,
  evalFilterLabel,
  type EvalMetric,
} from "./evalTable";
import type { PromptRow, PromptsFilter } from "./usePrompts";

interface MetricTileProps {
  label: string;
  snapshot: QualityMetricSnapshot;
  /** Total LLM-span population, for the coverage denominator (Prompts-6). */
  total: number;
  /** Eval field driving the per-model breakdown + trend (Prompts-4). */
  metric: EvalMetric;
  /** Loaded rows the breakdown + trend are computed from. */
  rows: PromptRow[];
  inverted?: boolean;
  /** True when this metric's fail-filter is the active table filter (Prompts-4). */
  active?: boolean;
  /** Toggle this metric's fail-filter on the table (Prompts-4). Absent ⇒ inert. */
  onToggle?: () => void;
}

/**
 * Trend of the metric over the loaded scored spans (Prompts-4). Same "scored
 * spans in view" population as the worst-models breakdown, so it adds the
 * missing time dimension without a second scan. Hidden when too few points.
 */
const MetricTrend = ({
  rows,
  metric,
  color,
}: {
  rows: PromptRow[];
  metric: EvalMetric;
  color: string;
}) => {
  const trend = React.useMemo(() => evalTrendSeries(rows, metric), [rows, metric]);
  if (trend.values.length < 3) return null;
  return (
    <Flex flexDirection="column" gap={2} style={{ marginTop: 2 }}>
      <Text
        style={{
          fontSize: 9.5,
          fontWeight: 600,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: "var(--text-4)",
        }}
      >
        Trend · scored spans in view
      </Text>
      <Sparkline
        values={trend.values}
        labels={trend.labels}
        color={color}
        height={24}
        valueFormatter={(n) => fmtPercent(n, 0)}
        ariaLabel={`${metric} over scored spans in view`}
      />
    </Flex>
  );
};

/**
 * Worst-models breakdown under a metric (Prompts-4). Computed from the loaded
 * rows that carry a score, so it answers "which model is driving this" without
 * a second aggregate query.
 */
const ModelBreakdown = ({
  rows,
  metric,
  inverted,
}: {
  rows: PromptRow[];
  metric: EvalMetric;
  inverted?: boolean;
}) => {
  const worst = worstModelsForMetric(rows, metric, 3);
  if (worst.length === 0) return null;
  return (
    <Flex flexDirection="column" gap={4} style={{ marginTop: 2 }}>
      <Text
        style={{
          fontSize: 9.5,
          fontWeight: 600,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: "var(--text-4)",
        }}
      >
        Worst models · scored spans in view
      </Text>
      {worst.map((m) => {
        const pct = m.score * 100;
        const c = qualityColor(pct, inverted);
        return (
          <Flex key={m.model} alignItems="center" gap={6}>
            <Text
              style={{
                fontSize: 10.5,
                color: "var(--text-2)",
                fontFamily: "var(--mono, monospace)",
                flex: "0 0 96px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={`${m.model} · ${m.count} scored`}
            >
              {m.model}
            </Text>
            <div
              style={{
                flex: 1,
                height: 6,
                borderRadius: 3,
                background: "var(--surface-3)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.max(3, Math.min(100, pct))}%`,
                  height: "100%",
                  background: c,
                }}
              />
            </div>
            <Text
              style={{
                fontSize: 10.5,
                color: c,
                fontVariantNumeric: "tabular-nums",
                flex: "0 0 auto",
                fontWeight: 600,
              }}
            >
              {fmtPercent(pct, 0)}
            </Text>
          </Flex>
        );
      })}
    </Flex>
  );
};

const MetricTile = ({
  label,
  snapshot,
  total,
  metric,
  rows,
  inverted,
  active,
  onToggle,
}: MetricTileProps) => {
  const color = qualityColor(snapshot.pct, inverted);
  const isEmpty = snapshot.pct == null;
  const coverage = coverageLabel(snapshot.coverage, total);
  // A populated tile becomes a toggle that drills the table into the spans
  // failing this metric (Prompts-4). Empty tiles keep their Setup-guide CTA and
  // stay static (can't nest that anchor-button inside a tile button).
  const interactive = !isEmpty && !!onToggle;
  const failLabel = evalFilterLabel(evalFailFilter(metric));

  const inner = (
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
        <>
          <Text
            style={{
              fontSize: 11,
              color: coverage.low ? "var(--amber)" : "var(--text-3)",
            }}
            title={
              coverage.low
                ? "Low coverage — this average is built on a small share of the population; interpret with caution."
                : undefined
            }
          >
            {coverage.low ? "⚠ " : ""}
            {coverage.text}
          </Text>
          <MetricTrend rows={rows} metric={metric} color={color} />
          <ModelBreakdown rows={rows} metric={metric} inverted={inverted} />
          {interactive && (
            <Text style={{ fontSize: 10.5, color: active ? "var(--blue)" : "var(--text-4)" }}>
              {active ? `● Filtering table: ${failLabel}` : `Click to filter: ${failLabel}`}
            </Text>
          )}
        </>
      )}
    </Flex>
  );

  if (!interactive) {
    return (
      <Surface elevation="raised" padding={12}>
        {inner}
      </Surface>
    );
  }
  return (
    <Surface elevation="raised" padding={0}>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={!!active}
        title={`Click to filter the table to spans failing this metric (${failLabel})`}
        // Shared clickable-tile class restores the keyboard focus ring the
        // `all: unset` reset strips, and adds the app-wide hover lift.
        className="aiobs-clickable-tile"
        style={{
          all: "unset",
          display: "block",
          width: "100%",
          boxSizing: "border-box",
          padding: 12,
          cursor: "pointer",
          borderRadius: 8,
          outline: active ? "2px solid var(--blue)" : "none",
          outlineOffset: -2,
          background: active
            ? "color-mix(in oklab, var(--blue) 8%, transparent)"
            : "transparent",
        }}
      >
        {inner}
      </button>
    </Surface>
  );
};

export interface PromptQualityAnalyticsProps {
  /** Sidebar filter — scopes the aggregate averages (Prompts-2). */
  filter?: PromptsFilter;
  /** Active problem-pattern focus. */
  focus?: string | null;
  /** Loaded rows for the per-model worst-offenders breakdown + trend (Prompts-4). */
  rows?: PromptRow[];
  /** Toggle a metric's fail-filter on the table from a tile click (Prompts-4). */
  onFilterChange?: (next: PromptsFilter) => void;
  /** True to render the bundled Demo Mode aggregate instead of querying Grail. */
  showExample?: boolean;
}

// Body is a separate component so the query (usePromptQuality) only runs while
// the section is expanded — CollapsibleCard renders children solely when open,
// so a collapsed section issues no DQL.
const PromptQualityBody = ({
  filter,
  focus,
  rows = [],
  onFilterChange,
  showExample,
}: PromptQualityAnalyticsProps) => {
  const quality = usePromptQuality(filter, focus, showExample);
  const scoped = isScopeFiltered(filter, focus);
  // Clicking a metric tile toggles that metric's fail-filter on the table
  // (Prompts-4) — the SAME PromptsFilter mechanism the sidebar/tiles use.
  const activeMetric = filter?.eval?.metric ?? null;
  const toggleEval = onFilterChange
    ? (metric: EvalMetric) => {
        const cur = filter ?? {};
        // Clicking the active metric clears the drill-down; clicking another
        // swaps to it. `eval: undefined` reads as "no eval filter" everywhere.
        onFilterChange({
          ...cur,
          eval: cur.eval?.metric === metric ? undefined : evalFailFilter(metric),
        });
      }
    : undefined;
  const tileToggle = (metric: EvalMetric): (() => void) | undefined =>
    toggleEval ? () => toggleEval(metric) : undefined;
  return (
    <Flex flexDirection="column" gap={12} style={{ padding: 16 }}>
      {scoped && (
        <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
          Scores reflect the current sidebar / focus scope.
        </Text>
      )}
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
            total={quality.totalLlmSpans}
            metric="evalHallucination"
            rows={rows}
            inverted
            active={activeMetric === "evalHallucination"}
            onToggle={tileToggle("evalHallucination")}
          />
          <MetricTile
            label="Correctness score"
            snapshot={quality.correctness}
            total={quality.totalLlmSpans}
            metric="evalCorrectness"
            rows={rows}
            active={activeMetric === "evalCorrectness"}
            onToggle={tileToggle("evalCorrectness")}
          />
          <MetricTile
            label="Faithfulness"
            snapshot={quality.faithfulness}
            total={quality.totalLlmSpans}
            metric="evalFaithfulness"
            rows={rows}
            active={activeMetric === "evalFaithfulness"}
            onToggle={tileToggle("evalFaithfulness")}
          />
          <MetricTile
            label="Relevance"
            snapshot={quality.relevance}
            total={quality.totalLlmSpans}
            metric="evalRelevance"
            rows={rows}
            active={activeMetric === "evalRelevance"}
            onToggle={tileToggle("evalRelevance")}
          />
        </div>
      )}

      <Text style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.5 }}>
        Three paths to populate: add eval attrs to LLM spans, run a Workflow
        LLM-as-judge, or push offline eval results as business events.
      </Text>
    </Flex>
  );
};

export const PromptQualityAnalytics = (props: PromptQualityAnalyticsProps) => {
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
      {/* One shared scope: usePromptQuality runs once in the body and feeds all
          four metric tiles, so the scan is attributed at the card level. */}
      <ScanScopedTile name="Prompt quality">
        <PromptQualityBody {...props} />
      </ScanScopedTile>
    </CollapsibleCard>
  );
};
