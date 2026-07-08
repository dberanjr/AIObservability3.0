import React, { useMemo, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Modal } from "@dynatrace/strato-components/overlays";
import { Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { Checkbox } from "@dynatrace/strato-components/forms";
import { Skeleton } from "@dynatrace/strato-components/content";
import {
  ServicesIcon,
  AgentIcon,
  AIModelIcon,
  SettingIcon,
  ConnectorIcon,
  ZoomInIcon,
  ZoomOutIcon,
  ZoomToFitIcon,
  MaximizeIcon,
  ImageIcon,
} from "@dynatrace/strato-icons";
import { fmtTokens, fmtMs, fmtCount } from "../../data/format";
import { costOf } from "../../data/pricing";
import { fmtCentsCost } from "./promptCells";
import {
  spanCategory,
  CAT_COLOR,
  type SpanCategory,
  type IndicatorState,
} from "./TraceTree";
import { handleRadioGroupKeyDown, radioTabIndex } from "./radioNav";
import type { TraceSpan } from "./useTraceSpans";

/**
 * Miniature Smartscape-style dependency graph of a trace. Spans collapse into
 * component nodes (entry agent/workflow → tool/task → LLM → downstream client
 * calls); edges are the parent→child call relationships, laid out in tiers by
 * BFS depth from the entry. Controls: category visibility, size-by metric,
 * zoom (buttons + wheel), copy-as-PNG, and maximize into a modal.
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
  isError: boolean;
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
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3;
const clampZoom = (z: number) =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100));

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

interface TraceTotals {
  inTok: number;
  outTok: number;
  cost: number; // cents
  durationMs: number; // wall-clock
}
interface Layout {
  nodes: TopoNode[];
  edges: TopoEdge[];
  width: number;
  height: number;
  totals: TraceTotals;
  /** Keys of the node(s) containing the true trace root (null parent / isRoot).
   *  Only these display trace-wide totals; every other node shows its own. */
  rootKeys: Set<string>;
}

/** Trace-wide totals (all spans, regardless of category filter). Duration is
 *  the wall-clock span of the trace, not a sum (which would double-count). */
const traceTotals = (spans: TraceSpan[]): TraceTotals => {
  let inTok = 0;
  let outTok = 0;
  let cost = 0;
  let minStart = Infinity;
  let maxEnd = -Infinity;
  for (const s of spans) {
    inTok += s.inTokens;
    outTok += s.outTokens;
    cost +=
      (s.inTokens > 0 ? costOf(s.inTokens, 0, s.model) : 0) +
      (s.outTokens > 0 ? costOf(0, s.outTokens, s.model) : 0);
    if (s.timestampMs < minStart) minStart = s.timestampMs;
    const end = s.timestampMs + Math.max(0, s.durationMs);
    if (end > maxEnd) maxEnd = end;
  }
  return {
    inTok,
    outTok,
    cost,
    durationMs: spans.length ? Math.max(0, maxEnd - minStart) : 0,
  };
};

