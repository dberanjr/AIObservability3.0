import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Skeleton } from "@dynatrace/strato-components/content";
import { fmtTokens } from "../../data/format";
import { FilterTrigger } from "../../components/FilterTrigger";
import { CollapsibleCard } from "../../components/CollapsibleCard";
import { ErrorState } from "../../components/ErrorState";
import { EmptyState } from "../../components/EmptyState";
import { useExplorerHeatmap } from "./useExplorerHeatmap";
import { ServiceModelModal } from "./ServiceModelModal";

/** A picked heatmap cell. `rawModels` is the FULL list of raw
 *  gen_ai.request.model variants that fold into the cell's canonical column
 *  (the detail query matches all of them); `modelLabel` is the canonical
 *  column label shown in the modal header. */
interface SelectedCell {
  service: string;
  rawModels: string[];
  modelLabel: string;
}

const CELL_W = 64;
const CELL_H = 28;
const SVC_COL_W = 220;
const ROW_CAP = 30;

/** Single sequential magnitude hue for every cell, so intensity is comparable
 *  across the whole grid (provider identity stays in the column-header dot).
 *  Previously each column tinted its provider colour, which made a dark
 *  Anthropic cell and a dark OpenAI cell incomparable. */
const SEQ_HUE = "var(--blue)";
const SEQ_MIN_PCT = 5;
const SEQ_MAX_PCT = 90;

/** Log-scaled intensity (5–90%) of the single sequential hue. `max` is the
 *  grid-wide busiest cell so every cell is measured against one scale. */
const cellColor = (tokens: number, max: number): string => {
  if (tokens <= 0 || max <= 0) return "transparent";
  const ratio = Math.log10(tokens + 1) / Math.log10(max + 1);
  const pct = Math.max(
    SEQ_MIN_PCT,
    Math.min(SEQ_MAX_PCT, Math.round(ratio * SEQ_MAX_PCT)),
  );
  return `color-mix(in oklab, ${SEQ_HUE} ${pct}%, transparent)`;
};

/** Compact gradient legend anchoring the sequential scale to real token
 *  counts (min / median / max nonzero cell), noting the log scaling. */
