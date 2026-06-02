import React, { useMemo } from "react";
import { Text } from "@dynatrace/strato-components/typography";
import { ServicesIcon } from "@dynatrace/strato-icons";
import { spanCategory, CAT_COLOR, type SpanCategory } from "./TraceTree";
import type { TraceSpan } from "./useTraceSpans";

/**
 * Miniature Smartscape-style dependency graph of a trace. Spans are collapsed
 * into component nodes (entry agent/workflow → tool/task → LLM → downstream
 * client calls); edges are the parent→child call relationships between those
 * components. Nodes are laid out in tiers (BFS depth from the entry) left→right
 * to represent the flow of calls through the AI application.
 */

interface TopoNode {
  key: string;
  label: string;
  category: SpanCategory;
  count: number;
  isEntry: boolean;
  depth: number;
  x: number;
  y: number;
  r: number;
}
interface TopoEdge {
  from: string;
  to: string;
}

const nodeOf = (
  s: TraceSpan,
): { key: string; label: string; category: SpanCategory } => {
  const category = spanCategory(s);
  const label =
    category === "agent"
      ? s.workflow ?? s.tlEntity ?? s.name
      : category === "llm"
        ? s.model ?? s.name
        : category === "tool"
          ? s.tlEntity ?? s.name
          : s.name || s.service;
  return { key: `${category}:${label}`, label, category };
};

const PAD = 36;
const COL = 180;
const ROW = 104;
const R = 26;
const ENTRY_R = 34;

interface Layout {
  nodes: TopoNode[];
  edges: TopoEdge[];
  width: number;
  height: number;
}

const buildLayout = (spans: TraceSpan[]): Layout => {
  const byId = new Map(spans.map((s) => [s.spanId, s]));
  const keyOf = new Map<string, string>(); // spanId -> node key
  const nodes = new Map<
    string,
    { label: string; category: SpanCategory; count: number; isEntry: boolean }
  >();

  for (const s of spans) {
    const n = nodeOf(s);
    keyOf.set(s.spanId, n.key);
    const existing = nodes.get(n.key);
    if (existing) existing.count += 1;
    else
      nodes.set(n.key, {
        label: n.label,
        category: n.category,
        count: 1,
        isEntry: false,
      });
  }

  // Edges from each span's parent component to its own; entry = root spans.
  const edgeSet = new Set<string>();
  const adj = new Map<string, Set<string>>();
  for (const s of spans) {
    const childKey = keyOf.get(s.spanId)!;
    const parent = s.parentSpanId ? byId.get(s.parentSpanId) : undefined;
    if (!parent) {
      const n = nodes.get(childKey);
      if (n) n.isEntry = true;
      continue;
    }
    const parentKey = keyOf.get(parent.spanId)!;
    if (parentKey === childKey) continue;
    const id = `${parentKey}__${childKey}`;
    if (!edgeSet.has(id)) {
      edgeSet.add(id);
      if (!adj.has(parentKey)) adj.set(parentKey, new Set());
      adj.get(parentKey)!.add(childKey);
    }
  }
  const edges: TopoEdge[] = Array.from(edgeSet).map((id) => {
    const [from, to] = id.split("__");
    return { from, to };
  });

  // BFS depth from entry nodes.
  const depth = new Map<string, number>();
  const queue: string[] = [];
  for (const [key, n] of nodes) {
    if (n.isEntry) {
      depth.set(key, 0);
      queue.push(key);
    }
  }
  // If nothing flagged entry (no roots captured), seed with all nodes at 0.
  if (queue.length === 0) {
    for (const key of nodes.keys()) {
      depth.set(key, 0);
      queue.push(key);
    }
  }
  while (queue.length) {
    const k = queue.shift()!;
    const d = depth.get(k)!;
    for (const next of adj.get(k) ?? []) {
      if (!depth.has(next) || depth.get(next)! < d + 1) {
        // longest-path tiering so a callee always sits right of its caller
        depth.set(next, d + 1);
        queue.push(next);
      }
    }
  }

  // Group by depth (column) → assign coordinates.
  const byDepth = new Map<number, string[]>();
  for (const [key] of nodes) {
    const d = depth.get(key) ?? 0;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(key);
  }
  const maxRows = Math.max(...Array.from(byDepth.values(), (c) => c.length), 1);
  const maxDepth = Math.max(...Array.from(byDepth.keys()), 0);
  const height = PAD * 2 + maxRows * ROW;
  const width = PAD * 2 + maxDepth * COL + ENTRY_R * 2;
  const centerY = height / 2;

  const out: TopoNode[] = [];
  for (const [d, keys] of byDepth) {
    keys.sort();
    keys.forEach((key, i) => {
      const n = nodes.get(key)!;
      const x = PAD + ENTRY_R + d * COL;
      const y = centerY + (i - (keys.length - 1) / 2) * ROW;
      out.push({
        key,
        label: n.label,
        category: n.category,
        count: n.count,
        isEntry: n.isEntry,
        depth: d,
        x,
        y,
        r: n.isEntry ? ENTRY_R : R,
      });
    });
  }
  return { nodes: out, edges, width, height };
};

