import type { PromptsFilter } from "./usePrompts";
import type { PromptsSidebarFilter } from "./queries";
import { evalFilterLabel } from "./evalTable";

/**
 * Project a page-level PromptsFilter onto the server-side sidebar shape the
 * query builders understand (Prompts-2). Mirrors the `sidebar` object usePrompts
 * builds for the list query — `models`, `inCost`, `outCost` are omitted because
 * they are applied client-side over the loaded rows, not in DQL.
 */
export const toSidebar = (
  filter?: PromptsFilter,
): PromptsSidebarFilter | undefined => {
  if (!filter) return undefined;
  return {
    services: filter.services,
    kinds: filter.kinds,
    search: filter.search,
    providers: filter.providers,
    operations: filter.operations,
    agents: filter.agents,
    onlyErrors: filter.onlyErrors,
    onlyPii: filter.onlyPii,
    onlyWarnings: filter.onlyWarnings,
    onlyTruncated: filter.onlyTruncated,
    latency: filter.latency,
    temperature: filter.temperature,
  };
};

/**
 * True when any sidebar facet, status toggle, range control, search, or
 * problem-pattern focus is active — i.e. the list below is a strict subset of
 * the scope, so aggregate tiles need a "reflects current scope" caption
 * (Prompts-2).
 */
export const isScopeFiltered = (
  filter?: PromptsFilter,
  focus?: string | null,
): boolean => {
  if (focus) return true;
  if (!filter) return false;
  const anyArray = [
    filter.services,
    filter.models,
    filter.agents,
    filter.providers,
    filter.operations,
    filter.kinds,
  ].some((a) => Array.isArray(a) && a.length > 0);
  const anyToggle = Boolean(
    filter.onlyErrors ||
      filter.onlyPii ||
      filter.onlyWarnings ||
      filter.onlyTruncated,
  );
  const anyRange = Boolean(
    filter.latency ||
      filter.temperature ||
      filter.inCost ||
      filter.outCost ||
      filter.eval,
  );
  const anySearch = Boolean(filter.search && filter.search.trim());
  return anyArray || anyToggle || anyRange || anySearch;
};

const joinValues = (label: string, vals?: string[]): string | null =>
  vals && vals.length > 0
    ? `${label}: ${vals.slice(0, 3).join(", ")}${vals.length > 3 ? "…" : ""}`
    : null;

/**
 * Human-readable list of the active constraints, echoed in the filtered-empty
 * recovery state so the user sees what to relax (Prompts-7).
 */
export const describeFilter = (
  filter?: PromptsFilter,
  focusLabel?: string | null,
): string[] => {
  const out: string[] = [];
  if (focusLabel) out.push(`pattern: ${focusLabel}`);
  if (!filter) return out;
  const push = (s: string | null) => {
    if (s) out.push(s);
  };
  push(joinValues("AI app", filter.services));
  push(joinValues("model", filter.models));
  push(joinValues("agent", filter.agents));
  push(joinValues("provider", filter.providers));
  push(joinValues("operation", filter.operations));
  push(joinValues("type", filter.kinds));
  if (filter.onlyErrors) out.push("errors");
  if (filter.onlyPii) out.push("PII");
  if (filter.onlyWarnings) out.push("warnings");
  if (filter.onlyTruncated) out.push("truncated");
  if (filter.latency) out.push("duration range");
  if (filter.temperature) out.push("temperature range");
  if (filter.inCost || filter.outCost) out.push("cost range");
  if (filter.eval) out.push(evalFilterLabel(filter.eval));
  if (filter.search && filter.search.trim()) out.push(`search: "${filter.search.trim()}"`);
  return out;
};
