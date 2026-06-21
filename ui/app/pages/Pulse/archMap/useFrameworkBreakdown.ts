/**
 * Live framework breakdown for the AI Application Architecture map's filter
 * chips. Mirrors the sibling archMap hook (useArchitectureData): reads the
 * timeframe from `useScope()` and passes `null` serviceIds (fleet-wide; scope
 * is applied via segments + the global trace filter inside useScopedDql). The
 * raw signal rows are folded into canonical, deduped frameworks by
 * `rowsToFrameworks`.
 */
import { useMemo } from "react";
import { useScopedDql } from "../../../scope/useScopedDql";
import { useScope } from "../../../scope/ScopeContext";
import {
  buildFrameworkBreakdownQuery,
  rowsToFrameworks,
  type FrameworkRow,
  type DetectedFramework,
} from "./frameworkBreakdown";

export const useFrameworkBreakdown = (): {
  frameworks: DetectedFramework[];
  isLoading: boolean;
  error?: Error;
} => {
  const { scope } = useScope();
  const { data, isLoading, error } = useScopedDql<FrameworkRow>(
    buildFrameworkBreakdownQuery(null, scope.timeframe),
    { staleTime: 60_000 },
  );
  const frameworks = useMemo(
    () => rowsToFrameworks(data?.records ?? []),
    [data],
  );
  return { frameworks, isLoading, error: error ?? undefined };
};
