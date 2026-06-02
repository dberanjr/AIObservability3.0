import React, { useMemo, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Checkbox } from "@dynatrace/strato-components/forms";
import { ServicesIcon } from "@dynatrace/strato-icons";
import { fmtTokens, fmtMs } from "../../data/format";
import { getPricing, estimateCost } from "../../data/pricing";
import {
  spanCategory,
  CAT_COLOR,
  type SpanCategory,
  type IndicatorState,
} from "./TraceTree";
import type { TraceSpan } from "./useTraceSpans";

/**
 * Miniature Smartscape-style dependency graph of a trace. Spans collapse into
 * component nodes (entry agent/workflow → tool/task → LLM → downstream client
 * calls); edges are the parent→child call relationships, laid out in tiers by
 * BFS depth from the entry. Bottom controls let the user choose which span
 * categories to show (incl. all other service spans) and size the nodes by a
 * metric (in/out tokens, duration, or cost).
 */

type SizeBy = "none" | "inTok" | "outTok" | "duration" | "cost";

interface NodeAgg {
  label: string;
  category: SpanCategory;
  count: number;
  inTok: number;
  outTok: number;
  durationMs: number;
  cost: number; // cents
  isEntry: boolean;
}
interface TopoNode extends NodeAgg {
  key: string;
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
const R = 26;
const ENTRY_R = 34;
const R_MIN = 16;
const R_MAX = 46;

const metricOf = (n: NodeAgg, by: SizeBy): number =>
  by === "inTok"
    ? n.inTok
    : by === "outTok"
      ? n.outTok
      : by === "duration"
        ? n.durationMs
        : by === "cost"
          ? n.cost
          : 0;

interface Layout {
  nodes: TopoNode[];
  edges: TopoEdge[];
  width: number;
  height: number;
}

const buildLayout = (
  spans: TraceSpan[],
  indicators: IndicatorState,
  sizeBy: SizeBy,
): Layout => {
  const byId = new Map(spans.map((s) => [s.spanId, s]));
  const visible = (s: TraceSpan) => indicators[spanCategory(s)];
  const nearestVisibleAncestor = (s: TraceSpan): string | null => {
    let p = s.parentSpanId;
    while (p) {
      const ps = byId.get(p);
      if (!ps) return null;
      if (visible(ps)) return ps.spanId;
      p = ps.parentSpanId;
    }
    return null;
  };

  const keyOf = new Map<string, string>();
  const nodes = new Map<string, NodeAgg>();
  for (const s of spans) {
    if (!visible(s)) continue;
    const n = nodeOf(s);
    keyOf.set(s.spanId, n.key);
    const pricing = getPricing(s.model);
    const cost =
      (s.inTokens > 0 ? estimateCost(s.inTokens, 0, pricing) : 0) +
      (s.outTokens > 0 ? estimateCost(0, s.outTokens, pricing) : 0);
    const agg = nodes.get(n.key);
    if (agg) {
      agg.count += 1;
      agg.inTok += s.inTokens;
      agg.outTok += s.outTokens;
      agg.durationMs += s.durationMs;
      agg.cost += cost;
    } else {
      nodes.set(n.key, {
        label: n.label,
        category: n.category,
        count: 1,
        inTok: s.inTokens,
        outTok: s.outTokens,
        durationMs: s.durationMs,
        cost,
        isEntry: false,
      });
    }
  }

  const edgeSet = new Set<string>();
  const adj = new Map<string, Set<string>>();
  for (const s of spans) {
    if (!visible(s)) continue;
    const childKey = keyOf.get(s.spanId)!;
    const ancId = nearestVisibleAncestor(s);
    if (!ancId) {
      const n = nodes.get(childKey);
      if (n) n.isEntry = true;
      continue;
    }
    const parentKey = keyOf.get(ancId)!;
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

  // BFS (longest-path) depth from entry so callees sit right of their callers.
  const depth = new Map<string, number>();
  const queue: string[] = [];
  for (const [key, n] of nodes) {
    if (n.isEntry) {
      depth.set(key, 0);
      queue.push(key);
    }
  }
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
        depth.set(next, d + 1);
        queue.push(next);
      }
    }
  }

  // Node radii.
  const maxMetric = Math.max(
    1,
    ...Array.from(nodes.values(), (n) => metricOf(n, sizeBy)),
  );
  const radiusOf = (n: NodeAgg): number => {
    if (sizeBy === "none") return n.isEntry ? ENTRY_R : R;
    // sqrt so the *area* scales with the metric (perceptually fairer).
    return R_MIN + (R_MAX - R_MIN) * Math.sqrt(metricOf(n, sizeBy) / maxMetric);
  };
  const radii = new Map<string, number>();
  for (const [key, n] of nodes) radii.set(key, radiusOf(n));
  const maxR = Math.max(ENTRY_R, ...Array.from(radii.values()));

  const COL = Math.max(180, maxR * 2 + 120);
  const ROW = Math.max(104, maxR * 2 + 48);

  const byDepth = new Map<number, string[]>();
  for (const key of nodes.keys()) {
    const d = depth.get(key) ?? 0;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(key);
  }
  const maxRows = Math.max(...Array.from(byDepth.values(), (c) => c.length), 1);
  const maxDepth = Math.max(...Array.from(byDepth.keys()), 0);
  const height = PAD * 2 + maxRows * ROW;
  const width = PAD * 2 + maxDepth * COL + maxR * 2;
  const centerY = height / 2;

  const out: TopoNode[] = [];
  for (const [d, keys] of byDepth) {
    keys.sort();
    keys.forEach((key, i) => {
      const n = nodes.get(key)!;
      out.push({
        ...n,
        key,
        depth: d,
        x: PAD + maxR + d * COL,
        y: centerY + (i - (keys.length - 1) / 2) * ROW,
        r: radii.get(key)!,
      });
    });
  }
  return { nodes: out, edges, width, height };
};

