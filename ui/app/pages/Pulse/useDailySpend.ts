/**
 * Daily spend for the Spend-glance bars, computed as EIGHT separate per-day
 * queries — each scanning only its own 24h window (~2 TB on a busy tenant, well
 * under the 5 TB scan-limit selector). A single 7-day query scans ~14 TB and
 * truncates at the limit, leaving older days empty; splitting by day keeps every
 * day complete. Each query sums per-model input/output tokens for the day and
 * costs them at real per-model rates (costOf — blended only for unpriced models).
 *
 * Hooks must run in a fixed order, so the eight queries are unrolled (not mapped).
 */
import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useSampling } from "../../scope/SamplingContext";
import { dqlTimeArg } from "../../scope/queries";
import { costOf } from "../../data/pricing";
import { toNum } from "../../data/format";

const DAYS = 8;

interface DayRec {
  model?: string;
  in_tok?: number;
  out_tok?: number;
}

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};

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

const dayLabel = (d: number): string => (d === 0 ? "Last 24h" : `${d}d ago`);

export interface DailySpend {
  /** Daily cost oldest → newest (for left-to-right bars). */
  bars: number[];
  /** Labels aligned with `bars`. */
  barLabels: string[];
  spend24h: number;
  spend7d: number;
  projected30d: number;
  /** 24h day-over-day % change (vs the prior day), or null. */
  delta24h: number | null;
  isLoading: boolean;
}

export const useDailySpend = (): DailySpend => {
  const { samplingRatio } = useSampling();
  const opts = { staleTime: 60_000 } as const;

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
    const dayCost = (recs: DayRec[] | undefined): number =>
      (recs ?? []).reduce(
        (acc, row) =>
          acc + costOf(num(row.in_tok) * samplingRatio, num(row.out_tok) * samplingRatio, row.model ?? null),
        0,
      );

    // totals[d]: cost of day d (0 = most recent 24h).
    const totals = results.map((r) => dayCost(r.data?.records));
    const bars: number[] = [];
    const barLabels: string[] = [];
    for (let i = DAYS - 1; i >= 0; i--) {
      bars.push(totals[i]);
      barLabels.push(dayLabel(i));
    }

    const spend24h = totals[0] ?? 0;
    const spend7d = totals.slice(0, 7).reduce((a, b) => a + b, 0);
    const projected30d = spend7d > 0 ? (spend7d / 7) * 30 : 0;
    const prev = totals[1] ?? 0;
    const delta24h = prev > 0 ? ((spend24h - prev) / prev) * 100 : null;

    return {
      bars,
      barLabels,
      spend24h,
      spend7d,
      projected30d,
      delta24h,
      isLoading: results.some((r) => r.isLoading),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r0.data, r1.data, r2.data, r3.data, r4.data, r5.data, r6.data, r7.data, samplingRatio]);
};
