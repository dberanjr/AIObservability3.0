/**
 * Pure fold functions for the two Summary-only hooks that fold raw DQL rows
 * client-side: useHiddenFailures and useProblemPatternCounts.
 *
 * Kept in a SEPARATE module from the hooks (mirrors `ui/app/pages/Agents/parse.ts`
 * and `ui/app/pages/Pulse/parse.ts`) so both the real query path and the Demo
 * Mode path (`demoData.ts`) share the exact same math, AND so this module
 * stays free of React / useScopedDql — pulling those in here would drag a
 * DOM-dependent transitive chain into the pure-function test runner
 * (`vitest.config.ts` runs `environment: "node"`, no `document`).
 */

import { FOCUS_PREDICATES, CROSS_SPAN_FOCUS } from "../Prompts/focus";
import { patternAlias } from "./queries";

/** Mirrors `scope/SamplingContext.tsx`'s `extrapolate` — duplicated locally
 *  (rather than imported) because that module is React/DOM-adjacent and
 *  would break this pure-function test runner. */
const extrapolate = (
  value: number | null | undefined,
  samplingRatio: number,
): number | null => {
  if (value == null || !Number.isFinite(value)) return value ?? null;
  return value * samplingRatio;
};

/* ------------------------------ useHiddenFailures ------------------------- */

export interface HiddenRecord {
  refusals?: number;
  truncations?: number;
  content_filters?: number;
  other?: number;
}

export interface HiddenCategory {
  key: string;
  label: string;
  count: number;
  color: string;
}

export interface HiddenFailuresCore {
  categories: HiddenCategory[];
  total: number;
}

/**
 * Pure fold: a raw hidden-failures row into `HiddenFailuresCore`. Both
 * `useHiddenFailures` (real rows) and `demoData.ts` (canned row) call this.
 */
export const computeHiddenFailures = (
  row: HiddenRecord | undefined,
  samplingRatio: number,
): HiddenFailuresCore => {
  const refusals = extrapolate(row?.refusals, samplingRatio) ?? 0;
  const truncations = extrapolate(row?.truncations, samplingRatio) ?? 0;
  const contentFilters = extrapolate(row?.content_filters, samplingRatio) ?? 0;
  const other = extrapolate(row?.other, samplingRatio) ?? 0;

  const categories: HiddenCategory[] = [
    { key: "refusals", label: "Refusals", count: refusals, color: "var(--red)" },
    {
      key: "truncations",
      label: "Max-token truncation",
      count: truncations,
      color: "var(--pink)",
    },
    {
      key: "content_filters",
      label: "Content-filter blocks",
      count: contentFilters,
      color: "var(--amber)",
    },
    { key: "other", label: "Other (provider / guardrail)", count: other, color: "var(--purple-2)" },
  ].filter((c) => c.count > 0);

  const total = categories.reduce((a, c) => a + c.count, 0);

  return { categories, total };
};

/* -------------------------- useProblemPatternCounts ------------------------ */

/** Resolver row cap. Trace counts for these detectors sit in the tens/low
 *  hundreds on real tenants; a 2000 ceiling counts them exactly and only flags
 *  `truncated` in the (unrealistic) event it's exceeded. */
const COUNT_CAP = 2000;

/**
 * The 4 cross-span detectors, in a fixed order so their resolver queries map
 * to a fixed set of hook calls (hooks can't run in a loop). Each id also
 * exists in `CROSS_SPAN_FOCUS` — this array just pins call/iteration order.
 */
export const CROSS_SPAN_IDS = [
  "tool-retry-storm",
  "agent-n1-tool-calls",
  "vdb-topk-over-retrieval",
  "mem-history-growth",
] as const;

export type PatternClass = "same-span" | "cross-span";

export interface ProblemPatternCount {
  /** The `?focus` id — drills to Prompts with this focus preset. */
  id: string;
  label: string;
  cls: PatternClass;
  count: number;
  /** Proxy signal (cross-span only) — surfaced with an "≈" marker. */
  approximate: boolean;
  /** The resolver hit the row cap — the count is a floor. */
  truncated: boolean;
}

/**
 * Pure fold: the same-span aggregate row + each cross-span resolver's
 * resolved-trace COUNT (not the full record array — only `.length` is ever
 * read) into the ranked `ProblemPatternCount[]` list. Both
 * `useProblemPatternCounts` (real rows) and `demoData.ts` (canned fixtures)
 * call this.
 */
export const computeProblemPatternCounts = (
  sameRow: Record<string, number> | undefined,
  crossSpanCounts: Record<string, number>,
  samplingRatio: number,
): ProblemPatternCount[] => {
  const patterns: ProblemPatternCount[] = [];

  // Same-span: one row per FOCUS_PREDICATES entry, count extrapolated for
  // sampling (countIf is a count aggregate).
  for (const [id, preset] of Object.entries(FOCUS_PREDICATES)) {
    const raw = sameRow?.[patternAlias(id)];
    patterns.push({
      id,
      label: preset.label,
      cls: "same-span",
      count: Math.round(extrapolate(raw, samplingRatio) ?? 0),
      approximate: false,
      truncated: false,
    });
  }

  // Cross-span: count resolved traces (resolver returns cap+1 rows so we can
  // flag truncation). Trace counts aren't extrapolated — the resolver runs
  // over the trace population, and the ranking is what matters.
  for (const id of CROSS_SPAN_IDS) {
    const preset = CROSS_SPAN_FOCUS[id];
    const recordCount = crossSpanCounts[id] ?? 0;
    const truncated = recordCount > COUNT_CAP;
    patterns.push({
      id,
      label: preset.label,
      cls: "cross-span",
      count: Math.min(recordCount, COUNT_CAP),
      approximate: Boolean(preset.approximate),
      truncated,
    });
  }

  patterns.sort((a, b) => b.count - a.count);
  return patterns;
};
