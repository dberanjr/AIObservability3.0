import React, { useCallback, useEffect, useRef, useState } from "react";

export interface DataColumn<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  align?: "left" | "right";
  /** Initial column width in px (default 140). */
  width?: number;
  /** Minimum width the user can drag to (default 56). */
  minWidth?: number;
  /** Monospace cell text (ids, IPs, ARNs). */
  mono?: boolean;
  /** Don't clip with an ellipsis — wrap to show the full value (e.g. an
   *  identity/ARN the user asked to see in full). Content stays inside the
   *  column; the row just grows taller. */
  noTruncate?: boolean;
}

export interface DataTableProps<T> {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  /** Cap the body height and scroll vertically past it. */
  maxHeight?: number;
  /** Optional per-row click. */
  onRowClick?: (row: T) => void;
  /** Font size for body cells (default 12). */
  fontSize?: number;
}

const DEFAULT_W = 140;
const DEFAULT_MIN = 56;

const HEADER_CELL: React.CSSProperties = {
  position: "relative",
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  color: "var(--text-3)",
  padding: "6px 10px",
  boxSizing: "border-box",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

/**
 * A lightweight table with USER-RESIZABLE columns. Drag the hairline handle on
 * a header cell's right edge to widen/narrow that column; every cell keeps its
 * column width and clips (or wraps, for `noTruncate` columns) so a long value
 * never leaks into the neighbour or out of the card — the whole table lives in
 * a horizontal-scroll container, so widening a column scrolls rather than
 * breaking the layout. Column widths are local state (reset on unmount); the
 * data placement is driven entirely off the same width map as the header, so
 * headers and cells can't drift out of alignment.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  maxHeight,
  onRowClick,
  fontSize = 12,
}: DataTableProps<T>) {
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ key: string; startX: number; startW: number; min: number } | null>(null);

  const widthOf = useCallback(
    (c: DataColumn<T>): number => widths[c.key] ?? c.width ?? DEFAULT_W,
    [widths],
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const d = drag.current;
      if (!d) return;
      const next = Math.max(d.min, d.startW + (e.clientX - d.startX));
      setWidths((prev) => ({ ...prev, [d.key]: next }));
    };
    const onUp = () => {
      drag.current = null;
      setDragging(false);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);

  const startResize = (col: DataColumn<T>, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    drag.current = {
      key: col.key,
      startX: e.clientX,
      startW: widthOf(col),
      min: col.minWidth ?? DEFAULT_MIN,
    };
    setDragging(true);
  };

  const totalWidth = columns.reduce((sum, c) => sum + widthOf(c), 0);

  const cellBase = (col: DataColumn<T>): React.CSSProperties => ({
    width: widthOf(col),
    flex: "0 0 auto",
    boxSizing: "border-box",
    padding: "7px 10px",
    fontSize,
    textAlign: col.align ?? "left",
    fontFamily: col.mono ? "var(--mono, monospace)" : undefined,
    fontVariantNumeric: col.align === "right" ? "tabular-nums" : undefined,
    color: "var(--text)",
    ...(col.noTruncate
      ? { whiteSpace: "normal", wordBreak: "break-word" }
      : { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }),
  });

  return (
    <div
      style={{
        overflowX: "auto",
        userSelect: dragging ? "none" : undefined,
        cursor: dragging ? "col-resize" : undefined,
      }}
    >
      <style>{`.aiobs-col-resize:hover{border-right-color:var(--blue)!important}.aiobs-datatable-row:hover{background:var(--surface-2)}`}</style>
      <div style={{ minWidth: totalWidth }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            position: "sticky",
            top: 0,
            background: "var(--surface)",
            borderBottom: "1px solid var(--border)",
            zIndex: 1,
          }}
        >
          {columns.map((col) => (
            <div
              key={col.key}
              style={{
                ...HEADER_CELL,
                width: widthOf(col),
                flex: "0 0 auto",
                textAlign: col.align ?? "left",
              }}
              title={col.header}
            >
              {col.header}
              <span
                role="separator"
                aria-orientation="vertical"
                aria-label={`Resize ${col.header} column`}
                onMouseDown={(e) => startResize(col, e)}
                className="aiobs-col-resize"
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  width: 8,
                  height: "100%",
                  cursor: "col-resize",
                  // hairline sits in the middle of the 8px hit area
                  borderRight: "2px solid transparent",
                }}
              />
            </div>
          ))}
        </div>

        {/* Body */}
        <div style={maxHeight ? { maxHeight, overflowY: "auto" } : undefined}>
          {rows.map((row, i) => (
            <div
              key={rowKey(row, i)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={{
                display: "flex",
                borderBottom: "1px solid var(--border)",
                cursor: onRowClick ? "pointer" : undefined,
              }}
              className={onRowClick ? "aiobs-datatable-row" : undefined}
            >
              {columns.map((col) => (
                <div key={col.key} style={cellBase(col)}>
                  {col.render(row)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
