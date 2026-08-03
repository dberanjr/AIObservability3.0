/**
 * Daily spend for the Spend-glance bars, computed as EIGHT separate per-day
 * queries — each scanning only its own 24h window. A single 7-day query scans
 * ~14 TB and truncates at the limit, leaving older days empty; splitting by day
 * keeps every day independent. Each query sums per-model input/output tokens for
 * the day and costs them at real per-model rates (costOf — blended only for
 * unpriced models).
 *
 * SAMPLING: a single 24h window is multiple TB on a high-volume tenant and blows
 * the platform's per-query execution-time limit at full fidelity (the scan-limit
 * selector doesn't help — the query times out before reaching it, returning
 * incomplete/erroring → the glance reads $0). So these queries run at a FLOOR
 * sampling ratio (DAILY_SPEND_MIN_SAMPLING) regardless of the toolbar's choice,
 * then extrapolate the token sums by that same ratio. Sum-aggregates extrapolate
 * cleanly, and the glance is an explicit estimate. The toolbar ratio still wins
 * when the user picks heavier sampling.
 *
 * Hooks must run in a fixed order, so the eight queries are unrolled (not mapped).
 */
import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useSampling } from "../../scope/SamplingContext";
import { dqlTimeArg } from "../../scope/queries";
import { computeDailySpend, type DayRec, type DailySpendCore } from "./parse";
import { DEMO_DAILY_SPEND } from "./demoData";

export type { DayRec };

// Floor sampling ratio for the per-day scans. At 1-in-100 a 24h window drops
// from ~1.7 TB / >10 s (times out) to ~21 GB / <1 s on the validated tenant,
// while extrapolated token sums stay representative. Honor a heavier toolbar
// ratio if the user picked one.
const DAILY_SPEND_MIN_SAMPLING = 100;

/** Per-day window query: day d (0 = the most recent 24h). Per-model tokens. */
const dayQuery = (d: number): string => {
  const from = dqlTimeArg(`now()-${(d + 1) * 24}h`);
  const to = dqlTimeArg(d === 0 ? "now()" : `now()-${d * 24}h`);
  return `
fetch spans, samplingRatio: 1, from: ${from}, to: ${to}
| filter isNotNull(\`gen_ai.request.model\`)
| summarize {
    in_tok = sum(toLong(coalesce(\`gen_ai.usage.input_tokens\`, \`gen_ai.usage.prompt_tokens\`, 0))),
    out_tok = sum(toLong(coalesce(\`gen_ai.usage.output_tokens\`, \`gen_ai.usage.completion_tokens\`, 0)))
  }, by: { model = \`gen_ai.request.model\` }
`.trim();
};

export interface DailySpend extends DailySpendCore {
  isLoading: boolean;
}

/**
 * `showExample` (default false, mirrors useGuardrails.ts) renders the Demo
 * Mode dataset instead of querying Grail — used by the Summary page's
 * PostureBand. Pulse's own SpendGlance never passes it, so its behavior is
 * unchanged.
 */
export const useDailySpend = (showExample = false): DailySpend => {
  const { samplingRatio } = useSampling();
  // Heavy per-day scans run at a sampling floor so they complete within the
  // platform execution-time limit; the toolbar ratio wins if it's heavier.
  const effectiveRatio = Math.max(samplingRatio, DAILY_SPEND_MIN_SAMPLING);
  const opts = {
    staleTime: 60_000,
    samplingRatioOverride: effectiveRatio,
    enabled: !showExample,
  } as const;

  // Eight independent per-day scans (unrolled — fixed hook order).
  const r0 = useScopedDql<DayRec>(dayQuery(0), opts);
  const r1 = useScopedDql<DayRec>(dayQuery(1), opts);
  const r2 = useScopedDql<DayRec>(dayQuery(2), opts);
  const r3 = useScopedDql<DayRec>(dayQuery(3), opts);
  const r4 = useScopedDql<DayRec>(dayQuery(4), opts);
  const r5 = useScopedDql<DayRec>(dayQuery(5), opts);
  const r6 = useScopedDql<DayRec>(dayQuery(6), opts);
  const r7 = useScopedDql<DayRec>(dayQuery(7), opts);
  const results = [r0, r1, r2, r3, r4, r5, r6, r7];

  return useMemo<DailySpend>(() => {
    if (showExample) return { ...DEMO_DAILY_SPEND, isLoading: false };
    const core = computeDailySpend(
      results.map((r) => r.data?.records),
      effectiveRatio,
    );
    return {
      ...core,
      isLoading: results.some((r) => r.isLoading),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showExample, r0.data, r1.data, r2.data, r3.data, r4.data, r5.data, r6.data, r7.data, effectiveRatio]);
};
