/**
 * Guardrails & PII rollup for the Pulse safety panel. Reads attributes the
 * app doesn't otherwise consume: gen_ai.request.guardrail_id /
 * gen_ai.response.guardrail_action and gen_ai.privacy.pii_categories /
 * pii_detected. Counts are extrapolated by the active sampling ratio.
 */

import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useSampling } from "../../scope/SamplingContext";
import { dqlTimeArg } from "../../scope/queries";
import { toNum } from "../../data/format";
import { AI_SPAN_POPULATION } from "../../detection/attributeFields";
import { DEMO_SAFETY_COUNTS, DEMO_SAFETY_ACTIONS } from "./demoData";

interface CountsRecord {
  spans?: number | string;
  guardrail?: number | string;
  pii?: number | string;
}
interface ActionRecord {
  action?: string;
  n?: number | string;
}

export interface GuardrailAction {
  action: string;
  count: number;
}

export interface UseSafetyResult {
  spans: number;
  guardrailSpans: number;
  piiSpans: number;
  actions: GuardrailAction[];
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
| filter ${AI_SPAN_POPULATION}
| summarize {
    spans = count(),
    guardrail = countIf(isNotNull(\`gen_ai.response.guardrail_action\`) or isNotNull(\`gen_ai.request.guardrail_id\`)),
    pii = countIf(\`gen_ai.privacy.pii_detected\` == true or isNotNull(\`gen_ai.privacy.pii_categories\`))
  }
`.trim();

const actionQuery = (from: string, to: string): string =>
  `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(from)}, to: ${dqlTimeArg(to)}
| filter isNotNull(\`gen_ai.response.guardrail_action\`)
| summarize n = count(), by: { action = toString(\`gen_ai.response.guardrail_action\`) }
| sort n desc
| limit 6
`.trim();

/**
 * `showExample` (default false, mirrors useGuardrails.ts) renders the Demo
 * Mode dataset instead of querying Grail — set by Pulse's SafetyPanel when
 * Demo Mode (or the app-wide "no AI telemetry yet" fallback) is active. This
 * hook has no other caller, so the default only matters for tests.
 */
export const useSafety = (showExample = false): UseSafetyResult => {
  const { scope } = useScope();
  const { samplingRatio } = useSampling();
  const from = scope.timeframe.from;
  const to = scope.timeframe.to ?? "now()";

  const counts = useScopedDql<CountsRecord>(
    useMemo(() => countsQuery(from, to), [from, to]),
    { staleTime: 60_000, enabled: !showExample },
  );
  const dist = useScopedDql<ActionRecord>(
    useMemo(() => actionQuery(from, to), [from, to]),
    { staleTime: 60_000, enabled: !showExample },
  );

  return useMemo<UseSafetyResult>(() => {
    if (showExample) {
      return {
        spans: DEMO_SAFETY_COUNTS.spans,
        guardrailSpans: DEMO_SAFETY_COUNTS.guardrail,
        piiSpans: DEMO_SAFETY_COUNTS.pii,
        actions: DEMO_SAFETY_ACTIONS.map((a) => ({ action: a.action, count: a.n })),
        isLoading: false,
        error: undefined,
      };
    }
    const rec = counts.data?.records?.[0];
    const ex = (v: unknown): number => num(v) * samplingRatio;
    const actions: GuardrailAction[] = (dist.data?.records ?? [])
      .filter((r) => r.action)
      .map((r) => ({ action: r.action as string, count: ex(r.n) }));
    return {
      spans: ex(rec?.spans),
      guardrailSpans: ex(rec?.guardrail),
      piiSpans: ex(rec?.pii),
      actions,
      isLoading: counts.isLoading || dist.isLoading,
      error: counts.error ?? dist.error ?? undefined,
    };
  }, [showExample, counts.data, counts.isLoading, counts.error, dist.data, dist.isLoading, dist.error, samplingRatio]);
};
