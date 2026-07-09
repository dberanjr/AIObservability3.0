import { normalizeBedrockModelId } from "../../bedrock/model";
import type { AgentSessionRow, PerfByModelRow } from "../../bedrock/parse";

/**
 * `AgentSessionRow.models` (from `parseAgentSessions`) is mapped through
 * `shortModelName` — region/vendor prefix and ARN path stripped, but case,
 * version and date suffixes kept (e.g. "claude-sonnet-4-6-20250219-v1:0").
 * `PerfByModelRow.model` (from `parsePerfByModel`) is mapped through
 * `normalizeBedrockModelId`, which ALSO lowercases and strips version/date/
 * revision suffixes (→ "claude-sonnet-4-6"). Matching a session's raw
 * short-name model straight against perf rows silently misses almost every
 * row — the same shortModelName-vs-normalizeBedrockModelId mismatch that hit
 * D2 (see BedrockHero's identical re-key for its cost-concentration insight).
 * Re-key through `normalizeBedrockModelId` before comparing so both sides
 * land in the same key space.
 */
export const toPerfKey = (shortModel: string): string =>
  normalizeBedrockModelId(shortModel);

/** The session's primary model, in perf-row key space. Sessions can invoke
 *  more than one model (`collectDistinct` in the query); "primary" is simply
 *  the first one the query returned — there's no volume-weighting available
 *  on an `AgentSessionRow`. Empty string when the session has no models. */
export const primaryModelKey = (row: Pick<AgentSessionRow, "models">): string =>
  toPerfKey(row.models[0] ?? "");

/** Perf row for a single model name (already in shortModelName space),
 *  or undefined when nothing in `perfRows` matches after re-keying. */
export const perfForModel = (
  model: string,
  perfRows: PerfByModelRow[],
): PerfByModelRow | undefined => {
  const key = toPerfKey(model);
  if (!key) return undefined;
  return perfRows.find((p) => p.model === key);
};

/** Perf row for a session's PRIMARY model — used for the leaderboard's P95
 *  column. Undefined (never 0) when the session has no models or no perf
 *  row matches; callers should render an em dash in that case. */
export const perfForSession = (
  row: AgentSessionRow,
  perfRows: PerfByModelRow[],
): PerfByModelRow | undefined => perfForModel(row.models[0] ?? "", perfRows);

/** Perf lookup for EVERY model a session touched (not just the primary one),
 *  for the session-detail modal's per-model latency breakdown. Models with no
 *  matching perf row are still included (`perf: undefined`) so the modal can
 *  render "the data just isn't there" rather than silently dropping a model. */
export interface SessionModelPerf {
  model: string;
  perf: PerfByModelRow | undefined;
}
export const sessionModelPerf = (
  row: Pick<AgentSessionRow, "models">,
  perfRows: PerfByModelRow[],
): SessionModelPerf[] => row.models.map((model) => ({ model, perf: perfForModel(model, perfRows) }));
