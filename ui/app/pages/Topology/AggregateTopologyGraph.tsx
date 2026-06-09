import React, { useMemo, useRef, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { fmtCount, fmtPercent } from "../../data/format";
import {
  TIER_COLOR,
  TIER_ORDER,
  type AggEdge,
  type AggNode,
  type AggTier,
} from "./useAggregateTopology";

export type LayoutMode = "force" | "vertical" | "horizontal";

const VIEW_W = 1600;
const VIEW_H = 1000;

interface Placed {
  node: AggNode;
  x: number;
  y: number;
  r: number;
}

const radiusFor = (calls: number, maxCalls: number): number => {
  if (maxCalls <= 0) return 9;
  const t = Math.log10(calls + 1) / Math.log10(maxCalls + 1);
  return Math.max(7, Math.min(26, 7 + t * 19));
};

const ringColor = (errorRatePct: number): string => {
  if (errorRatePct >= 5) return "var(--red)";
  if (errorRatePct >= 1) return "var(--amber)";
  return "transparent";
};

/** Deterministic 0..1 pseudo-spread from an index (no Math.random — blocked). */
const spread = (i: number): number => {
  const v = Math.sin(i * 12.9898) * 43758.5453;
  return v - Math.floor(v);
};

const layeredPositions = (
  nodes: AggNode[],
  mode: "vertical" | "horizontal",
): Map<string, { x: number; y: number }> => {
  const present = TIER_ORDER.filter((t) => nodes.some((n) => n.tier === t));
  const tierIndex = new Map<AggTier, number>(present.map((t, i) => [t, i]));
  const pos = new Map<string, { x: number; y: number }>();
  const lanePad = 90;
  for (const tier of present) {
    const inTier = nodes
      .filter((n) => n.tier === tier)
      .sort((a, b) => b.calls - a.calls);
    const ti = tierIndex.get(tier) ?? 0;
    const laneGap = (mode === "horizontal" ? VIEW_W : VIEW_H) - lanePad * 2;
    const lanePos = present.length <= 1 ? laneGap / 2 : (ti / (present.length - 1)) * laneGap;
    const lane = lanePad + lanePos;
    const crossSpan = (mode === "horizontal" ? VIEW_H : VIEW_W) - lanePad * 2;
    const step = inTier.length <= 1 ? 0 : crossSpan / (inTier.length - 1);
    const start = inTier.length <= 1 ? crossSpan / 2 : 0;
    inTier.forEach((n, i) => {
      const cross = lanePad + (inTier.length <= 1 ? start : i * step);
      pos.set(n.id, mode === "horizontal" ? { x: lane, y: cross } : { x: cross, y: lane });
    });
  }
  return pos;
};

const forcePositions = (
  nodes: AggNode[],
  edges: AggEdge[],
): Map<string, { x: number; y: number }> => {
  const pos = new Map<string, { x: number; y: number }>();
  const cx = VIEW_W / 2;
  const cy = VIEW_H / 2;
  const present = TIER_ORDER.filter((t) => nodes.some((n) => n.tier === t));
  const tierIndex = new Map<AggTier, number>(present.map((t, i) => [t, i]));
  // Seed by tier column + deterministic vertical spread.
  nodes.forEach((n, i) => {
    const ti = tierIndex.get(n.tier) ?? 0;
    const x = 200 + (present.length <= 1 ? VIEW_W / 2 : (ti / (present.length - 1)) * (VIEW_W - 400));
    const y = 120 + spread(i + 1) * (VIEW_H - 240);
    pos.set(n.id, { x, y });
  });
  const idx = new Map(nodes.map((n, i) => [n.id, i]));
  const ITER = 160;
  const kRep = 4200;
  const kSpring = 0.012;
  const kGrav = 0.015;
  for (let it = 0; it < ITER; it += 1) {
    const fx = new Float64Array(nodes.length);
    const fy = new Float64Array(nodes.length);
    for (let a = 0; a < nodes.length; a += 1) {
      const pa = pos.get(nodes[a].id)!;
      for (let b = a + 1; b < nodes.length; b += 1) {
        const pb = pos.get(nodes[b].id)!;
        let dx = pa.x - pb.x;
        let dy = pa.y - pb.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) d2 = 1;
        const f = kRep / d2;
        const d = Math.sqrt(d2);
        dx /= d;
        dy /= d;
        fx[a] += dx * f; fy[a] += dy * f;
        fx[b] -= dx * f; fy[b] -= dy * f;
      }
      fx[a] += (cx - pa.x) * kGrav;
      fy[a] += (cy - pa.y) * kGrav;
    }
    for (const e of edges) {
      const ia = idx.get(e.source);
      const ib = idx.get(e.target);
      if (ia == null || ib == null) continue;
      const pa = pos.get(e.source)!;
      const pb = pos.get(e.target)!;
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      fx[ia] += dx * kSpring; fy[ia] += dy * kSpring;
      fx[ib] -= dx * kSpring; fy[ib] -= dy * kSpring;
    }
    const damp = 0.85;
    for (let a = 0; a < nodes.length; a += 1) {
      const p = pos.get(nodes[a].id)!;
      p.x = Math.max(40, Math.min(VIEW_W - 40, p.x + Math.max(-30, Math.min(30, fx[a] * damp))));
      p.y = Math.max(40, Math.min(VIEW_H - 40, p.y + Math.max(-30, Math.min(30, fy[a] * damp))));
    }
  }
  return pos;
};

