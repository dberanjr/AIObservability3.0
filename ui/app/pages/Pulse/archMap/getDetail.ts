/**
 * Resolves a click "spec" from the map (a finding pill, an enrich chip, a scope
 * chip, or the loop pill) into a ModalDetail for the popup. Unlike the static
 * prototype registry, every value here is built from LIVE data passed in via
 * DetailCtx, so the modal always reflects the current scope.
 */
import type { Finding } from "../../../components/drawers/types";
import type { LayerKey } from "../../../data/ai-layer-patterns";
import { layerByKey } from "../../../data/ai-layer-patterns";
import { fmtCount, fmtMs, fmtPercent, fmtTokens } from "../../../data/format";
import { HIGH_FREQUENCY_TOOL_THRESHOLD } from "../../Agents/constants";
import { encodePromptsFilter, promptsFilterForFinding } from "../../Prompts/findingFilter";
import { seriesForFinding, seriesLabelForFinding, type PulseSeries } from "./usePulseSeries";
import type { EdgeSignals } from "./useArchitectureData";
import { frameworkDetail, type FrameworkNode } from "./frameworkNodes";
import { ARCH_NODES, type DetailSpec } from "./model";

export type { DetailSpec };

export type DetailSeverity = "critical" | "warning" | "good" | "info" | "neutral";

export interface DetailDrill {
  path: string;
  focus?: string;
  label: string;
  /** Extra search params (e.g. the `pf_*` Prompts filter for a finding). */
  params?: Record<string, string>;
}

export interface ModalDetail {
  title: string;
  severity: DetailSeverity;
  scope?: string;
  what?: string;
  why?: string;
  metrics: { k: string; v: string }[];
  /** Metric series for the contributing tier / finding, charted in the modal. */
  series?: number[];
  /** Caption for the series chart (what the metric is). */
  seriesLabel?: string;
  /** Bucket labels (HH:MM) for the chart hover readout. */
  seriesLabels?: string[];
  drill?: DetailDrill;
}

export interface DetailCtx {
  findings: Finding[];
  counts: { services: number | null; agents: number | null; tools: number | null };
  breakdown: { critical: number; warning: number; info: number };
  loopPct: number | null;
  loopEntity: string | null;
  series: PulseSeries;
  edgeSignals: EdgeSignals;
  frameworks: FrameworkNode[];
}

const PATH_LABEL: Record<string, string> = {
  "/agents": "Agents",
  "/prompts": "Prompts",
  "/models": "Models / FinOps",
  "/explorer": "Explorer",
};

const drillForLayer = (layer?: LayerKey): DetailDrill | undefined => {
  if (!layer) return undefined;
  const route = ARCH_NODES[layer]?.drill;
  if (!route) return undefined;
  return { path: route.path, focus: route.focus, label: PATH_LABEL[route.path] ?? "details" };
};

const fromFinding = (f: Finding): ModalDetail => {
  const metrics: { k: string; v: string }[] = [];
  if (f.metric) metrics.push({ k: f.category, v: f.metric });
  if (f.entity) metrics.push({ k: "Entity", v: f.entity });
  // Findings always drill to Prompts, pre-scoped to their contributing spans.
  const params = encodePromptsFilter(promptsFilterForFinding(f));
  return {
    title: f.category,
    severity: f.severity,
    scope: f.layer ? `${layerByKey(f.layer).label} · ${f.entity}` : f.entity,
    what: f.context,
    why: f.detail,
    metrics,
    drill: { path: "/prompts", focus: "llm", label: "Prompts", params },
  };
};

const fromEnrich = (layer: LayerKey): ModalDetail => {
  const l = layerByKey(layer);
  const pat = l.patterns.find((p) => p.tier === "enrichment") ?? l.patterns[0];
  return {
    title: pat.title,
    severity: "info",
    scope: l.label,
    what: pat.detail,
    why: `This tier emits no measurement for ${pat.title.toLowerCase()} today. Enriching its spans turns the pattern from documented to detectable.`,
    metrics: [{ k: "Coverage", v: "0%" }],
    drill: drillForLayer(layer),
  };
};

