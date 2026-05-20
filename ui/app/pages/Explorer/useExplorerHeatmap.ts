import { useMemo } from "react";
import { useScopedDql } from "../../scope/useScopedDql";
import { useScope } from "../../scope/ScopeContext";
import { useResolvedServices, canQueryScope } from "../../scope/useResolvedServices";
import { buildServiceModelHeatmapQuery } from "./queries";
import {
  PROVIDER_COLOR,
  normalizeProvider,
  stripModelVersion,
  type ProviderId,
} from "../../detection/attributes";

interface CellRecord {
  service?: string;
  service_id?: string;
  model?: string;
  system?: string;
  requests?: number;
  tokens?: number;
}

export interface HeatmapCell {
  service: string;
  model: string;
  tokens: number;
  requests: number;
}

export interface HeatmapColumn {
  model: string;
  providerId: ProviderId;
  color: string;
  totalTokens: number;
}

export interface HeatmapRow {
  service: string;
  serviceId: string;
  totalTokens: number;
  cells: Map<string, HeatmapCell>;
}

export interface UseExplorerHeatmapResult {
  rows: HeatmapRow[];
  columns: HeatmapColumn[];
  maxCellTokens: number;
  isLoading: boolean;
  error?: Error;
}

export const useExplorerHeatmap = (): UseExplorerHeatmapResult => {
  const { scope } = useScope();
  const _resolution = useResolvedServices();
  const { serviceIds, isLoading: servicesLoading } = _resolution;
  const canQuery = canQueryScope(_resolution);

  const { data, isLoading, error } = useScopedDql<CellRecord>(
    canQuery ? buildServiceModelHeatmapQuery(serviceIds, scope.timeframe) : "",
    { enabled: canQuery, staleTime: 60_000 },
  );

  return useMemo<UseExplorerHeatmapResult>(() => {
    const rowMap = new Map<string, HeatmapRow>();
    const colMap = new Map<string, HeatmapColumn>();
    let maxCellTokens = 0;

    for (const r of data?.records ?? []) {
      if (!r.service || !r.service_id || !r.model) continue;
      const modelKey = stripModelVersion(r.model);
      const provider = normalizeProvider(r.system, r.model);

      let row = rowMap.get(r.service_id);
      if (!row) {
        row = {
          service: r.service,
          serviceId: r.service_id,
          totalTokens: 0,
          cells: new Map(),
        };
        rowMap.set(r.service_id, row);
      }
      const existingCell = row.cells.get(modelKey);
      const tokens = (existingCell?.tokens ?? 0) + (r.tokens ?? 0);
      const requests = (existingCell?.requests ?? 0) + (r.requests ?? 0);
      row.cells.set(modelKey, {
        service: r.service,
        model: modelKey,
        tokens,
        requests,
      });
      row.totalTokens += r.tokens ?? 0;
      if (tokens > maxCellTokens) maxCellTokens = tokens;

      const existingCol = colMap.get(modelKey);
      if (existingCol) {
        existingCol.totalTokens += r.tokens ?? 0;
      } else {
        colMap.set(modelKey, {
          model: modelKey,
          providerId: provider.id,
          color: PROVIDER_COLOR[provider.id],
          totalTokens: r.tokens ?? 0,
        });
      }
    }

    const rows = Array.from(rowMap.values()).sort(
      (a, b) => b.totalTokens - a.totalTokens,
    );
    const columns = Array.from(colMap.values()).sort(
      (a, b) => b.totalTokens - a.totalTokens,
    );

    return {
      rows,
      columns,
      maxCellTokens,
      isLoading: servicesLoading || isLoading,
      error: error ?? undefined,
    };
  }, [data, isLoading, error, servicesLoading]);
};
