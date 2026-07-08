/**
 * Declarative topology for the AI Application Architecture node-map.
 *
 * The STRUCTURE lives here (which tiers exist, how they connect, where they
 * render, where they drill); the LIVE VALUES (counts, status, badges, edge
 * weights) are computed from real gen_ai.* spans in useArchitectureData and
 * merged onto this skeleton at render time. Tier copy/labels come from
 * ai-layer-patterns.ts; lens spotlights derive from architectureLenses.ts —
 * neither is re-authored here.
 *
 * Canonical flow (matches ai-layer-patterns stackPosition):
 *   client → gateway → orchestrator → agent, then the leaf row tools / llm /
 *   vector / memory. A dashed magenta feedback edge runs llm → agent.
 */
import type { LayerKey } from "../../../data/ai-layer-patterns";
import { layerByKey } from "../../../data/ai-layer-patterns";
import type { FrameworkId } from "../../../detection/attributes";
import type { FocusParam } from "../../../lib/nav";
import { USE_CASE_LENSES, type LensId, type UseCaseLens } from "../architectureLenses";

export type NodeCategory = "edge" | "core" | "resource";
export type NodeStatus = "healthy" | "warning" | "critical" | "muted";

/**
 * Telemetry state of a tier:
 *   live     — native gen_ai.* spans present; full metric reading
 *   inferred — no native spans, but a proxy signal exists (e.g. memory inferred
 *              from langgraph_checkpoint_ns); shown dashed with a caveat
 *   none     — an otelGap tier (client/gateway): always shown, never measured
 *   ghost    — a resource tier with no signal at all; faint placeholder
 */
export type NodeState = "live" | "inferred" | "none" | "ghost";

export type Tone = "neutral" | "good" | "warning" | "critical" | "cost";

/**
 * What a clickable marker (badge, edge pill, scope chip, loop pill) opens in the
 * detail modal. Resolved against live data by resolveDetail (see getDetail.ts).
 */
export type DetailSpec =
  | { kind: "finding"; id: string }
  | { kind: "enrich"; layer: LayerKey }
  | { kind: "scope"; which: "services" | "agents" | "tools" | "findings" }
  | { kind: "loop" }
  // One orchestration framework (the split orchestrator tier).
  | { kind: "framework"; id: FrameworkId | "other" }
  // Inter-tier health signals shown as edge pills.
  | { kind: "n1" } // Agent → Tools: N+1 / high-frequency tool calls
  | { kind: "ctx" } // Agent → LLM: oversized prompts / context exhaustion
  | { kind: "recall" }; // Tools → Vector DB: retrieval recall (needs eval)

/** A clickable metric pill on a node. `spec` is what it opens, if anything. */
export interface Badge {
  text: string;
  tone: Tone;
  spec?: DetailSpec;
}

/** Live, per-node view merged onto ArchNodeMeta by useArchitectureData. */
export interface NodeView {
  status: NodeStatus;
  state: NodeState;
  /** Big count-up headline (omitted for none/ghost tiers). */
  headline?: string;
  /** Unit / explainer line under the headline (or the only line for none/ghost). */
  sub: string;
  badges: Badge[];
  /** Number of active findings attributed to this tier. */
  findings: number;
  findingTone?: Tone;
  /** Enrichment nudge label (e.g. "+ propagate thread id"); opens an enrich detail. */
  enrich?: string;
  /** Throughput series for the node sparkline (live tiers; overview/default). */
  series?: number[];
  /** p90 latency series (ms) — shown on the sparkline under the Latency lens. */
  seriesLatency?: number[];
  /** Error-count series — shown on the sparkline under the Errors lens. */
  seriesErrors?: number[];
  /** Token series — shown on the sparkline under the Cost lens (llm only). */
  seriesCost?: number[];
  /** Hover/aria reason for the status glyph. */
  reason: string;
  /**
   * Per-lens re-framing of the tier's primary metric. The active lens swaps the
   * headline/sub/status/badges (cost → $, latency → p90, errors → err rate …).
   * Absent for a lens that doesn't apply to this tier → falls back to base.
   */
  cells: Partial<Record<LensId, LensCell>>;
}

/** A lens-specific view of a tier's headline metric. */
export interface LensCell {
  status: NodeStatus;
  headline?: string;
  sub: string;
  badges: Badge[];
}

