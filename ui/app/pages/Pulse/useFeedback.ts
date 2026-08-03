/**
 * User-feedback & prompt-versioning rollup for the Pulse feedback panel. Reads
 * attributes the app doesn't otherwise consume: gen_ai.feedback.rating/label
 * and gen_ai.prompt_hub.name/version. Feedback counts are extrapolated by the
 * active sampling ratio; the average rating and distinct version counts are
 * sampling-invariant.
 */

import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useSampling } from "../../scope/SamplingContext";
import { dqlTimeArg } from "../../scope/queries";
import { toNum } from "../../data/format";
import { DEMO_FEEDBACK_COUNTS, DEMO_FEEDBACK_LABELS, DEMO_PROMPT_VERSIONS } from "./demoData";

interface FeedbackCountsRecord {
  n?: number | string;
  avg_rating?: number | string;
}
interface FeedbackLabelRecord {
  label?: string;
  n?: number | string;
}
interface PromptVersionRecord {
  versions?: number | string;
  prompts?: number | string;
}

export interface FeedbackLabel {
  label: string;
  count: number;
}

export interface UseFeedbackResult {
  feedbackCount: number;
  avgRating: number;
  hasRating: boolean;
  labels: FeedbackLabel[];
  promptVersions: number;
  promptCount: number;
  isLoading: boolean;
  error?: Error;
}

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

const countsQuery = (from: string, to: string): string =>
  `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(from)}, to: ${dqlTimeArg(to)}
| filter isNotNull(\`gen_ai.feedback.rating\`) or isNotNull(\`gen_ai.feedback.label\`)
| summarize {
    n = count(),
    avg_rating = avg(toDouble(\`gen_ai.feedback.rating\`))
  }
`.trim();

const labelQuery = (from: string, to: string): string =>
  `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(from)}, to: ${dqlTimeArg(to)}
| filter isNotNull(\`gen_ai.feedback.label\`)
| summarize n = count(), by: { label = toString(\`gen_ai.feedback.label\`) }
| sort n desc
| limit 6
`.trim();

const versionQuery = (from: string, to: string): string =>
  `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(from)}, to: ${dqlTimeArg(to)}
| filter isNotNull(\`gen_ai.prompt_hub.name\`) or isNotNull(\`gen_ai.prompt_hub.version\`)
| summarize {
    versions = countDistinct(coalesce(toString(\`gen_ai.prompt_hub.version\`), toString(\`gen_ai.prompt_hub.name\`))),
    prompts = countDistinct(toString(\`gen_ai.prompt_hub.name\`))
  }
`.trim();

/**
 * `showExample` (default false, mirrors useGuardrails.ts) renders the Demo
 * Mode dataset instead of querying Grail — set by Pulse's FeedbackPanel when
 * Demo Mode (or the app-wide "no AI telemetry yet" fallback) is active. This
 * hook has no other caller, so the default only matters for tests.
 */
export const useFeedback = (showExample = false): UseFeedbackResult => {
  const { scope } = useScope();
  const { samplingRatio } = useSampling();
  const from = scope.timeframe.from;
  const to = scope.timeframe.to ?? "now()";

  const counts = useScopedDql<FeedbackCountsRecord>(
    useMemo(() => countsQuery(from, to), [from, to]),
    { staleTime: 60_000, enabled: !showExample },
  );
  const labelDist = useScopedDql<FeedbackLabelRecord>(
    useMemo(() => labelQuery(from, to), [from, to]),
    { staleTime: 60_000, enabled: !showExample },
  );
  const versions = useScopedDql<PromptVersionRecord>(
    useMemo(() => versionQuery(from, to), [from, to]),
    { staleTime: 60_000, enabled: !showExample },
  );

  return useMemo<UseFeedbackResult>(() => {
    if (showExample) {
      return {
        feedbackCount: DEMO_FEEDBACK_COUNTS.n,
        avgRating: DEMO_FEEDBACK_COUNTS.avg_rating,
        hasRating: DEMO_FEEDBACK_COUNTS.avg_rating > 0,
        labels: DEMO_FEEDBACK_LABELS.map((l) => ({ label: l.label, count: l.n })),
        promptVersions: DEMO_PROMPT_VERSIONS.versions,
        promptCount: DEMO_PROMPT_VERSIONS.prompts,
        isLoading: false,
        error: undefined,
      };
    }
    const ex = (v: unknown): number => num(v) * samplingRatio;
    const cRec = counts.data?.records?.[0];
    const vRec = versions.data?.records?.[0];
    const avgRating = num(cRec?.avg_rating);
    const labels: FeedbackLabel[] = (labelDist.data?.records ?? [])
      .filter((r) => r.label)
      .map((r) => ({ label: r.label as string, count: ex(r.n) }));
    return {
      feedbackCount: ex(cRec?.n),
      avgRating,
      hasRating: avgRating > 0,
      labels,
      promptVersions: num(vRec?.versions),
      promptCount: num(vRec?.prompts),
      isLoading: counts.isLoading || labelDist.isLoading || versions.isLoading,
      error: counts.error ?? labelDist.error ?? versions.error ?? undefined,
    };
  }, [
    showExample,
    counts.data,
    counts.isLoading,
    counts.error,
    labelDist.data,
    labelDist.isLoading,
    labelDist.error,
    versions.data,
    versions.isLoading,
    versions.error,
    samplingRatio,
  ]);
};
