import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useGlobalFilters } from "../../scope/GlobalFilterContext";
import { useResolvedServices, canQueryScope } from "../../scope/useResolvedServices";
import { buildServiceModelHeatmapQuery } from "./queries";
import {
  foldHeatmapRecords,
  type CellRecord,
  type HeatmapCell,
  type HeatmapColumn,
  type HeatmapRow,
} from "./foldHeatmap";
import { DEMO_CELL_RECORDS } from "./demoData";

// Re-exported so existing call sites keep importing the record/row/column
// shapes and the pure fold from this hook module; the implementation lives in
// the React-free ./foldHeatmap so demoData.ts (and its test) can reuse the
// exact same fold function without pulling in React/DOM-dependent imports.
export { foldHeatmapRecords };
export type { CellRecord, HeatmapCell, HeatmapColumn, HeatmapRow };

export interface UseExplorerHeatmapResult {
  rows: HeatmapRow[];
  columns: HeatmapColumn[];
  maxCellTokens: number;
  isLoading: boolean;
  error?: Error;
}

/**
 * `showExample` (defaulting to false so no existing call site changes
 * behaviour) forces the heatmap to fold from the bundled demo fixtures
 * (`DEMO_CELL_RECORDS`) through the SAME `foldHeatmapRecords` fold real rows
 * go through, instead of querying Grail — used by ExplorerPage's Demo Mode /
 * no-telemetry fallback.
 */
export const useExplorerHeatmap = (showExample = false): UseExplorerHeatmapResult => {
  const { scope } = useScope();
  const { filters } = useGlobalFilters();
  const _resolution = useResolvedServices();
  const { serviceIds, isLoading: servicesLoading } = _resolution;
  const canQuery = canQueryScope(_resolution);

  const { data, isLoading, error } = useScopedDql<CellRecord>(
    canQuery ? buildServiceModelHeatmapQuery(serviceIds, scope.timeframe, filters) : "",
    { enabled: canQuery && !showExample, staleTime: 60_000 },
  );

  return useMemo<UseExplorerHeatmapResult>(() => {
    const records = showExample ? DEMO_CELL_RECORDS : (data?.records ?? []);
    const folded = foldHeatmapRecords(records);
    return {
      ...folded,
      isLoading: showExample ? false : servicesLoading || isLoading,
      error: showExample ? undefined : (error ?? undefined),
    };
  }, [showExample, data, isLoading, error, servicesLoading]);
};
