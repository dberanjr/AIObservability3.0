import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePersistedState } from "../../state/usePersistedState";

/**
 * One draggable / resizable tile fed to the grid. `node` is the fully-formed
 * tile (ScanScope → CollapsibleTile → card); the grid only owns placement.
 */
export interface GridTile {
  id: string;
  node: React.ReactNode;
  /** Default width in grid columns (of `columns`). */
  defaultColSpan: number;
  /** Default fixed height in px; omitted = size to content. */
  defaultHeight?: number;
}

interface TileSize {
  colSpan: number;
  /** null = auto (content) height. */
  height: number | null;
}
interface GridLayout {
  order: string[];
  sizes: Record<string, TileSize>;
}

const GAP = 16;
const MIN_HEIGHT = 120;

/** Columns actually rendered at a given container width (responsive step-down). */
const colsForWidth = (w: number, max: number): number => {
  if (w >= 1000) return max;
  if (w >= 680) return Math.min(max, 6);
  if (w >= 460) return Math.min(max, 2);
  return 1;
};

const DragStrip = ({ onArm }: { onArm: (armed: boolean) => void }) => (
  <div
    className="aiobs-tile-drag"
    onMouseDown={() => onArm(true)}
    onMouseUp={() => onArm(false)}
    title="Drag to reorder"
    aria-hidden
  >
    <span className="aiobs-tile-grip" />
  </div>
);

/**
 * A CSS-grid dashboard section whose tiles the user can reorder (drag the top
 * strip) and resize (drag the bottom-right corner — horizontal changes the
 * column span, vertical changes the height). Layout is persisted per-user under
 * `storageKey`, reconciled against the current tile set so adding/removing a
 * tile never strands stale layout. Uses native drag + pointer events, so no
 * dependency is pulled in.
 */
