/**
 * Pure record → {rows, columns, maxCellTokens} folding for the service × model
 * heatmap query (see `./queries.ts`). Extracted out of
 * `useExplorerHeatmap.ts` (a React hook module that transitively imports
 * React/DOM-dependent packages) into its own React-free module so both the
 * hook AND `demoData.ts` / its test can import the exact same fold function —
 * the demo dataset is built from small raw "cell" fixtures piped through this
 * real fold instead of hand-typed rows/columns, and vitest's node test runner
 * can import it directly (importing the hook file itself throws under node —
 * no `document`).
 */

import {
  PROVIDER_COLOR,
  normalizeProvider,
  canonicalizeModel,
  type ProviderId,
} from "../../detection/attributes";

/** One row returned by the service × model heatmap query (see `./queries.ts`). */
export interface CellRecord {
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
  /** Raw gen_ai.request.model values that map to this canonical column. */
  rawModels: string[];
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

export interface FoldedHeatmap {
  rows: HeatmapRow[];
  columns: HeatmapColumn[];
  maxCellTokens: number;
}

/** Fold raw service × model heatmap query rows into UI-ready rows/columns,
 *  canonicalizing model ids and grouping raw variants under one column. Pure
 *  — reused by both `useExplorerHeatmap` (real data) and `demoData.ts`
 *  (canned fixtures) so every derived field (row/column totals, the grid-wide
 *  max cell, provider color) is computed by the SAME logic regardless of
 *  source. */
export const foldHeatmapRecords = (records: CellRecord[]): FoldedHeatmap => {
  const rowMap = new Map<string, HeatmapRow>();
  const colMap = new Map<string, HeatmapColumn>();
  let maxCellTokens = 0;

  for (const r of records) {
    if (!r.service || !r.service_id || !r.model) continue;
    const modelKey = canonicalizeModel(r.model).label;
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
      if (r.model && !existingCol.rawModels.includes(r.model)) {
        existingCol.rawModels.push(r.model);
      }
    } else {
      colMap.set(modelKey, {
        model: modelKey,
        rawModels: r.model ? [r.model] : [],
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

  return { rows, columns, maxCellTokens };
};
