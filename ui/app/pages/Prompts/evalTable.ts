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
