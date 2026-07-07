// Shared sort types + the mapping that lifts heavy numeric sorts server-side
// (Prompts-9). Kept UI-free so both the table (client reorder) and the list
// query builder (server ORDER BY) agree on which columns are server-sorted.

export type SortKey =
  | "timestampMs"
  | "inTokens"
  | "outTokens"
  | "durationMs"
  | "temperature"
  | "inCost"
  | "outCost";
export type SortDir = "asc" | "desc";
export interface PromptSort {
  key: SortKey;
  dir: SortDir;
}

/**
 * UI sort key → the pre-projection DQL field buildPromptsListQuery can ORDER BY
 * before the 200-row cap, so the fetched sample is the TRUE top-N across the
 * timeframe (Prompts-9). Only the heavy numeric columns whose value exists as a
 * raw/derived span field are liftable:
 *   - in/out tokens and duration are real span attributes → server-sortable.
 *   - cost is a CLIENT-side estimate (tokens × a static price table), and
 *     temperature is not a heavy sort → both stay sample-only.
 *   - timestamp keeps its "newest 200, client-reorderable" default.
 * These field names must exist at the point buildPromptsListQuery emits `| sort`
 * (they are added in the fieldsAdd block before the projection).
 */
export const SERVER_SORT_FIELD: Partial<Record<SortKey, string>> = {
  inTokens: "in_tok",
  outTokens: "out_tok",
  durationMs: "duration_ms",
};

/**
 * True when the active sort is fetched server-ordered (true top-N), not merely
 * reordered over the loaded sample. Drives the honest "server-sorted" vs
 * "sample" badge (Prompts-9).
 */
export const isServerSorted = (key: SortKey): boolean =>
  SERVER_SORT_FIELD[key] !== undefined;

/**
 * The `<field> <dir>` fragment for a server-lifted sort, or null when the sort
 * is sample-only (cost / temperature / timestamp). Consumed by
 * buildPromptsListQuery as `| sort <fragment>`.
 */
export const serverSortClause = (sort?: PromptSort): string | null => {
  if (!sort) return null;
  const field = SERVER_SORT_FIELD[sort.key];
  return field ? `${field} ${sort.dir}` : null;
};