/** Resolve the cell to render for a tier under the active lens (or base). */
export const resolveCell = (view: NodeView, lensId: LensId | null): LensCell => {
  if (lensId) {
    const cell = view.cells[lensId];
    if (cell && cell.headline !== undefined) return cell;
    // Lens active but this tier has no numeric reading for it. Keep the base
    // headline (rendered dimmed via the muted status) with the lens caption as
    // the sub-line, instead of dropping the number and falling to prose — so the
    // map stays symmetric under a lens rather than turning text-heavy.
    return {
      status: "muted",
      headline: view.headline,
      sub: cell?.sub ?? view.sub,
      badges: [],
    };
  }
  return { status: view.status, headline: view.headline, sub: view.sub, badges: view.badges };
};

export interface ArchNodeMeta {
  key: LayerKey;
  name: string;
  category: NodeCategory;
  /** Tier always rendered (even ghosted) to keep the request path legible. */
  spine: boolean;
  /** Where a click routes; null = open the inline tier drawer instead. */
  drill: { path: string; focus: FocusParam } | null;
}

export interface ArchEdge {
  from: LayerKey;
  to: LayerKey;
  /** Fallback weight (0–1) when no live volume is available. */
  baseW: number;
}

export const NODE_CATEGORY: Record<LayerKey, NodeCategory> = {
  client: "edge",
  gateway: "edge",
  orchestrator: "core",
  agent: "core",
  tools: "resource",
  llm: "resource",
  vectordb: "resource",
  memory: "resource",
};

/** Drill targets — preserved from the prior map so existing focus params work. */
const DRILL: Record<LayerKey, { path: string; focus: FocusParam } | null> = {
  client: null,
  gateway: null,
  orchestrator: { path: "/agents", focus: "orchestrator" },
  agent: { path: "/agents", focus: "agent" },
  tools: { path: "/agents", focus: "tools" },
  vectordb: { path: "/agents", focus: "vectordb" },
  memory: { path: "/agents", focus: "memory" },
  llm: { path: "/prompts", focus: "llm" },
};

/** Tiers that anchor the request path and are always drawn (never ghosted out). */
const SPINE: ReadonlySet<LayerKey> = new Set<LayerKey>([
  "client",
  "gateway",
  "orchestrator",
  "agent",
  "llm",
]);

const meta = (key: LayerKey): ArchNodeMeta => ({
  key,
  name: layerByKey(key).label,
  category: NODE_CATEGORY[key],
  spine: SPINE.has(key),
  drill: DRILL[key],
});

export const ARCH_NODES: Record<LayerKey, ArchNodeMeta> = {
  client: meta("client"),
  gateway: meta("gateway"),
  orchestrator: meta("orchestrator"),
  agent: meta("agent"),
  tools: meta("tools"),
  llm: meta("llm"),
  vectordb: meta("vectordb"),
  memory: meta("memory"),
};

/**
 * Render layout: single-node rows down the spine, then a 2-column leaf grid so
 * the resource tiers stack — vectordb under tools, memory under llm (the edges
 * tools→vectordb and llm→memory read as clean vertical drops).
 */
export const SPINE_ROWS: LayerKey[] = ["client", "gateway", "orchestrator", "agent"];
export const LEAF_KEYS: LayerKey[] = ["tools", "llm", "vectordb", "memory"];
/** [columnTop, columnBottom] per column — [tools/vectordb], [llm/memory]. */
export const LEAF_GRID: LayerKey[] = ["tools", "llm", "vectordb", "memory"];

export const EDGES: ArchEdge[] = [
  { from: "client", to: "gateway", baseW: 0.22 },
  { from: "gateway", to: "orchestrator", baseW: 0.3 },
  { from: "orchestrator", to: "agent", baseW: 1.0 },
  { from: "agent", to: "tools", baseW: 0.5 },
  { from: "agent", to: "llm", baseW: 0.62 },
  { from: "tools", to: "vectordb", baseW: 0.3 },
  { from: "llm", to: "memory", baseW: 0.22 },
];

/**
 * The feedback / reasoning-loop edge (dashed, magenta) — llm back to the agent.
 * Anchored to the agent tier (the ReAct-style reasoning cycle is the agent
 * re-invoking the LLM); the agent tile also carries the folded-in workflow spans.
 */
export const LOOP = { from: "llm" as LayerKey, to: "agent" as LayerKey };

export const edgeKey = (from: LayerKey, to: LayerKey): string => `${from}-${to}`;

/** Edges to spotlight given a set of emphasized nodes (both ends in the set). */
export const spotlightEdges = (nodes: Set<LayerKey>, includeLoop: boolean): Set<string> => {
  const edges = new Set<string>();
  for (const e of EDGES) {
    if (nodes.has(e.from) && nodes.has(e.to)) edges.add(edgeKey(e.from, e.to));
  }
  if (includeLoop) edges.add("loop");
  return edges;
};

export { USE_CASE_LENSES };
export type { UseCaseLens, LensId };