const edgePath = (x1: number, y1: number, x2: number, y2: number): string => {
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
};

const fmtCost = (cents: number): string =>
  cents > 0 ? `$${(cents / 100).toFixed(5)}` : "$0";

const sublabel = (n: TopoNode, by: SizeBy): string => {
  if (by === "inTok") return `${fmtTokens(n.inTok)} in`;
  if (by === "outTok") return `${fmtTokens(n.outTok)} out`;
  if (by === "duration") return fmtMs(n.durationMs);
  if (by === "cost") return fmtCost(n.cost);
  return n.count > 1 ? `${n.category} · ${n.count}` : n.category;
};

const SIZE_OPTIONS: { value: SizeBy; label: string }[] = [
  { value: "none", label: "Uniform" },
  { value: "inTok", label: "In tokens" },
  { value: "outTok", label: "Out tokens" },
  { value: "duration", label: "Duration" },
  { value: "cost", label: "Cost" },
];
const CAT_TOGGLES: { key: keyof IndicatorState; label: string }[] = [
  { key: "agent", label: "Agent calls" },
  { key: "llm", label: "LLM calls" },
  { key: "tool", label: "Tool calls" },
  { key: "other", label: "All other service spans" },
];

export interface TraceTopologyProps {
  spans: TraceSpan[];
  isLoading: boolean;
}

export const TraceTopology = ({ spans, isLoading }: TraceTopologyProps) => {
  const [indicators, setIndicators] = useState<IndicatorState>({
    agent: true,
    llm: true,
    tool: true,
    other: false,
  });
  const [sizeBy, setSizeBy] = useState<SizeBy>("none");

  const layout = useMemo(
    () => buildLayout(spans, indicators, sizeBy),
    [spans, indicators, sizeBy],
  );

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
    <Flex flexDirection="column" gap={12}>
      <div style={{ overflow: "auto", maxHeight: 460 }}>
        {layout.nodes.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center" }}>
            <Text style={{ fontSize: 12, color: "var(--text-3)" }}>
              No spans match the selected categories.
            </Text>
          </div>
        ) : (
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
                return (
                  <path
                    key={`${e.from}->${e.to}`}
                    d={edgePath(a.x + a.r, a.y, b.x - b.r, b.y)}
                    fill="none"
                    stroke={a.isEntry ? "var(--blue)" : "var(--border)"}
                    strokeWidth={a.isEntry ? 2.5 : 1.5}
                    opacity={a.isEntry ? 0.9 : 1}
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
                  title={`${n.label} · ${n.count} span${n.count === 1 ? "" : "s"} · ${fmtTokens(n.inTok)} in / ${fmtTokens(n.outTok)} out · ${fmtMs(n.durationMs)} · ${fmtCost(n.cost)}`}
                  style={{
                    position: "absolute",
                    left: n.x - n.r,
                    top: n.y - n.r,
                    width: d,
                    height: d,
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
                    <ServicesIcon size={Math.max(14, Math.min(26, n.r * 0.7))} />
                  </div>
                  <div
                    style={{
                      position: "absolute",
                      top: d + 4,
                      left: -(180 - d) / 2,
                      width: 180,
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
                    <Text
                      style={{
                        fontSize: 10,
                        color:
                          sizeBy === "none" ? "var(--text-3)" : "var(--text-2)",
                        fontWeight: sizeBy === "none" ? 400 : 600,
                      }}
                    >
                      {sublabel(n, sizeBy)}
                    </Text>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <Flex
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        gap={12}
        style={{
          borderTop: "1px solid var(--border)",
          paddingTop: 10,
        }}
      >
        <Flex alignItems="center" gap={12} flexWrap="wrap">
          {CAT_TOGGLES.map((c) => (
            <Flex key={c.key} alignItems="center" gap={6}>
              <Checkbox
                name={`topo-${c.key}`}
                value={indicators[c.key]}
                onChange={(checked) =>
                  setIndicators((prev) => ({ ...prev, [c.key]: checked }))
                }
                aria-label={c.label}
              />
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: CAT_COLOR[c.key],
                  flex: "0 0 auto",
                }}
              />
              <Text style={{ fontSize: 12, color: "var(--text)" }}>
                {c.label}
              </Text>
            </Flex>
          ))}
        </Flex>
        <Flex alignItems="center" gap={8}>
          <Text
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "var(--text-3)",
            }}
          >
            Size by
          </Text>
          <div
            role="radiogroup"
            aria-label="Size nodes by"
            style={{
              display: "inline-flex",
              padding: 2,
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 999,
            }}
          >
            {SIZE_OPTIONS.map((o) => {
              const active = o.value === sizeBy;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSizeBy(o.value)}
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    padding: "4px 12px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: active ? 600 : 500,
                    color: active ? "var(--text)" : "var(--text-2)",
                    background: active ? "var(--surface)" : "transparent",
                  }}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </Flex>
      </Flex>
    </Flex>
  );
};
