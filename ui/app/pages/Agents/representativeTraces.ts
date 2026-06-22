/**
 * Pure "interesting trace" selector for the Agents-tab tool drilldown.
 *
 * Given a pool of candidate traces for one agent+tool (each with latency,
 * error flag, start time and call count), deterministically pick a small,
 * DIVERSE set (<= max, default 10) so the user can eyeball a representative
 * spread rather than a random 10. Tool spans carry no tokens/model, so
 * selection is driven purely by latency + error + recency + time-spread.
 *
 * Anchors (in priority order): slowest, fastest, up to 2 errored, median,
 * most-recent, oldest. Remaining slots are filled by spreading across the
 * latency range (evenly-spaced percentiles) to avoid clustering. The result
 * is deduped by traceId and ordered slowest-first so the most "interesting"
 * (worst-latency) traces lead.
 */
export interface CandidateTrace {
  traceId: string;
  startMs: number;
  durMs: number;
  isError: boolean;
  calls: number;
}

export type RepLabel =
  | "slowest"
  | "fastest"
  | "errored"
  | "median"
  | "recent"
  | "oldest"
  | "spread";

export interface RepTrace extends CandidateTrace {
  /** Short human reason this trace was surfaced. */
  label: RepLabel;
}

export const pickRepresentativeTraces = (
  candidates: CandidateTrace[],
  max = 10,
): RepTrace[] => {
  if (candidates.length === 0 || max <= 0) return [];

  // Sorted-by-latency working copy; ties broken by traceId for determinism.
  const byDur = [...candidates].sort(
    (a, b) => a.durMs - b.durMs || a.traceId.localeCompare(b.traceId),
  );
  const byStart = [...candidates].sort(
    (a, b) => a.startMs - b.startMs || a.traceId.localeCompare(b.traceId),
  );

  // First-label-wins map: a trace that qualifies for several anchors keeps the
  // highest-priority reason (the order we add them below).
  const picked = new Map<string, RepLabel>();
  const add = (t: CandidateTrace | undefined, label: RepLabel): void => {
    if (!t) return;
    if (picked.size >= max && !picked.has(t.traceId)) return;
    if (!picked.has(t.traceId)) picked.set(t.traceId, label);
  };

  // 1. slowest / fastest
  add(byDur[byDur.length - 1], "slowest");
  add(byDur[0], "fastest");

  // 2. up to 2 errored, slowest-first (errors at high latency are most telling)
  const errored = byDur.filter((t) => t.isError).reverse();
  for (let i = 0; i < errored.length && i < 2; i++) add(errored[i], "errored");

  // 3. median-latency
  add(byDur[Math.floor((byDur.length - 1) / 2)], "median");

  // 4. recency spread
  add(byStart[byStart.length - 1], "recent");
  add(byStart[0], "oldest");

  // 5. fill remaining slots by evenly-spaced latency percentiles.
  if (picked.size < max && byDur.length > picked.size) {
    const remaining = max - picked.size;
    // Evenly spaced indices across the latency-sorted pool (excludes the
    // already-taken extremes naturally as we skip dupes).
    const step = (byDur.length - 1) / (remaining + 1);
    for (let i = 1; i <= remaining && picked.size < max; i++) {
      const idx = Math.round(step * i);
      add(byDur[idx], "spread");
    }
    // If percentile sampling collided with anchors and left slots, top up in
    // latency order so we always return up to min(max, pool) traces.
    for (let i = byDur.length - 1; i >= 0 && picked.size < max; i--) {
      add(byDur[i], "spread");
    }
  }

  // Materialize, ordered slowest-first (most interesting leads).
  const out: RepTrace[] = [];
  for (let i = byDur.length - 1; i >= 0; i--) {
    const t = byDur[i];
    const label = picked.get(t.traceId);
    if (label) out.push({ ...t, label });
  }
  return out;
};