export interface AggregateTopologyGraphProps {
  nodes: AggNode[];
  edges: AggEdge[];
  maxCalls: number;
  layout: LayoutMode;
  search: string;
  hiddenTiers: Set<AggTier>;
  onSelectNode?: (node: AggNode) => void;
  selectedId?: string | null;
  /** When set, render only this node and its direct neighbors. */
  isolateId?: string | null;
  /** Node IDs with an active Davis problem (red dashed ring). */
  affectedNodeIds?: Set<string>;
  height?: number;
}

export const AggregateTopologyGraph = ({
  nodes,
  edges,
  maxCalls,
  layout,
  search,
  hiddenTiers,
  onSelectNode,
  selectedId,
  isolateId,
  affectedNodeIds,
  height = 680,
}: AggregateTopologyGraphProps) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [view, setView] = useState({ k: 1, tx: 0, ty: 0 });
  const [hover, setHover] = useState<string | null>(null);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  const tierNodes = useMemo(
    () => nodes.filter((n) => !hiddenTiers.has(n.tier)),
    [nodes, hiddenTiers],
  );
  // Isolate mode: keep the focus node + its direct neighbors only.
  const visibleNodes = useMemo(() => {
    if (!isolateId) return tierNodes;
    const keep = new Set<string>([isolateId]);
    for (const e of edges) {
      if (e.source === isolateId) keep.add(e.target);
      if (e.target === isolateId) keep.add(e.source);
    }
    return tierNodes.filter((n) => keep.has(n.id));
  }, [tierNodes, edges, isolateId]);
  const visibleIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes]);
  const visibleEdges = useMemo(
    () => edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target)),
    [edges, visibleIds],
  );

  const positions = useMemo(() => {
    if (layout === "force") return forcePositions(visibleNodes, visibleEdges);
    return layeredPositions(visibleNodes, layout);
  }, [visibleNodes, visibleEdges, layout]);

  const placed = useMemo<Placed[]>(
    () =>
      visibleNodes.map((node) => {
        const p = positions.get(node.id) ?? { x: VIEW_W / 2, y: VIEW_H / 2 };
        return { node, x: p.x, y: p.y, r: radiusFor(node.calls, maxCalls) };
      }),
    [visibleNodes, positions, maxCalls],
  );
  const placedById = useMemo(() => new Map(placed.map((p) => [p.node.id, p])), [placed]);

  const term = search.trim().toLowerCase();
  const neighborIds = useMemo(() => {
    if (!hover && !selectedId) return null;
    const focus = hover ?? selectedId!;
    const set = new Set<string>([focus]);
    for (const e of visibleEdges) {
      if (e.source === focus) set.add(e.target);
      if (e.target === focus) set.add(e.source);
    }
    return set;
  }, [hover, selectedId, visibleEdges]);

  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setView((v) => ({ ...v, k: Math.max(0.3, Math.min(4, v.k * factor)) }));
  };
  const onMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    dragRef.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
  };
  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    setView((v) => ({ ...v, tx: dragRef.current!.tx + dx, ty: dragRef.current!.ty + dy }));
  };
  const endDrag = () => {
    dragRef.current = null;
  };
  const resetView = () => setView({ k: 1, tx: 0, ty: 0 });

  // Rasterize the SVG to a PNG download. CSS vars don't survive serialization,
  // so resolve the ones we use to literal values first.
  const exportPng = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const cs = getComputedStyle(document.documentElement);
    const resolve = (v: string): string => (cs.getPropertyValue(v) || "").trim() || "#888888";
    const vars = [
      "--blue", "--purple-2", "--cyan", "--green-2", "--amber",
      "--text-2", "--text-3", "--text-4", "--red", "--surface", "--border",
    ];
    let svgStr = new XMLSerializer().serializeToString(svg);
    for (const v of vars) svgStr = svgStr.split(`var(${v})`).join(resolve(v));
    const surface = resolve("--surface");
    const url = URL.createObjectURL(new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = VIEW_W * scale;
      canvas.height = VIEW_H * scale;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = surface;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((b) => {
          if (!b) return;
          const a = document.createElement("a");
          a.href = URL.createObjectURL(b);
          a.download = "ai-topology.png";
          a.click();
          URL.revokeObjectURL(a.href);
        });
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const dim = (id: string): boolean => {
    if (term) {
      const n = placedById.get(id)?.node;
      return !(n && n.label.toLowerCase().includes(term));
    }
    if (neighborIds) return !neighborIds.has(id);
    return false;
  };

  const hovered = hover ? placedById.get(hover) : null;

  return (
    <div style={{ position: "relative", width: "100%", height, overflow: "hidden", borderRadius: 10, background: "var(--surface)" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={() => { endDrag(); setHover(null); }}
        style={{ width: "100%", height: "100%", cursor: dragRef.current ? "grabbing" : "grab", display: "block" }}
      >
        <g transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
          {visibleEdges.map((e) => {
            const a = placedById.get(e.source);
            const b = placedById.get(e.target);
            if (!a || !b) return null;
            const faded = dim(e.source) || dim(e.target);
            const mx = (a.x + b.x) / 2;
            return (
              <path
                key={e.id}
                d={`M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`}
                fill="none"
                stroke="var(--border)"
                strokeWidth={Math.max(0.5, Math.min(4, Math.log10(e.calls + 1)))}
                opacity={faded ? 0.06 : 0.5}
              />
            );
          })}
          {placed.map((p) => {
            const faded = dim(p.node.id);
            const ring = ringColor(p.node.errorRatePct);
            const isSel = p.node.id === selectedId;
            return (
              <g
                key={p.node.id}
                transform={`translate(${p.x} ${p.y})`}
                opacity={faded ? 0.2 : 1}
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHover(p.node.id)}
                onClick={(ev) => { ev.stopPropagation(); onSelectNode?.(p.node); }}
              >
                {affectedNodeIds?.has(p.node.id) && (
                  <circle r={p.r + 6} fill="none" stroke="var(--red)" strokeWidth={2} strokeDasharray="3 3" />
                )}
                {ring !== "transparent" && (
                  <circle r={p.r + 3} fill="none" stroke={ring} strokeWidth={2} />
                )}
                {isSel && <circle r={p.r + 5} fill="none" stroke="var(--blue)" strokeWidth={2} />}
                <circle r={p.r} fill={TIER_COLOR[p.node.tier]} fillOpacity={0.85} stroke="var(--surface)" strokeWidth={1.5} />
                {(p.r >= 12 || p.node.id === hover) && (
                  <text
                    y={p.r + 12}
                    textAnchor="middle"
                    style={{ fontSize: 10, fill: "var(--text-2)", pointerEvents: "none" }}
                  >
                    {p.node.label.length > 22 ? `${p.node.label.slice(0, 21)}…` : p.node.label}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* zoom controls */}
      <Flex gap={4} style={{ position: "absolute", bottom: 10, right: 10 }}>
        {[["+", () => setView((v) => ({ ...v, k: Math.min(4, v.k * 1.2) }))],
          ["−", () => setView((v) => ({ ...v, k: Math.max(0.3, v.k / 1.2) }))],
          ["⤢", resetView],
          ["⤓", exportPng]].map(([lbl, fn]) => (
          <button
            key={lbl as string}
            type="button"
            onClick={fn as () => void}
            style={{ all: "unset", cursor: "pointer", width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, background: "var(--surface-2)", border: "1px solid var(--border)", fontSize: 14, color: "var(--text-2)" }}
          >
            {lbl as string}
          </button>
        ))}
      </Flex>

      {/* hover tooltip */}
      {hovered && (
        <div style={{ position: "absolute", top: 10, left: 10, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", maxWidth: 280, pointerEvents: "none" }}>
          <Text style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{hovered.node.label}</Text>
          <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
            {hovered.node.tier} · {fmtCount(hovered.node.calls)} calls
            {hovered.node.calls > 0 && ` · ${fmtPercent(hovered.node.errorRatePct, 1)} err`}
          </Text>
        </div>
      )}
    </div>
  );
};
