import type { PromptRow } from "./usePrompts";

// Logic for the Evaluations table view (Prompts-1) and the per-model
// worst-offenders breakdown in the quality panel (Prompts-4). Pure so it can be
// unit tested without the Strato table.

/** The four eval scores carried per row, normalised 0..1. */
export type EvalMetric =
  | "evalHallucination"
  | "evalCorrectness"
  | "evalFaithfulness"
  | "evalRelevance";

/** Hallucination is bad when HIGH; the other three are bad when LOW. */
export const EVAL_INVERTED: Record<EvalMetric, boolean> = {
  evalHallucination: true,
  evalCorrectness: false,
  evalFaithfulness: false,
  evalRelevance: false,
};

/** Human labels for the four eval metrics, for chips / captions. */
export const EVAL_LABEL: Record<EvalMetric, string> = {
  evalHallucination: "Hallucination",
  evalCorrectness: "Correctness",
  evalFaithfulness: "Faithfulness",
  evalRelevance: "Relevance",
};

/**
 * A range filter over one eval score (Prompts-4). Applied CLIENT-SIDE over the
 * loaded rows (like the cost ranges) — the four eval fields are already on every
 * PromptRow, so no extra query is needed.
 */
export interface EvalFilter {
  metric: EvalMetric;
  /** "lt" for normal metrics (below passing), "gt" for hallucination (above the
   *  acceptable ceiling). */
  op: "lt" | "gt";
  /** Threshold in 0..1. */
  threshold: number;
}

/**
 * The "failing" range filter for a metric (Prompts-4): spans below the passing
 * threshold. Thresholds mirror qualityColor's red boundary — hallucination
 * fails above 10%, the other three fail below 60%.
 */
export const evalFailFilter = (metric: EvalMetric): EvalFilter =>
  EVAL_INVERTED[metric]
    ? { metric, op: "gt", threshold: 0.1 }
    : { metric, op: "lt", threshold: 0.6 };

/**
 * True when a row's score satisfies the eval range filter. Rows with no score
 * for the metric are excluded — an unscored span can't be judged failing.
 */
export const matchEvalFilter = (row: PromptRow, f: EvalFilter): boolean => {
  const v = row[f.metric];
  if (v == null) return false;
  return f.op === "gt" ? v > f.threshold : v < f.threshold;
};

/** Short human phrase for an active fail filter, e.g. "Hallucination > 10%". */
export const evalFilterLabel = (f: EvalFilter): string =>
  `${EVAL_LABEL[f.metric]} ${f.op === "gt" ? ">" : "<"} ${Math.round(f.threshold * 100)}%`;

const evalValue = (row: PromptRow, m: EvalMetric): number | null => row[m];

/** True when a row carries at least one non-null eval score. */
export const rowHasEval = (row: PromptRow): boolean =>
  row.evalHallucination != null ||
  row.evalCorrectness != null ||
  row.evalFaithfulness != null ||
  row.evalRelevance != null;

/** True when ANY row in the set carries an eval score. */
export const anyRowHasEval = (rows: PromptRow[]): boolean => rows.some(rowHasEval);

/**
 * Per-row "badness" in [0,1], averaged over the metrics that are present so a
 * row scored on only one axis isn't unfairly ranked. Higher = worse. A row with
 * no eval scores returns -1 so it sorts last (it is filtered out first anyway).
 */
export const evalBadness = (row: PromptRow): number => {
  const parts: number[] = [];
  (Object.keys(EVAL_INVERTED) as EvalMetric[]).forEach((m) => {
    const v = evalValue(row, m);
    if (v == null) return;
    parts.push(EVAL_INVERTED[m] ? v : 1 - v);
  });
  if (parts.length === 0) return -1;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
};

/**
 * Rows that carry any eval score, ordered worst-first (Prompts-1). Ties break
 * by most-recent so the freshest offenders lead.
 */
export const evalTableRows = (rows: PromptRow[]): PromptRow[] =>
  rows
    .filter(rowHasEval)
    .sort((a, b) => evalBadness(b) - evalBadness(a) || b.timestampMs - a.timestampMs);

export interface EvalTrend {
  /** Percent values (score×100) of scored rows, oldest→newest. */
  values: number[];
  /** Matching time labels for the sparkline hover. */
  labels: string[];
}

/**
 * Per-metric trend over the loaded (in-view) scored rows (Prompts-4). Each point
 * is one scored span's percent, ordered oldest→newest — an honest trend of the
 * SAME "scored spans in view" the worst-models breakdown already summarises, so
 * it needs no extra scan. Returns empty when fewer than 3 points exist (too few
 * to read as a trend, and Sparkline needs ≥2 points anyway).
 */
export const evalTrendSeries = (
  rows: PromptRow[],
  metric: EvalMetric,
): EvalTrend => {
  const pts = rows
    .filter((r) => r[metric] != null)
    .sort((a, b) => a.timestampMs - b.timestampMs);
  if (pts.length < 3) return { values: [], labels: [] };
  const fmt = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return {
    values: pts.map((r) => (r[metric] as number) * 100),
    labels: pts.map((r) => fmt.format(new Date(r.timestampMs))),
  };
};

export interface ModelScore {
  model: string;
  /** Mean score on this metric, 0..1. */
  score: number;
  /** Rows contributing to the mean. */
  count: number;
}

/**
 * The `n` worst models for a single eval metric (Prompts-4). "Worst" respects
 * the metric's polarity (highest hallucination, lowest correctness/…). Only
 * models with at least one scored row are considered.
 */
export const worstModelsForMetric = (
  rows: PromptRow[],
  metric: EvalMetric,
  n = 3,
): ModelScore[] => {
  const inverted = EVAL_INVERTED[metric];
  const acc = new Map<string, { sum: number; count: number }>();
  for (const r of rows) {
    const v = evalValue(r, metric);
    if (v == null) continue;
    const model = r.model ?? "unknown";
    const cur = acc.get(model) ?? { sum: 0, count: 0 };
    cur.sum += v;
    cur.count += 1;
    acc.set(model, cur);
  }
  const scored: ModelScore[] = Array.from(acc.entries()).map(([model, a]) => ({
    model,
    score: a.sum / a.count,
    count: a.count,
  }));
  scored.sort((a, b) =>
    inverted ? b.score - a.score : a.score - b.score,
  );
  return scored.slice(0, n);
};