const edgePath = (x1: number, y1: number, x2: number, y2: number): string => {
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
};

export interface TraceTopologyProps {
  spans: TraceSpan[];
  isLoading: boolean;
}

export const TraceTopology = ({ spans, isLoading }: TraceTopologyProps) => {
  const layout = useMemo(() => buildLayout(spans), [spans]);

  if (isLoading) {
    return (
      <div style={{ padding: 12, textAlign: "center" }}>
        <Text style={{ fontSize: 12, color: "var(--text-3)" }}>
          Loading topology…
        </Text>
      </div>
    );
  }
  if (spans.length === 0) {
    return (
      <div style={{ padding: 12, textAlign: "center" }}>
        <Text style={{ fontSize: 12, color: "var(--text-3)" }}>
          No spans found in trace
        </Text>
      </div>
    );
  }

  const byKey = new Map(layout.nodes.map((n) => [n.key, n]));

  return (
    <div style={{ overflow: "auto", maxHeight: 460 }}>
      <div
        style={{
          position: "relative",
          width: layout.width,
          height: layout.height,
          minWidth: "100%",
        }}
      >
        <svg
          width={layout.width}
          height={layout.height}
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        >
          {layout.edges.map((e) => {
            const a = byKey.get(e.from);
            const b = byKey.get(e.to);
            if (!a || !b) return null;
            const fromEntry = a.isEntry;
            return (
              <path
                key={`${e.from}->${e.to}`}
                d={edgePath(a.x + a.r, a.y, b.x - b.r, b.y)}
                fill="none"
                stroke={fromEntry ? "var(--blue)" : "var(--border)"}
                strokeWidth={fromEntry ? 2.5 : 1.5}
                opacity={fromEntry ? 0.9 : 1}
              />
            );
          })}
        </svg>

        {layout.nodes.map((n) => {
          const color = CAT_COLOR[n.category];
          const d = n.r * 2;
          return (
            <div
              key={n.key}
              title={`${n.label} · ${n.count} span${n.count === 1 ? "" : "s"}`}
              style={{
                position: "absolute",
                left: n.x - n.r,
                top: n.y - n.r,
                width: d,
                height: d,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: d,
                  height: d,
                  borderRadius: "50%",
                  background: "var(--surface)",
                  border: `${n.isEntry ? 3 : 2}px solid ${color}`,
                  boxShadow: n.isEntry
                    ? `0 0 0 4px color-mix(in oklab, ${color} 18%, transparent)`
                    : "var(--shadow, 0 2px 8px rgba(0,0,0,0.06))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color,
                }}
              >
                <ServicesIcon size={n.isEntry ? 22 : 18} />
              </div>
              {/* Label below the node */}
              <div
                style={{
                  position: "absolute",
                  top: d + 4,
                  left: -(COL - d) / 2,
                  width: COL,
                  textAlign: "center",
                  pointerEvents: "none",
                }}
              >
                <Text
                  style={{
                    display: "block",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--text)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {n.label}
                </Text>
                <Text style={{ fontSize: 10, color: "var(--text-3)" }}>
                  {n.category}
                  {n.count > 1 ? ` · ${n.count}` : ""}
                </Text>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