const HeatmapLegend = ({ values }: { values: number[] }) => {
  if (values.length === 0) return null;
  const min = values[0];
  const max = values[values.length - 1];
  const median = values[Math.floor(values.length / 2)];
  return (
    <Flex alignItems="center" gap={8} style={{ flexWrap: "wrap" }}>
      <Text style={{ fontSize: 10.5, color: "var(--text-3)" }}>Tokens</Text>
      <div style={{ minWidth: 120, flex: "0 1 180px" }}>
        <div
          aria-hidden
          style={{
            height: 8,
            borderRadius: 999,
            background: `linear-gradient(to right, color-mix(in oklab, ${SEQ_HUE} ${SEQ_MIN_PCT}%, transparent), color-mix(in oklab, ${SEQ_HUE} ${SEQ_MAX_PCT}%, transparent))`,
            border: "1px solid var(--border)",
          }}
        />
        <Flex
          justifyContent="space-between"
          style={{ marginTop: 2 }}
        >
          {[min, median, max].map((v, i) => (
            <Text
              key={i}
              style={{
                fontSize: 9.5,
                color: "var(--text-3)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {fmtTokens(v)}
            </Text>
          ))}
        </Flex>
      </div>
      <Text style={{ fontSize: 10.5, color: "var(--text-4)" }}>log-scaled</Text>
    </Flex>
  );
};

// Body is a separate component so useExplorerHeatmap (an independent DQL query)
// only runs while the section is expanded — collapsing unmounts the body and
// issues no query.
const ServiceModelHeatmapBody = () => {
  const result = useExplorerHeatmap();
  const [selected, setSelected] = React.useState<SelectedCell | null>(null);

  // Roving-tabindex position for the keyboard grid. Only ONE data cell is
  // Tab-reachable; arrow keys then move a roving focus cell-to-cell (WAI-ARIA
  // grid pattern) instead of the former hundreds of individual tab stops
  // (UX report Accessibility-7). Zero-token cells are non-interactive and are
  // skipped by arrow navigation.
  const [active, setActive] = React.useState<{ r: number; c: number } | null>(
    null,
  );
  const cellRefs = React.useRef<Map<string, HTMLDivElement>>(new Map());

  const total = result.rows.length;
  const visibleRows = result.rows.slice(0, ROW_CAP);
  const hiddenRows = total - visibleRows.length;
  const cols = result.columns;

  const tokensAt = React.useCallback(
    (r: number, c: number): number => {
      const row = visibleRows[r];
      const col = cols[c];
      if (!row || !col) return 0;
      return row.cells.get(col.model)?.tokens ?? 0;
    },
    [visibleRows, cols],
  );

  // First non-zero cell (row-major) — the default Tab target before the user
  // has moved the roving cursor.
  const firstNavigable = React.useMemo(() => {
    for (let r = 0; r < visibleRows.length; r += 1)
      for (let c = 0; c < cols.length; c += 1)
        if (tokensAt(r, c) > 0) return { r, c };
    return null;
  }, [visibleRows, cols, tokensAt]);

  // The single Tab-reachable cell. Falls back to firstNavigable when the stored
  // active cell is gone or became a zero cell after a scope change.
  const roving = React.useMemo(() => {
    if (active && tokensAt(active.r, active.c) > 0) return active;
    return firstNavigable;
  }, [active, firstNavigable, tokensAt]);

  const openCell = (r: number, c: number) => {
    const row = visibleRows[r];
    const col = cols[c];
    if (!row || !col || tokensAt(r, c) <= 0) return;
    setSelected({
      service: row.service,
      // FULL list of raw variants folded into this canonical column so the
      // modal aggregates exactly the cell (fall back to the label when no raw
      // variants were collected).
      rawModels: col.rawModels.length > 0 ? col.rawModels : [col.model],
      modelLabel: col.model,
    });
  };

  const focusCell = (r: number, c: number) => {
    setActive({ r, c });
    cellRefs.current.get(`${r}:${c}`)?.focus();
  };

  // Arrow keys skip zero cells so every landing cell carries data. Home/End
  // jump to the row's first/last non-zero cell; Enter/Space opens the cell's
  // detail modal.
  const onCellKeyDown = (
    e: React.KeyboardEvent<HTMLDivElement>,
    r: number,
    c: number,
  ) => {
    const findInRow = (from: number, dir: number): number | null => {
      for (let cc = from; cc >= 0 && cc < cols.length; cc += dir)
        if (tokensAt(r, cc) > 0) return cc;
      return null;
    };
    const findInCol = (from: number, dir: number): number | null => {
      for (let rr = from; rr >= 0 && rr < visibleRows.length; rr += dir)
        if (tokensAt(rr, c) > 0) return rr;
      return null;
    };
    switch (e.key) {
      case "ArrowRight": {
        const nc = findInRow(c + 1, 1);
        if (nc != null) {
          e.preventDefault();
          focusCell(r, nc);
        }
        break;
      }
      case "ArrowLeft": {
        const nc = findInRow(c - 1, -1);
        if (nc != null) {
          e.preventDefault();
          focusCell(r, nc);
        }
        break;
      }
      case "ArrowDown": {
        const nr = findInCol(r + 1, 1);
        if (nr != null) {
          e.preventDefault();
          focusCell(nr, c);
        }
        break;
      }
      case "ArrowUp": {
        const nr = findInCol(r - 1, -1);
        if (nr != null) {
          e.preventDefault();
          focusCell(nr, c);
        }
        break;
      }
      case "Home": {
        const nc = findInRow(0, 1);
        if (nc != null) {
          e.preventDefault();
          focusCell(r, nc);
        }
        break;
      }
      case "End": {
        const nc = findInRow(cols.length - 1, -1);
        if (nc != null) {
          e.preventDefault();
          focusCell(r, nc);
        }
        break;
      }
      case "Enter":
      case " ":
        e.preventDefault();
        openCell(r, c);
        break;
      default:
        break;
    }
  };

  // Nonzero cell token values (whole grid) → the legend's min/median/max anchors.
  const cellValues = React.useMemo(() => {
    const vals: number[] = [];
    for (const row of result.rows) {
      for (const c of row.cells.values()) if (c.tokens > 0) vals.push(c.tokens);
    }
    return vals.sort((a, b) => a - b);
  }, [result.rows]);

  return (
    <>
    <Flex flexDirection="column" gap={12} style={{ padding: 16 }}>
      <Flex alignItems="center" justifyContent="space-between" gap={12} style={{ flexWrap: "wrap" }}>
        <HeatmapLegend values={cellValues} />
        <Text style={{ fontSize: 11.5, color: "var(--text-3)" }}>
          {total > ROW_CAP
            ? `Top ${ROW_CAP} of ${total} services`
            : `${total} ${total === 1 ? "service" : "services"}`}{" "}
          · {result.columns.length} models
        </Text>
      </Flex>

      {result.isLoading ? (
        <Skeleton style={{ height: 240 }} />
      ) : result.error ? (
        <ErrorState
          title="Couldn't load the service × model usage"
          error={result.error}
          bare
        />
      ) : result.rows.length === 0 ? (
        <EmptyState
          bare
          cause="no-activity"
          title="No usage data in the current scope."
          hint="gen_ai.usage.input_tokens · gen_ai.usage.output_tokens"
        />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <div
            role="grid"
            aria-readonly
            aria-label="Service by model token usage. Use the arrow keys to move between cells; press Enter to open a cell's detail."
            aria-rowcount={total + 1}
            aria-colcount={cols.length + 1}
            style={{
              display: "grid",
              gridTemplateColumns: `${SVC_COL_W}px repeat(${cols.length}, ${CELL_W}px)`,
              gap: 2,
              minWidth: SVC_COL_W + CELL_W * cols.length + 8,
            }}
          >
            {/* Header row — display:contents keeps the cells as direct grid
                items while still exposing a role="row" grouping to AT. */}
            <div role="row" aria-rowindex={1} style={{ display: "contents" }}>
              <div
                role="columnheader"
                aria-colindex={1}
                style={{
                  position: "sticky",
                  left: 0,
                  background: "var(--surface)",
                  zIndex: 1,
                  padding: "6px 8px",
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--text-3)",
                }}
              >
                Service
              </div>
              {cols.map((col, ci) => (
                <div
                  key={col.model}
                  role="columnheader"
                  aria-colindex={ci + 2}
                  style={{
                    padding: "4px 4px",
                    textAlign: "center",
                    fontFamily: "var(--mono, monospace)",
                    fontSize: 10.5,
                    color: "var(--text-3)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={col.model}
                >
                  <Flex
                    alignItems="center"
                    justifyContent="center"
                    gap={4}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: col.color,
                        flex: "0 0 auto",
                      }}
                    />
                    <FilterTrigger
                      attribute="gen_ai.request.model"
                      value={col.rawModels.length > 0 ? col.rawModels : col.model}
                      label="model"
                    >
                      <span
                        style={{
                          display: "block",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: CELL_W - 16,
                        }}
                      >
                        {col.model}
                      </span>
                    </FilterTrigger>
                  </Flex>
                </div>
              ))}
            </div>

            {visibleRows.map((row, rowIdx) => (
              <div
                role="row"
                aria-rowindex={rowIdx + 2}
                key={row.serviceId}
                style={{ display: "contents" }}
              >
                <div
                  role="rowheader"
                  aria-colindex={1}
                  style={{
                    position: "sticky",
                    left: 0,
                    background: "var(--surface)",
                    padding: "6px 8px",
                    fontFamily: "var(--mono, monospace)",
                    fontSize: 12,
                    color: "var(--text)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    borderTop: "1px solid var(--border)",
                  }}
                  title={row.service}
                >
                  <Flex alignItems="center" gap={6}>
                    <span
                      aria-hidden
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: "var(--green-2)",
                        flex: "0 0 auto",
                      }}
                    />
                    <FilterTrigger
                      attribute="service.name"
                      value={row.service}
                      label="service"
                    >
                      {row.service}
                    </FilterTrigger>
                  </Flex>
                </div>
                {cols.map((col, colIdx) => {
                  const cell = row.cells.get(col.model);
                  const tokens = cell?.tokens ?? 0;
                  const zero = tokens <= 0;
                  const isRoving =
                    roving?.r === rowIdx && roving?.c === colIdx;
                  return (
                    <div
                      key={col.model}
                      role="gridcell"
                      aria-colindex={colIdx + 2}
                      ref={
                        zero
                          ? undefined
                          : (node) => {
                              const k = `${rowIdx}:${colIdx}`;
                              if (node) cellRefs.current.set(k, node);
                              else cellRefs.current.delete(k);
                            }
                      }
                      // Roving tabindex: the active cell is the only Tab stop;
                      // every other data cell is programmatically focusable
                      // (-1). Zero cells are inert (no tabIndex / handlers).
                      tabIndex={zero ? undefined : isRoving ? 0 : -1}
                      aria-label={
                        zero
                          ? `${row.service}, ${col.model}: no usage`
                          : `${row.service}, ${col.model}: ${fmtTokens(
                              tokens,
                            )} tokens, ${cell?.requests ?? 0} requests. Press Enter for detail.`
                      }
                      onClick={
                        zero
                          ? undefined
                          : () => {
                              setActive({ r: rowIdx, c: colIdx });
                              openCell(rowIdx, colIdx);
                            }
                      }
                      onKeyDown={
                        zero
                          ? undefined
                          : (e) => onCellKeyDown(e, rowIdx, colIdx)
                      }
                      onFocus={
                        zero
                          ? undefined
                          : () => setActive({ r: rowIdx, c: colIdx })
                      }
                      title={
                        cell
                          ? `${row.service} · ${col.model}: ${fmtTokens(tokens)} tokens (${cell.requests} req)`
                          : `${row.service} · ${col.model}: 0`
                      }
                      style={{
                        height: CELL_H,
                        borderTop: "1px solid var(--border)",
                        background: cellColor(tokens, result.maxCellTokens),
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: "var(--mono, monospace)",
                        fontSize: 10.5,
                        color: "var(--text-2)",
                        cursor: zero ? "default" : "pointer",
                      }}
                    >
                      {tokens > 0 ? fmtTokens(tokens) : ""}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          {hiddenRows > 0 && (
            <div
              style={{
                position: "sticky",
                left: 0,
                padding: "6px 8px",
                borderTop: "1px solid var(--border)",
                fontSize: 11,
                color: "var(--text-3)",
              }}
            >
              {hiddenRows} more{" "}
              {hiddenRows === 1 ? "service" : "services"} not shown (ranked by
              tokens) — narrow the scope to see them.
            </div>
          )}
        </div>
      )}
    </Flex>
    {selected && (
      <ServiceModelModal
        service={selected.service}
        rawModels={selected.rawModels}
        modelLabel={selected.modelLabel}
        onClose={() => setSelected(null)}
      />
    )}
    </>
  );
};

export interface ServiceModelHeatmapProps {
  /** Controlled collapse state, so a KPI tile can force this card open. */
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
}

export const ServiceModelHeatmap = ({
  open,
  onOpenChange,
}: ServiceModelHeatmapProps = {}) => (
  <CollapsibleCard
    title="Service × model usage"
    subtitle="Tokens per service / model — single log-scaled magnitude scale (see legend)"
    open={open}
    onOpenChange={onOpenChange}
    defaultOpen
  >
    <ServiceModelHeatmapBody />
  </CollapsibleCard>
);
