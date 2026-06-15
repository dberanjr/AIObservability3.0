/**
 * Use-case lenses for the Pulse architecture map. Each lens re-frames every tier
 * around one question and spotlights where that signal concentrates. The actual
 * spotlight (which tiers light up) is computed from live data in
 * useArchitectureData; `layers` here is the contributing-tier set used as a
 * fallback and validated by a drift-guard test against ai-layer-patterns.ts.
 */
import type { LayerKey } from "../../data/ai-layer-patterns";

/** Lens identifiers. "overview" is the no-lens default (span counts). */
export type LensId = "cost" | "throughput" | "latency" | "errors" | "loop";

export interface UseCaseLens {
  id: LensId;
  label: string;
  /** Tiers that contribute to this lens (spotlight fallback). */
  layers: LayerKey[];
  /** One-line explanation shown in the lens banner when no finding dominates. */
  hint: string;
}

export const USE_CASE_LENSES: UseCaseLens[] = [
  {
    id: "cost",
    label: "Cost",
    layers: ["llm", "agent", "orchestrator", "vectordb", "memory"],
    hint: "Cost is billed at the LLM boundary but driven upstream — agent scratchpad, RAG over-retrieval, and memory/history bloat.",
  },
  {
    id: "throughput",
    label: "Throughput",
    layers: ["orchestrator", "agent", "tools", "llm"],
    hint: "Where call volume concentrates — the tiers carrying the most spans in the window.",
  },
  {
    id: "latency",
    label: "Latency",
    layers: ["orchestrator", "tools", "llm"],
    hint: "Where time is spent — orchestration wait, tool-call time, and LLM generation.",
  },
  {
    id: "errors",
    label: "Errors",
    layers: ["agent", "tools", "llm"],
    hint: "Where failures surface — span errors, tool / MCP errors, and logical errors (refusals, truncation, 429s).",
  },
  {
    id: "loop",
    label: "Loop",
    layers: ["orchestrator", "agent", "tools"],
    hint: "Reasoning loops live in the orchestrator / agent and show up as repeated steps and tool calls.",
  },
];