/** Pick the metric series + caption for the modal chart, when one exists. */
const pickSeries = (
  spec: DetailSpec,
  ctx: DetailCtx,
): { series?: number[]; label?: string } => {
  const tp = ctx.series.throughput;
  const iv = ctx.series.intervalLabel;
  const cap = (metric: string) => (iv ? `${metric} · ${iv}` : metric);
  if (spec.kind === "finding") {
    const f: (Finding & { type?: string }) | undefined = ctx.findings.find(
      (x) => x.id === spec.id,
    );
    if (!f) return {};
    return { series: seriesForFinding(f, ctx.series), label: cap(seriesLabelForFinding(f)) };
  }
  if (spec.kind === "enrich") return { series: tp[spec.layer], label: cap("Span volume") };
  if (spec.kind === "loop") return { series: tp.orchestrator, label: cap("Workflow spans") };
  // No per-framework series is available — the modal renders without a chart.
  if (spec.kind === "framework") return {};
  if (spec.kind === "n1") return { series: tp.tools, label: cap("Tool calls") };
  if (spec.kind === "ctx") return { series: ctx.series.truncation, label: cap("Truncated responses") };
  if (spec.kind === "recall") return { series: tp.tools, label: cap("Tool calls") };
  if (spec.which === "agents") return { series: tp.agent, label: cap("Agent spans") };
  if (spec.which === "tools") return { series: tp.tools, label: cap("Tool calls") };
  return { series: tp.orchestrator, label: cap("Workflow spans") };
};

export const resolveDetail = (spec: DetailSpec, ctx: DetailCtx): ModalDetail | null => {
  const base = resolveBase(spec, ctx);
  if (!base) return null;
  const { series, label } = pickSeries(spec, ctx);
  return { ...base, series, seriesLabel: label, seriesLabels: ctx.series.labels };
};