export const buildLayout = (
  spans: TraceSpan[],
  indicators: IndicatorState,
  sizeBy: SizeBy,
): Layout => {
  const byId = new Map(spans.map((s) => [s.spanId, s]));
  const visible = (s: TraceSpan) => indicators[spanCategory(s)];
  const nearestVisibleAncestor = (s: TraceSpan): string | null => {
    let p = s.parentSpanId;
    // Guard against cyclic / self-referential parent pointers (malformed
    // instrumentation): walk up at most once per span id.
    const seen = new Set<string>();
    while (p && !seen.has(p)) {
      seen.add(p);
      const ps = byId.get(p);
      if (!ps) return null;
      if (visible(ps)) return ps.spanId;
      p = ps.parentSpanId;
    }
    return null;
  };

  const keyOf = new Map<string, string>();
  const nodes = new Map<string, NodeAgg>();
  // Keys of nodes containing the trace's true root span (null parent OR
  // isRoot). Only these show trace-wide totals in the render layer.
  const rootKeys = new Set<string>();
  for (const s of spans) {
    if (!visible(s)) continue;
    const n = nodeOf(s);
    keyOf.set(s.spanId, n.key);
    const isRoot = s.parentSpanId == null || s.isRoot === true;
    if (isRoot) rootKeys.add(n.key);
    const cost =
      (s.inTokens > 0 ? costOf(s.inTokens, 0, s.model) : 0) +
      (s.outTokens > 0 ? costOf(0, s.outTokens, s.model) : 0);
    const agg = nodes.get(n.key);
    if (agg) {
      agg.count += 1;
      agg.inTok += s.inTokens;
      agg.outTok += s.outTokens;
      agg.durationMs += s.durationMs;
      agg.cost += cost;
      agg.isError = agg.isError || s.isError === true;
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
        isError: s.isError === true,
      });
    }
  }

  // Build the edge set FIRST. An edge parentKey→childKey is created for every
  // span whose nearest visible ancestor resolves to a different node (self-
  // loops skipped). Spans that are genuine data-orphans (parentSpanId doesn't
  // resolve to a fetched span) contribute no incoming edge for their node.
  const edgeSet = new Set<string>();
  const adj = new Map<string, Set<string>>();
  const hasIncoming = new Set<string>();
  for (const s of spans) {
    if (!visible(s)) continue;
    const childKey = keyOf.get(s.spanId)!;
    const ancId = nearestVisibleAncestor(s);
    if (!ancId) continue; // orphan span: no edge into its node from here
    const parentKey = keyOf.get(ancId)!;
    if (parentKey === childKey) continue; // self-loop (recursion within a node)
    const id = `${parentKey}__${childKey}`;
    if (!edgeSet.has(id)) {
      edgeSet.add(id);
      if (!adj.has(parentKey)) adj.set(parentKey, new Set());
      adj.get(parentKey)!.add(childKey);
    }
    hasIncoming.add(childKey);
  }
  const edges: TopoEdge[] = Array.from(edgeSet).map((id) => {
    const [from, to] = id.split("__");
    return { from, to };
  });

  // A node is an ENTRY iff it has no incoming edge. This is the fix: a node
  // that is reached by some edge (e.g. tools.task → search_aims_issues) is NOT
  // an entry even if some of its grouped spans are orphans — so it gets a
  // proper downstream depth instead of being seeded at the far-left tier.
  for (const [key, n] of nodes) {
    n.isEntry = !hasIncoming.has(key);
  }

  // Tier each node by its distance from an entry via plain BFS. Each node is
  // assigned a depth exactly once (the first time it's reached) and never
  // re-enqueued — so this terminates even when the aggregated node graph has
  // cycles. Recursive agent/MCP traces (e.g. mcp.server → tool → mcp.server)
  // collapse to cyclic node graphs; a longest-path relaxation here would loop
  // forever and freeze the tab.
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
      if (!depth.has(next)) {
        depth.set(next, d + 1);
        queue.push(next);
      }
    }
  }

  const maxMetric = Math.max(
    1,
    ...Array.from(nodes.values(), (n) => metricOf(n, sizeBy)),
  );
  const radiusOf = (n: NodeAgg): number => {
    if (sizeBy === "none") return n.isEntry ? ENTRY_R : R;
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
  return { nodes: out, edges, width, height, totals: traceTotals(spans), rootKeys };
};

const edgePath = (x1: number, y1: number, x2: number, y2: number): string => {
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
};

/**
 * Pick a distinct icon per node type: agent, LLM, tool, MCP server (detected by
 * an "mcp" hint in the label/service), and generic service spans.
 */
const iconForNode = (
  label: string,
  category: SpanCategory,
): typeof ServicesIcon => {
  if (/\bmcp\b|mcp[-_.]|[-_.]mcp/i.test(label)) return ConnectorIcon;
  if (category === "agent") return AgentIcon;
  if (category === "llm") return AIModelIcon;
  if (category === "tool") return SettingIcon;
  return ServicesIcon;
};

