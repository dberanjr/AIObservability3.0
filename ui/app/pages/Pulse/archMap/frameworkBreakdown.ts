/**
 * Framework breakdown for the AI Application Architecture map. ONE scoped
 * summarize counts spans by the raw framework signals (traceloop workflow /
 * entity name + gen_ai.system); `rowsToFrameworks` folds those raw signals into
 * canonical, deduped frameworks via `detectFrameworkFromSignals`, dropping
 * provider-only (gen_ai.system = openai/anthropic/…) and unrecognized rows.
 *
 * Routes through useScopedDql (timeframe, segments, sampling, scan-limit, global
 * filter), so it mirrors the sibling archMap query builders: `null` serviceIds
 * (fleet-wide; scopeFilterClause emits "") and an optional `filters` param kept
 * forward-compatible (globalFilterClauses is centrally applied and returns "").
 */
import {
  dqlTimeArg,
  scopeFilterClause,
  globalFilterClauses,
  type GlobalFilters,
} from "../../../scope/queries";
import type { Timeframe } from "../../../scope/types";
import {
  detectFrameworkFromSignals,
  FRAMEWORK_LABEL,
  type FrameworkId,
} from "../../../detection/attributes";
import { toNum } from "../../../data/format";

/** Distinct framework signals in scope with span counts. */
export const buildFrameworkBreakdownQuery = (
  serviceIds: string[] | null,
  timeframe: Timeframe,
  filters?: GlobalFilters,
): string => {
  const toClause = dqlTimeArg(timeframe.to ?? "now()");
  // We group by `entity` (traceloop.entity.name) because Haystack/LlamaIndex are
  // ONLY detectable via that field. Its high cardinality is bounded by `limit 200`
  // which, after `sort n desc`, drops only negligible long-tail rows.
  return `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(timeframe.from)}, to: ${toClause}
${scopeFilterClause(serviceIds)}
${globalFilterClauses(filters)}
| filter isNotNull(traceloop.workflow.name) or isNotNull(traceloop.entity.name) or isNotNull(gen_ai.system)
| summarize n = count(), by: { wf = traceloop.workflow.name, entity = traceloop.entity.name, system = gen_ai.system }
| sort n desc
| limit 200
`.trim();
};

export interface FrameworkRow {
  wf?: string | null;
  entity?: string | null;
  system?: string | null;
  n?: number | string | null;
}

export interface DetectedFramework {
  id: FrameworkId;
  label: string;
  count: number;
}

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

/** Fold raw signal rows into labeled frameworks, dropping provider-only/unknown. */
export const rowsToFrameworks = (rows: FrameworkRow[]): DetectedFramework[] => {
  const acc = new Map<FrameworkId, number>();
  for (const r of rows) {
    const id = detectFrameworkFromSignals({
      workflowName: r.wf,
      entityName: r.entity,
      genAiSystem: r.system,
    });
    if (id === "unknown" || id === "custom") continue;
    acc.set(id, (acc.get(id) ?? 0) + num(r.n));
  }
  return [...acc.entries()]
    .map(([id, count]) => ({ id, label: FRAMEWORK_LABEL[id], count }))
    .sort((a, b) => b.count - a.count);
};