const resolveBase = (spec: DetailSpec, ctx: DetailCtx): ModalDetail | null => {
  if (spec.kind === "finding") {
    const f = ctx.findings.find((x) => x.id === spec.id);
    return f ? fromFinding(f) : null;
  }

  if (spec.kind === "enrich") return fromEnrich(spec.layer);

  if (spec.kind === "loop") {
    const pct = ctx.loopPct;
    return {
      title: "Reasoning loop",
      severity: pct != null && pct >= 20 ? "critical" : pct != null && pct >= 5 ? "warning" : "neutral",
      scope: "Orchestrator → Agent → LLM",
      what:
        ctx.loopEntity != null
          ? `${ctx.loopEntity} re-enters its plan → act → reflect steps; each pass spawns fresh agent and tool spans and repeats LLM calls.`
          : "Workflows re-enter the same steps; each pass spawns fresh agent and tool spans and repeats LLM calls.",
      why: "Cost and latency compound with every iteration, so an unbounded loop inflates spend and end-to-end time downstream.",
      metrics: pct != null ? [{ k: "Loop rate", v: `${pct.toFixed(0)}%` }] : [],
      drill: { path: "/agents", focus: "orchestrator", label: "Agents" },
    };
  }

  if (spec.kind === "framework") {
    const fw = frameworkDetail(spec.id, ctx.frameworks);
    if (!fw) return null;
    const share = Math.round(fw.share);
    return {
      title: fw.label,
      severity: fw.severity,
      scope: "Orchestration framework",
      what: `${fmtCount(fw.count)} workflow spans · ${share}% of orchestration`,
      why: "Orchestration spans drive the plan → act → reflect loop; this framework's share, error rate, and p90 set the pace and cost of the workflows it runs.",
      metrics: [
        { k: "Workflow spans", v: fmtCount(fw.count) },
        { k: "Error rate", v: fmtPercent(fw.errorRate * 100) },
        { k: "p90 latency", v: fmtMs(fw.p90Ms) },
        { k: "Share", v: `${share}%` },
      ],
      drill: { path: "/agents", focus: "orchestrator", label: "Agents" },
    };
  }

  if (spec.kind === "n1") {
    const n = ctx.edgeSignals.n1Agents;
    return {
      title: "N+1 tool calls",
      severity: "warning",
      scope: "Agent → Tool execution",
      what: "One or more agents call a single tool far more than expected within a trace — the AI analogue of an N+1 query (a tool invoked above the high-frequency threshold).",
      why: "Redundant tool spans add latency and external-API cost without surfacing new information. Batch the inputs or cache results by query to remove the waste.",
      metrics: [
        { k: "Agents with N+1", v: String(n) },
        { k: "Threshold", v: `> ${HIGH_FREQUENCY_TOOL_THRESHOLD} / trace` },
      ],
      drill: { path: "/agents", focus: "tools", label: "Agents" },
    };
  }

  if (spec.kind === "ctx") {
    const t = ctx.edgeSignals.truncCount;
    const avg = ctx.edgeSignals.avgPromptTokens;
    return {
      title: "Oversized prompts / context exhaustion",
      severity: "warning",
      scope: "Agent → LLM provider",
      what: "Large prompts — often the full conversation history re-sent each turn — push calls toward the context limit; some are truncated for length (finish_reason max_tokens / length).",
      why: "Big prompts inflate input-token cost and generation latency, and truncation silently drops grounding context. Summarize history past a few turns and trim tool output.",
      metrics: [
        ...(avg != null ? [{ k: "Avg prompt", v: `${fmtTokens(avg)} tok` }] : []),
        { k: "Context exhausted", v: `×${t.toLocaleString("en-US")}` },
      ],
      drill: {
        path: "/prompts",
        focus: "llm",
        label: "Prompts",
        params: encodePromptsFilter({ onlyTruncated: true }),
      },
    };
  }

  if (spec.kind === "recall") {
    return {
      title: "Low-recall retrieval",
      severity: "info",
      scope: "Tool execution → Vector DB / RAG",
      what: "Retrieval recall and hallucination can't be measured here — no RAG evaluator emits gen_ai.evaluation.* (groundedness / recall) on the vector spans in this scope.",
      why: "Without an eval, low-recall retrievals trigger extra tool + LLM passes and raise hallucination risk on answers that aren't grounded — but the rate stays invisible until retrievals are scored.",
      metrics: [{ k: "Eval coverage", v: "0%" }],
      drill: { path: "/agents", focus: "vectordb", label: "Agents" },
    };
  }

  // scope chips
  const { counts, breakdown } = ctx;
  if (spec.which === "services") {
    return {
      title: "Services with AI spans",
      severity: "neutral",
      scope: "Fleet-wide",
      what: "Services emitting gen_ai.* spans in the current scope. Each maps to one or more tiers in the diagram; coverage decides which tiers are measured natively versus inferred.",
      metrics: [{ k: "With AI spans", v: counts.services == null ? "—" : String(counts.services) }],
      drill: { path: "/explorer", focus: undefined, label: "Explorer" },
    };
  }
  if (spec.which === "agents") {
    return {
      title: "Active agents",
      severity: "neutral",
      scope: "Fleet-wide",
      what: "Distinct gen_ai.agent identities that ran in scope. Agents are the unit of the Agent tier — per-agent cost, loop rate, and error rate roll up there.",
      metrics: [{ k: "Active agents", v: counts.agents == null ? "—" : String(counts.agents) }],
      drill: { path: "/agents", focus: "agent", label: "Agents" },
    };
  }
  if (spec.which === "tools") {
    return {
      title: "Tools invoked",
      severity: "neutral",
      scope: "Fleet-wide",
      what: "Distinct tools invoked via gen_ai.tool spans. Tool calls feed the Tool execution tier — fan-out and external-API latency here are common cost/latency drivers.",
      metrics: [{ k: "Distinct tools", v: counts.tools == null ? "—" : String(counts.tools) }],
      drill: { path: "/agents", focus: "tools", label: "Agents" },
    };
  }
  return {
    title: "Active findings",
    severity: breakdown.critical > 0 ? "critical" : breakdown.warning > 0 ? "warning" : "neutral",
    scope: "Fleet-wide",
    what: "Open findings across the request path. They surface as pills and badges on the diagram and in the findings list below the map.",
    metrics: [
      { k: "Critical", v: String(breakdown.critical) },
      { k: "Warning", v: String(breakdown.warning) },
      { k: "Info", v: String(breakdown.info) },
    ],
  };
};