const sublabel = (n: TopoNode, by: SizeBy): string => {
  if (by === "inTok") return `${fmtTokens(n.inTok)} in`;
  if (by === "outTok") return `${fmtTokens(n.outTok)} out`;
  if (by === "duration") return fmtMs(n.durationMs);
  if (by === "cost") return fmtCentsCost(n.cost);
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

// ---- PNG export ----------------------------------------------------------
const resolveVar = (v: string): string => {
  const m = /var\((--[A-Za-z0-9-]+)\)/.exec(v);
  if (!m) return v;
  const val = getComputedStyle(document.documentElement)
    .getPropertyValue(m[1])
    .trim();
  return val || "#888888";
};
const escapeXml = (s: string): string =>
  s.replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;",
  );
const trunc = (s: string, n: number): string =>
  s.length > n ? `${s.slice(0, n - 1)}…` : s;

/** Standalone SVG (literal colors) of the graph, for rasterizing to PNG. */
const buildExportSvg = (layout: Layout, by: SizeBy): string => {
  const surface = resolveVar("var(--surface)");
  const border = resolveVar("var(--border)");
  const textc = resolveVar("var(--text)");
  const text3 = resolveVar("var(--text-3)");
  const blue = resolveVar("var(--blue)");
  const red = resolveVar("var(--red)");
  const byKey = new Map(layout.nodes.map((n) => [n.key, n]));
  const W = layout.width;
  const H = layout.height;
  const p: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="-apple-system,Segoe UI,Roboto,sans-serif">`,
    `<rect x="0" y="0" width="${W}" height="${H}" fill="${surface}"/>`,
  ];
  for (const e of layout.edges) {
    const a = byKey.get(e.from);
    const b = byKey.get(e.to);
    if (!a || !b) continue;
    const stroke = a.isEntry ? blue : border;
    p.push(
      `<path d="${edgePath(a.x + a.r, a.y, b.x - b.r, b.y)}" fill="none" stroke="${stroke}" stroke-width="${a.isEntry ? 2.5 : 1.5}"/>`,
    );
  }
  for (const n of layout.nodes) {
    const color = resolveVar(CAT_COLOR[n.category]);
    const stroke = n.isError ? red : color;
    p.push(
      `<circle cx="${n.x}" cy="${n.y}" r="${n.r}" fill="${surface}" stroke="${stroke}" stroke-width="${n.isEntry || n.isError ? 3 : 2}"/>`,
    );
    // 3-cube cluster glyph
    const s = Math.max(5, n.r * 0.34);
    const sq = (x: number, y: number) =>
      `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="1.5" fill="${color}"/>`;
    p.push(sq(n.x - s / 2, n.y - s - 1));
    p.push(sq(n.x - s - 1, n.y + 1));
    p.push(sq(n.x + 1, n.y + 1));
    p.push(
      `<text x="${n.x}" y="${n.y + n.r + 15}" text-anchor="middle" font-size="11" font-weight="600" fill="${textc}">${escapeXml(trunc(n.label, 24))}</text>`,
    );
    if (layout.rootKeys.has(n.key)) {
      const t = layout.totals;
      p.push(
        `<text x="${n.x}" y="${n.y + n.r + 28}" text-anchor="middle" font-size="10" font-weight="600" fill="${textc}">${escapeXml(`${fmtMs(t.durationMs)} · ${fmtCentsCost(t.cost)}`)}</text>`,
      );
      p.push(
        `<text x="${n.x}" y="${n.y + n.r + 40}" text-anchor="middle" font-size="10" fill="${text3}">${escapeXml(`${fmtTokens(t.inTok)} in · ${fmtTokens(t.outTok)} out`)}</text>`,
      );
    } else {
      p.push(
        `<text x="${n.x}" y="${n.y + n.r + 28}" text-anchor="middle" font-size="10" fill="${text3}">${escapeXml(sublabel(n, by))}</text>`,
      );
    }
  }
  p.push("</svg>");
  return p.join("");
};

const iconBtnStyle: React.CSSProperties = {
  all: "unset",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 26,
  height: 26,
  borderRadius: 6,
  color: "var(--text-2)",
};

/** The scrollable, zoomable graph canvas with its overlay toolbar. */
const TopologyGraph = ({
  layout,
  sizeBy,
  height,
  onMaximize,
}: {
  layout: Layout;
  sizeBy: SizeBy;
  height: number;
  onMaximize?: () => void;
}) => {
  const [zoom, setZoom] = useState(1);
  const [pngState, setPngState] = useState<"idle" | "copied" | "saved">("idle");

  const byKey = useMemo(
    () => new Map(layout.nodes.map((n) => [n.key, n])),
    [layout],
  );

  const copyPng = async () => {
    try {
      // Build a standalone SVG of ONLY the graph (nodes + edges, literal theme
      // colors) and rasterize it. A data-URL (not a blob URL) keeps the image
      // same-origin so the canvas isn't tainted — otherwise toBlob fails and
      // nothing usable reaches the clipboard.
      const svgStr = buildExportSvg(layout, sizeBy);
      const url =
        "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgStr);
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = url;
      });
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = layout.width * scale;
      canvas.height = layout.height * scale;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      const png = await new Promise<Blob | null>((res) =>
        canvas.toBlob(res, "image/png"),
      );
      if (!png) throw new Error("no blob");
      const ClipItem = (window as unknown as { ClipboardItem?: typeof ClipboardItem })
        .ClipboardItem;
      if (navigator.clipboard && "write" in navigator.clipboard && ClipItem) {
        await navigator.clipboard.write([new ClipItem({ "image/png": png })]);
        setPngState("copied");
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(png);
        a.download = "trace-topology.png";
        a.click();
        URL.revokeObjectURL(a.href);
        setPngState("saved");
      }
    } catch {
      setPngState("idle");
    } finally {
      window.setTimeout(() => setPngState("idle"), 1600);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      {/* Overlay toolbar */}
      <Flex
        gap={2}
        alignItems="center"
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          zIndex: 2,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: 2,
          boxShadow: "var(--shadow, 0 2px 8px rgba(0,0,0,0.06))",
        }}
      >
        <button type="button" style={iconBtnStyle} title="Zoom out" onClick={() => setZoom((z) => clampZoom(z * 0.8))}>
          <ZoomOutIcon size={15} />
        </button>
        <button
          type="button"
          style={{ ...iconBtnStyle, width: 42, fontSize: 11, color: "var(--text-3)" }}
          title="Reset zoom"
          onClick={() => setZoom(1)}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" style={iconBtnStyle} title="Zoom in" onClick={() => setZoom((z) => clampZoom(z * 1.25))}>
          <ZoomInIcon size={15} />
        </button>
        <button type="button" style={iconBtnStyle} title="Reset zoom" onClick={() => setZoom(1)}>
          <ZoomToFitIcon size={15} />
        </button>
        <div style={{ width: 1, height: 18, background: "var(--border)", margin: "0 2px" }} />
        <button
          type="button"
          style={{ ...iconBtnStyle, width: pngState === "idle" ? 26 : 64, color: pngState !== "idle" ? "var(--green-2)" : "var(--text-2)", gap: 4 }}
          title="Copy graph as PNG"
          onClick={() => void copyPng()}
        >
          <ImageIcon size={15} />
          {pngState === "copied" ? <span style={{ fontSize: 11 }}>Copied</span> : pngState === "saved" ? <span style={{ fontSize: 11 }}>Saved</span> : null}
        </button>
        {onMaximize && (
          <button type="button" style={iconBtnStyle} title="Maximize" onClick={onMaximize}>
            <MaximizeIcon size={15} />
          </button>
        )}
      </Flex>

      <div style={{ overflow: "auto", maxHeight: height }}>
        {layout.nodes.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center" }}>
            <Text style={{ fontSize: 12, color: "var(--text-3)" }}>
              No spans match the selected categories.
            </Text>
          </div>
        ) : (
          <div style={{ width: layout.width * zoom, height: layout.height * zoom }}>
            <div
              style={{
                position: "relative",
                width: layout.width,
                height: layout.height,
                transform: `scale(${zoom})`,
                transformOrigin: "top left",
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
                      style={{ stroke: a.isEntry ? "var(--blue)" : "var(--border)" }}
                      strokeWidth={a.isEntry ? 2.5 : 1.5}
                      opacity={a.isEntry ? 0.9 : 1}
                    />
                  );
                })}
              </svg>

              {layout.nodes.map((n) => {
                const color = CAT_COLOR[n.category];
                const d = n.r * 2;
                const NodeIcon = iconForNode(n.label, n.category);
                const isRoot = layout.rootKeys.has(n.key);
                // The trace root carries the trace-wide totals; every other
                // node (including any orphan-only entry) shows its own metrics.
                const ringColor = n.isError ? "var(--red)" : color;
                return (
                  <div
                    key={n.key}
                    title={`${n.label}${n.isError ? " · errored" : ""} · ${fmtCount(n.count)} span${n.count === 1 ? "" : "s"} · ${fmtCount(n.inTok)} in / ${fmtCount(n.outTok)} out · ${fmtMs(n.durationMs)} · ${fmtCentsCost(n.cost)}`}
                    aria-label={n.isError ? `${n.label} (errored)` : n.label}
                    style={{ position: "absolute", left: n.x - n.r, top: n.y - n.r, width: d, height: d }}
                  >
                    <div
                      style={{
                        width: d,
                        height: d,
                        borderRadius: "50%",
                        background: "var(--surface)",
                        border: `${n.isEntry || n.isError ? 3 : 2}px solid ${ringColor}`,
                        boxShadow: n.isError
                          ? `0 0 0 4px color-mix(in oklab, var(--red) 22%, transparent)`
                          : n.isEntry
                            ? `0 0 0 4px color-mix(in oklab, ${color} 18%, transparent)`
                            : "var(--shadow, 0 2px 8px rgba(0,0,0,0.06))",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color,
                      }}
                    >
                      <NodeIcon size={Math.max(14, Math.min(26, n.r * 0.7))} />
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
                      {isRoot ? (
                        <>
                          <Text
                            style={{ display: "block", fontSize: 10, fontWeight: 600, color: "var(--text-2)" }}
                          >
                            {`${fmtMs(layout.totals.durationMs)} · ${fmtCentsCost(layout.totals.cost)}`}
                          </Text>
                          <Text style={{ display: "block", fontSize: 10, color: "var(--text-3)" }}>
                            {`${fmtTokens(layout.totals.inTok)} in · ${fmtTokens(layout.totals.outTok)} out`}
                          </Text>
                        </>
                      ) : (
                        <Text
                          style={{
                            display: "block",
                            fontSize: 10,
                            color: sizeBy === "none" ? "var(--text-3)" : "var(--text-2)",
                            fontWeight: sizeBy === "none" ? 400 : 600,
                          }}
                        >
                          {sublabel(n, sizeBy)}
                        </Text>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const fmtMetric = (v: number, by: SizeBy): string =>
  by === "duration" ? fmtMs(v) : by === "cost" ? fmtCentsCost(v) : fmtTokens(v);

/**
 * Quantitative key for the graph (Prompts-13): what the blue entry ring/edges
 * and red error ring mean, plus — when Size-by is active — the magnitude range
 * a circle's size encodes, so a large node has a stated scale.
 */
const TopoLegend = ({ layout, sizeBy }: { layout: Layout; sizeBy: SizeBy }) => {
  const metricLabel =
    SIZE_OPTIONS.find((o) => o.value === sizeBy)?.label ?? "";
  let sizeNote: string | null = null;
  if (sizeBy !== "none") {
    const vals = layout.nodes
      .map((n) => metricOf(n, sizeBy))
      .filter((v) => v > 0);
    if (vals.length) {
      sizeNote = `size ∝ ${metricLabel.toLowerCase()}: ${fmtMetric(
        Math.min(...vals),
        sizeBy,
      )}–${fmtMetric(Math.max(...vals), sizeBy)}`;
    }
  }
  const Ring = ({ color }: { color: string }) => (
    <span
      aria-hidden
      style={{
        width: 11,
        height: 11,
        borderRadius: "50%",
        border: `2px solid ${color}`,
        background: "var(--surface)",
        flex: "0 0 auto",
      }}
    />
  );
  return (
    <Flex
      alignItems="center"
      gap={12}
      flexWrap="wrap"
      style={{ fontSize: 11, color: "var(--text-3)" }}
    >
      <Flex alignItems="center" gap={6}>
        <Ring color="var(--blue)" />
        <Text style={{ fontSize: 11, color: "var(--text-3)" }}>
          trace entry (blue ring &amp; edges)
        </Text>
      </Flex>
      <Flex alignItems="center" gap={6}>
        <Ring color="var(--red)" />
        <Text style={{ fontSize: 11, color: "var(--text-3)" }}>errored node</Text>
      </Flex>
      {sizeNote && (
        <Text style={{ fontSize: 11, color: "var(--text-3)" }}>{sizeNote}</Text>
      )}
    </Flex>
  );
};

const BottomControls = ({
  indicators,
  setIndicators,
  sizeBy,
  setSizeBy,
}: {
  indicators: IndicatorState;
  setIndicators: React.Dispatch<React.SetStateAction<IndicatorState>>;
  sizeBy: SizeBy;
  setSizeBy: (v: SizeBy) => void;
}) => (
  <Flex
    alignItems="center"
    justifyContent="space-between"
    flexWrap="wrap"
    gap={12}
    style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}
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
            style={{ width: 8, height: 8, borderRadius: 2, background: CAT_COLOR[c.key], flex: "0 0 auto" }}
          />
          <Text style={{ fontSize: 12, color: "var(--text)" }}>{c.label}</Text>
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
        onKeyDown={handleRadioGroupKeyDown}
        style={{ display: "inline-flex", padding: 2, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 999 }}
      >
        {SIZE_OPTIONS.map((o) => {
          const active = o.value === sizeBy;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={radioTabIndex(active)}
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
);

export interface TraceTopologyProps {
  spans: TraceSpan[];
  isLoading: boolean;
}

export const TraceTopology = ({ spans, isLoading }: TraceTopologyProps) => {
  const [indicators, setIndicators] = useState<IndicatorState>({
    agent: true,
    llm: true,
    tool: true,
    other: true,
  });
  const [sizeBy, setSizeBy] = useState<SizeBy>("none");
  const [maximized, setMaximized] = useState(false);

  const layout = useMemo(
    () => buildLayout(spans, indicators, sizeBy),
    [spans, indicators, sizeBy],
  );

  if (isLoading) {
    return (
      <Flex flexDirection="column" gap={8} style={{ padding: 12 }}>
        <Skeleton style={{ height: 200, borderRadius: 8 }} />
        <Skeleton style={{ height: 16, width: "40%" }} />
      </Flex>
    );
  }
  if (spans.length === 0) {
    return (
      <div style={{ padding: 12, textAlign: "center" }}>
        <Text style={{ fontSize: 12, color: "var(--text-3)" }}>No spans found in trace</Text>
      </div>
    );
  }

  const controls = (
    <BottomControls
      indicators={indicators}
      setIndicators={setIndicators}
      sizeBy={sizeBy}
      setSizeBy={setSizeBy}
    />
  );

  return (
    <Flex flexDirection="column" gap={12}>
      <TopologyGraph
        layout={layout}
        sizeBy={sizeBy}
        height={440}
        onMaximize={() => setMaximized(true)}
      />
      <TopoLegend layout={layout} sizeBy={sizeBy} />
      {controls}

      <Modal
        show={maximized}
        onDismiss={() => setMaximized(false)}
        size="large"
        title="Trace topology"
        footer={
          <Flex justifyContent="flex-end">
            <Button onClick={() => setMaximized(false)}>Close</Button>
          </Flex>
        }
      >
        <Flex flexDirection="column" gap={12}>
          <TopologyGraph
            layout={layout}
            sizeBy={sizeBy}
            height={Math.round(window.innerHeight * 0.62)}
          />
          <TopoLegend layout={layout} sizeBy={sizeBy} />
          {controls}
        </Flex>
      </Modal>
    </Flex>
  );
};