export const CustomizableGrid = ({
  storageKey,
  columns,
  tiles,
  editable = false,
}: {
  storageKey: string;
  columns: number;
  tiles: GridTile[];
  /** When false (default) the section is read-only: no drag strips, resize
   *  handles, or reset button, so the default landing is calm. Collapse
   *  (CollapsibleTile) stays available regardless. (SUM-4) */
  editable?: boolean;
}) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [containerW, setContainerW] = useState(1200);
  const [dragArmedId, setDragArmedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const defaults = useMemo<GridLayout>(
    () => ({
      order: tiles.map((t) => t.id),
      sizes: Object.fromEntries(
        tiles.map((t) => [t.id, { colSpan: t.defaultColSpan, height: t.defaultHeight ?? null }]),
      ),
    }),
    [tiles],
  );

  const [stored, setStored] = usePersistedState<GridLayout | null>(
    `ai-obs.summary.grid.${storageKey}`,
    null,
  );

  // Reconcile persisted layout against the live tile set: keep known ids in
  // their saved order, append any new tiles, drop any that no longer exist.
  const layout = useMemo<GridLayout>(() => {
    if (!stored) return defaults;
    const ids = new Set(tiles.map((t) => t.id));
    const order = [
      ...stored.order.filter((id) => ids.has(id)),
      ...tiles.map((t) => t.id).filter((id) => !stored.order.includes(id)),
    ];
    const sizes: Record<string, TileSize> = {};
    for (const t of tiles) sizes[t.id] = stored.sizes?.[t.id] ?? defaults.sizes[t.id];
    return { order, sizes };
  }, [stored, tiles, defaults]);

  const effCols = colsForWidth(containerW, columns);
  const isCustomized = stored != null;

  useEffect(() => {
    if (!wrapRef.current || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) =>
      setContainerW(Math.max(240, Math.floor(e.contentRect.width))),
    );
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const commit = useCallback((next: GridLayout) => setStored(next), [setStored]);

  const reorder = useCallback(
    (fromId: string, toId: string) => {
      if (fromId === toId) return;
      const order = [...layout.order];
      const from = order.indexOf(fromId);
      const to = order.indexOf(toId);
      if (from < 0 || to < 0) return;
      order.splice(from, 1);
      order.splice(to, 0, fromId);
      commit({ ...layout, order });
    },
    [layout, commit],
  );

  const orderedTiles = useMemo(() => {
    const byId = new Map(tiles.map((t) => [t.id, t]));
    return layout.order.map((id) => byId.get(id)).filter(Boolean) as GridTile[];
  }, [layout.order, tiles]);

  // --- resize (bottom-right corner) --------------------------------------
  const resizeRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    startCols: number;
    startHeight: number;
    itemTop: number;
    colUnit: number;
  } | null>(null);

  const onResizePointerDown = (
    e: React.PointerEvent,
    id: string,
    itemEl: HTMLElement | null,
  ) => {
    if (!itemEl) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const rect = itemEl.getBoundingClientRect();
    const colUnit = (containerW - GAP * (effCols - 1)) / effCols + GAP;
    resizeRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      startCols: Math.min(layout.sizes[id]?.colSpan ?? 1, effCols),
      startHeight: rect.height,
      itemTop: rect.top,
      colUnit,
    };
  };

  const onResizePointerMove = (e: React.PointerEvent) => {
    const r = resizeRef.current;
    if (!r) return;
    const dxCols = Math.round((e.clientX - r.startX) / r.colUnit);
    const newCols = Math.max(1, Math.min(effCols, r.startCols + dxCols));
    const newHeight = Math.max(MIN_HEIGHT, Math.round(e.clientY - r.itemTop));
    const sizes = { ...layout.sizes, [r.id]: { colSpan: newCols, height: newHeight } };
    commit({ ...layout, sizes });
  };

  const onResizePointerUp = (e: React.PointerEvent) => {
    if (resizeRef.current) (e.target as Element).releasePointerCapture?.(e.pointerId);
    resizeRef.current = null;
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      {editable && isCustomized && (
        <button
          type="button"
          className="aiobs-tile-reset"
          onClick={() => setStored(null)}
          title="Reset this section's layout"
        >
          ⟲ Reset layout
        </button>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${effCols}, minmax(0, 1fr))`,
          gridAutoFlow: "row dense",
          gap: GAP,
          alignItems: "stretch",
        }}
      >
        {orderedTiles.map((t) => {
          const size = layout.sizes[t.id] ?? { colSpan: t.defaultColSpan, height: t.defaultHeight ?? null };
          const span = Math.max(1, Math.min(effCols, size.colSpan));
          return (
            <GridItem
              key={t.id}
              span={span}
              height={size.height}
              editable={editable}
              dragging={draggingId === t.id}
              draggable={editable && dragArmedId === t.id}
              onArm={(armed) => setDragArmedId(armed ? t.id : null)}
              onDragStart={() => setDraggingId(t.id)}
              onDragEnd={() => {
                setDraggingId(null);
                setDragArmedId(null);
              }}
              onDragEnterTile={() => draggingId && reorder(draggingId, t.id)}
              onResizeStart={(e, el) => onResizePointerDown(e, t.id, el)}
              onResizeMove={onResizePointerMove}
              onResizeEnd={onResizePointerUp}
            >
              {t.node}
            </GridItem>
          );
        })}
      </div>
    </div>
  );
};

const GridItem = ({
  span,
  height,
  editable,
  dragging,
  draggable,
  onArm,
  onDragStart,
  onDragEnd,
  onDragEnterTile,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
  children,
}: {
  span: number;
  height: number | null;
  editable: boolean;
  dragging: boolean;
  draggable: boolean;
  onArm: (armed: boolean) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragEnterTile: () => void;
  onResizeStart: (e: React.PointerEvent, el: HTMLElement | null) => void;
  onResizeMove: (e: React.PointerEvent) => void;
  onResizeEnd: (e: React.PointerEvent) => void;
  children: React.ReactNode;
}) => {
  const elRef = useRef<HTMLDivElement | null>(null);
  return (
    <div
      ref={elRef}
      className="aiobs-tile-item"
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={onDragEnterTile}
      style={{
        gridColumn: `span ${span}`,
        height: height ?? undefined,
        minWidth: 0,
        position: "relative",
        // Overflow stays visible so the card's raised shadow isn't clipped; the
        // card itself clips its content (SummaryCard sets overflow:hidden), so
        // a shrunk tile never spills onto its neighbour.
        opacity: dragging ? 0.5 : 1,
      }}
    >
      {editable && <DragStrip onArm={onArm} />}
      {children}
      {editable && (
        <div
          className="aiobs-tile-resize"
          title="Drag to resize"
          onPointerDown={(e) => onResizeStart(e, elRef.current)}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeEnd}
          aria-hidden
        >
          <svg width={12} height={12} viewBox="0 0 12 12" fill="none">
            <path d="M11 4L4 11M11 8L8 11" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
          </svg>
        </div>
      )}
    </div>
  );
};
