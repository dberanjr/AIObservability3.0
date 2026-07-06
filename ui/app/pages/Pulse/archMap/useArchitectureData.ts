/**
 * Live data for the AI Application Architecture node-map. ONE scoped summarize
 * yields per-tier span volumes, tokens, latency, error and truncation signals;
 * a second makeTimeseries scan yields per-tier sparklines; the orchestrator loop
 * signal is reused from useAgentLoops; findings come from useAnomalies (grouped
 * by tier); scope chips from useResolvedCounts.
 *
 * Each tier is re-framed per lens (cost → $, throughput → count + share, latency
 * → p90, errors → err rate, loop → loop rate). A dynamic spotlight per lens marks
 * where that signal concentrates (highest volume / latency / error tiers).
 *
 * Telemetry state per tier (drives ghost / inferred / live rendering):
 *   - client, gateway        → "none"     (otelGap: always shown, never measured)
 *   - orchestrator/agent/llm  → "live" when spans present, else "none" (spine)
 *   - tools/vectordb          → "live" when spans present, else "ghost"
 *   - memory                  → "live" (conversation/thread ids) | "inferred"
 *                               (langgraph_checkpoint_ns) | "ghost"
 *
 * Loop rate is FLEET-WIDE: LangGraph node spans rarely carry gen_ai.agent.name,
 * so almost every looping run is "unattributed" — computing the rate only over
 * attributed agents reads as ~0%. We aggregate looping_runs / runs across ALL
 * rows instead, and surface the worst *attributed* agent as the loop entity.
 *
 * Routes through useScopedDql (timeframe, segments, sampling, scan-limit, global
 * filter). No values are fabricated — a tier with no signal renders faint.
 */
import { useMemo } from "react";
import { useScopedDql } from "../../../scope/useScopedDql";
import { useScope } from "../../../scope/ScopeContext";
import { useSampling } from "../../../scope/SamplingContext";
import { useResolvedCounts } from "../../../scope/useResolvedCounts";
import { useAgentLoops } from "../../Agents/useAgentLoops";
import { useHighFrequencyAgents } from "../../Agents/useHighFrequencyAgents";
import { useAnomalies } from "../anomalies/useAnomalies";
import { dqlTimeArg, LOGICAL_ERROR_EXPR } from "../../../scope/queries";
import { AI_SPAN_POPULATION, dbSystemIsVectorStore } from "../../../detection/attributeFields";
import { fmtCount, fmtTokens, fmtMs, fmtUSD, fmtPercent, toNum } from "../../../data/format";
import { usePulseSeries, type PulseSeries } from "./usePulseSeries";
import { perceptualEdgeWeight } from "./edgeScale";
import { useSpendBreakdown } from "../useSpendBreakdown";
import { useClientUpstream, type ClientUpstream } from "./useClientUpstream";
import type { Finding } from "../../../components/drawers/types";
import type { LayerKey } from "../../../data/ai-layer-patterns";
import type { LensId } from "../architectureLenses";
import {
  EDGES,
  edgeKey,
  type Badge,
  type DetailSpec,
  type LensCell,
  type NodeStatus,
  type NodeView,
  type Tone,
} from "./model";

export type NodeViewMap = Record<LayerKey, NodeView>;

export interface EdgeFinding {
  label: string;
  tone: Tone;
  spec: DetailSpec;
}

/** Scalars behind the inter-tier edge pills (real values for their detail popups). */
export interface EdgeSignals {
  /** Agents exhibiting N+1 / high-frequency tool calls. */
  n1Agents: number;
  /** LLM calls truncated for length (context exhaustion), extrapolated. */
  truncCount: number;
  /** Average prompt (input) tokens per LLM call. */
  avgPromptTokens: number | null;
}

export interface ArchData {
  nodes: NodeViewMap;
  edgeWeight: Record<string, number>;
  edgeRate: Record<string, string>;
  edgeFinding: Record<string, EdgeFinding>;
  edgeSignals: EdgeSignals;
  /** Per-lens emphasized node set (where the lens's signal concentrates). */
  spotlight: Record<LensId, Set<LayerKey>>;
  loopPct: number | null;
  loopRate: string | null;
  loopEntity: string | null;
  /** Upstream caller services for the Client node + its drawer drill-down. */
  clientUpstream: ClientUpstream;
  findings: Finding[];
  counts: { services: number | null; agents: number | null; tools: number | null };
  breakdown: { critical: number; warning: number; info: number };
  /** All per-bucket series (per-tier throughput/latency/errors + finding metrics). */
  series: PulseSeries;
  refreshedMs: number | null;
  empty: boolean;
  isLoading: boolean;
  error?: Error;
  /** Re-run the map's own summarize (surfaced on the inline error state). */
  refetch: () => void;
}

interface Rec {
  llmSpans?: number;
  llmTokens?: number;
  llmErr?: number;
  llmTrunc?: number;
  llm429?: number;
  llmP90Ns?: number;
  agentSpans?: number;
  agentErr?: number;
  agentP90Ns?: number;
  toolSpans?: number;
  toolErr?: number;
  toolP90Ns?: number;
  vectorSpans?: number;
  memorySpans?: number;
  checkpointSpans?: number;
  workflowSpans?: number;
  workflowErr?: number;
  workflowP90Ns?: number;
}

const num = (v: unknown): number => {
  const n = toNum(v);
  return Number.isFinite(n) ? n : 0;
};
const ms = (nsVal: number): number => nsVal / 1_000_000;

const WARN_ERR = 0.03;
const CRIT_ERR = 0.1;
const WARN_LOOP_PCT = 5;
const CRIT_LOOP_PCT = 20;
const WARN_MS = 2000;
const CRIT_MS = 5000;

const rateStatus = (r: number): NodeStatus =>
  r >= CRIT_ERR ? "critical" : r >= WARN_ERR ? "warning" : "healthy";
const latStatus = (msVal: number): NodeStatus =>
  msVal >= CRIT_MS ? "critical" : msVal >= WARN_MS ? "warning" : "healthy";
const ORDER: Record<NodeStatus, number> = { muted: 0, healthy: 1, warning: 2, critical: 3 };
const worse = (a: NodeStatus, b: NodeStatus): NodeStatus => (ORDER[a] >= ORDER[b] ? a : b);

const buildQuery = (from: string, to: string): string =>
  `
fetch spans, samplingRatio: 1, from: ${dqlTimeArg(from)}, to: ${dqlTimeArg(to)}
| filter ${AI_SPAN_POPULATION}
| fieldsAdd
    is_err = if(${LOGICAL_ERROR_EXPR}, 1, else: 0),
    is_trunc = if(contains(lower(toString(\`gen_ai.response.finish_reasons\`)), "max_tokens") or contains(lower(toString(\`gen_ai.response.finish_reasons\`)), "length"), 1, else: 0),
    is_wf = if(isNotNull(\`traceloop.workflow.name\`) or isNotNull(\`traceloop.association.properties.langgraph_node\`), 1, else: 0),
    tok = toLong(coalesce(\`gen_ai.usage.input_tokens\`, \`gen_ai.usage.prompt_tokens\`, 0)) + toLong(coalesce(\`gen_ai.usage.output_tokens\`, \`gen_ai.usage.completion_tokens\`, 0))
| summarize {
    llmSpans = countIf(isNotNull(\`gen_ai.request.model\`)),
    llmTokens = sum(if(isNotNull(\`gen_ai.request.model\`), tok, else: 0)),
    llmErr = countIf(isNotNull(\`gen_ai.request.model\`) and is_err == 1),
    llmTrunc = countIf(isNotNull(\`gen_ai.request.model\`) and is_trunc == 1),
    llm429 = countIf(toLong(coalesce(\`http.response.status_code\`, 0)) == 429),
    llmP90Ns = percentile(if(isNotNull(\`gen_ai.request.model\`), duration, else: null), 90),
    agentSpans = countIf(isNotNull(\`gen_ai.agent.name\`)),
    agentErr = countIf(isNotNull(\`gen_ai.agent.name\`) and is_err == 1),
    agentP90Ns = percentile(if(isNotNull(\`gen_ai.agent.name\`), duration, else: null), 90),
    toolSpans = countIf(\`traceloop.span.kind\` == "tool" or span.name == "mcp.server"),
    toolErr = countIf((\`traceloop.span.kind\` == "tool" or span.name == "mcp.server") and is_err == 1),
    toolP90Ns = percentile(if(\`traceloop.span.kind\` == "tool" or span.name == "mcp.server", duration, else: null), 90),
    vectorSpans = countIf(${dbSystemIsVectorStore()} or isNotNull(\`vector_db.query.top_k\`)),
    memorySpans = countIf(isNotNull(\`gen_ai.conversation.id\`) or isNotNull(\`traceloop.association.properties.thread_id\`)),
    checkpointSpans = countIf(isNotNull(\`traceloop.association.properties.langgraph_checkpoint_ns\`)),
    workflowSpans = countIf(is_wf == 1),
    workflowErr = countIf(is_wf == 1 and is_err == 1),
    workflowP90Ns = percentile(if(is_wf == 1, duration, else: null), 90)
  }
`.trim();

/** Cost-driver explainer per tier for the Cost lens (cost is billed at the LLM). */
const COST_DRIVER: Partial<Record<LayerKey, string>> = {
  orchestrator: "drives the loop that re-sends context",
  agent: "scratchpad re-sent as input tokens",
  tools: "tool output → next call's input tokens",
  vectordb: "retrieved chunks → input tokens",
  memory: "history re-sent every turn",
};

/** Empty node view skeleton (every tier "none" until data lands). */
const blankNodes = (): NodeViewMap => {
  const m = {} as NodeViewMap;
  const keys: LayerKey[] = [
    "client",
    "gateway",
    "orchestrator",
    "agent",
    "tools",
    "llm",
    "vectordb",
    "memory",
  ];
  for (const k of keys) {
    m[k] = { status: "muted", state: "none", sub: "—", badges: [], findings: 0, reason: "", cells: {} };
  }
  // otelGap tiers are static (never measured) — render their note immediately so
  // they don't shimmer or show "—" during the gradual load.
  m.client = { ...m.client, sub: "no native OTel · identity source" };
  m.gateway = { ...m.gateway, sub: "no native OTel · proxy hop", enrich: "+ enrich: injection" };
  return m;
};

export const useArchitectureData = (): ArchData => {
  const { scope } = useScope();
  const { samplingRatio } = useSampling();
  const loops = useAgentLoops();
  const highFreq = useHighFrequencyAgents();
  const counts = useResolvedCounts();
  const { anomalies, isLoading: anomLoading } = useAnomalies();
  const clientUpstream = useClientUpstream();

  const { data, isLoading, error, refetch } = useScopedDql<Rec>(
    buildQuery(scope.timeframe.from, scope.timeframe.to ?? "now()"),
    { staleTime: 60_000 },
  );

  // Shared per-bucket series (node sparklines + tier drawer + finding charts).
  // Its own scan, kept out of the map's isLoading gate so the map paints
  // immediately and the charts fill in when ready.
  const pulse = usePulseSeries();
  // Accurate fleet LLM spend (per-model actual rates; blended only for models
  // missing from the pricing table) — used instead of a flat blended rate.
  const spendBreakdown = useSpendBreakdown();

  // Fleet-wide loop rate + worst attributed agent (see file header).
  const fleetLoop = useMemo(() => {
    let runs = 0;
    let looping = 0;
    let worstPct = 0;
    let entity: string | null = null;
    for (const r of loops.rows) {
      runs += r.runs;
      looping += r.loopingRuns;
      if (!r.unattributed && r.loopRatePct > worstPct) {
        worstPct = r.loopRatePct;
        entity = r.agent;
      }
    }
    return { pct: runs > 0 ? (looping / runs) * 100 : 0, entity };
  }, [loops.rows]);

  const byLayer = useMemo(() => {
    const m = new Map<LayerKey, Finding[]>();
    for (const f of anomalies) {
      if (!f.layer) continue;
      const list = m.get(f.layer) ?? [];
      list.push(f);
      m.set(f.layer, list);
    }
    return m;
  }, [anomalies]);

  return useMemo<ArchData>(() => {
    const rec = data?.records?.[0];
    const ex = (n: number) => n * samplingRatio;
    const pct = (n: number, d: number) => (d > 0 ? n / d : 0);
    const nodes = blankNodes();

    const breakdown = { critical: 0, warning: 0, info: 0 };
    for (const f of anomalies) breakdown[f.severity] += 1;

    const findingBadge = (key: LayerKey): { n: number; tone?: Tone } => {
      const list = byLayer.get(key) ?? [];
      if (list.length === 0) return { n: 0 };
      const tone = list.some((f) => f.severity === "critical")
        ? "critical"
        : list.some((f) => f.severity === "warning")
          ? "warning"
          : "neutral";
      return { n: list.length, tone };
    };
    const finding = (key: LayerKey, types: string[]): Finding | undefined =>
      (byLayer.get(key) ?? []).find((f) => types.includes((f as { type?: string }).type ?? ""));

    const count: Partial<Record<LayerKey, number>> = {};
    const p90: Partial<Record<LayerKey, number>> = {};
    const errCount: Partial<Record<LayerKey, number>> = {};
    const edgeWeight: Record<string, number> = {};
    const edgeRate: Record<string, string> = {};
    const edgeFinding: Record<string, EdgeFinding> = {};

    const loopPct = loops.isEmpty ? null : fleetLoop.pct;
    const loopStatus: NodeStatus =
      loopPct == null
        ? "muted"
        : loopPct >= CRIT_LOOP_PCT
          ? "critical"
          : loopPct >= WARN_LOOP_PCT
            ? "warning"
            : "healthy";

    // muted lens cell for a tier that doesn't carry this lens's signal
    const muted = (sub: string): LensCell => ({ status: "muted", sub, badges: [] });

    if (rec) {
      // ── client / gateway (otelGap) ───────────────────────
      nodes.client = {
        status: "muted",
        state: "none",
        sub: "no native OTel · identity source",
        badges: [],
        findings: findingBadge("client").n,
        findingTone: findingBadge("client").tone,
        reason: "No native gen_ai spans — propagate session.id / gen_ai.user from here.",
        cells: {},
      };
      nodes.gateway = {
        status: "muted",
        state: "none",
        sub: "no native OTel · proxy hop",
        enrich: "+ enrich: injection",
        badges: [],
        findings: findingBadge("gateway").n,
        findingTone: findingBadge("gateway").tone,
        reason: "HTTP/proxy spans only — best place to enrich identity & security context.",
        cells: {},
      };

      // ── orchestrator ─────────────────────────────────────
      // The orchestrator tier no longer carries a throughput headline — its
      // runtime (workflow) spans are folded into the Agent tier below, and this
      // tier instead surfaces the detected frameworks as separate nodes (driven
      // by useFrameworkNodes). We still keep p90 + error count for the health
      // dot, and the loop-rate badge / cells.
      const wf = num(rec.workflowSpans);
      const wfErr = pct(num(rec.workflowErr), wf);
      const wfP90 = ms(num(rec.workflowP90Ns));
      p90.orchestrator = wfP90;
      errCount.orchestrator = num(rec.workflowErr);
      // The orchestrator no longer shows a throughput headline, but its inbound
      // workflow-span volume is still the correct weight for the gateway →
      // orchestrator edge (the edge loop reads count[e.to]). Keep this count-map
      // entry for edge weighting only — it does NOT drive the suppressed headline,
      // and the `empty` check below intentionally ignores count.orchestrator.
      count.orchestrator = wf;
      if (wf > 0 || !loops.isEmpty) {
        const loopBadge: Badge[] =
          loopPct != null
            ? [
                {
                  text: `loop rate ${loopPct.toFixed(0)}%`,
                  tone: loopStatus === "critical" ? "critical" : loopStatus === "warning" ? "warning" : "neutral",
                  spec: { kind: "loop" },
                },
              ]
            : [];
        nodes.orchestrator = {
          status: loops.isEmpty ? "muted" : loopStatus,
          state: "live",
          sub: "frameworks detected",
          badges: loopBadge,
          findings: findingBadge("orchestrator").n,
          findingTone: findingBadge("orchestrator").tone,
          reason: loops.isEmpty ? "No LangGraph runs in scope" : `Loop rate ${loopPct?.toFixed(0)}%`,
          cells: {
            latency: { status: latStatus(wfP90), headline: fmtMs(wfP90), sub: "p90 wall-clock", badges: [] },
            errors: { status: rateStatus(wfErr), headline: fmtPercent(wfErr * 100), sub: "workflow errors", badges: [] },
            loop:
              loopPct != null
                ? { status: loopStatus, headline: `${loopPct.toFixed(0)}%`, sub: "loop rate", badges: loopBadge }
                : muted("no loop signal"),
            cost: muted(COST_DRIVER.orchestrator ?? "—"),
          },
        };
      } else {
        nodes.orchestrator = { ...nodes.orchestrator, sub: "no workflow spans in scope" };
      }

      // ── agent ────────────────────────────────────────────
      // The orchestrator's runtime (workflow) spans fold into this tier's
      // headline: the orchestrator tier now shows frameworks instead of a
      // throughput number, so its runtime volume is counted here as part of the
      // agent runtime. Error rate / p90 stay agent-span metrics (the workflow
      // p90/errors remain on the orchestrator health dot).
      const aS = num(rec.agentSpans);
      const agentRuntime = aS + wf;
      const aErr = pct(num(rec.agentErr), aS);
      const aP90 = ms(num(rec.agentP90Ns));
      count.agent = agentRuntime;
      p90.agent = aP90;
      errCount.agent = num(rec.agentErr);
      if (agentRuntime > 0) {
        // The headline colour already conveys error status (Pulse-6 status tag +
        // tinted number), so the plain "err%" pill is dropped from the card; the
        // rate stays available in the drawer's Errors chart and the Errors lens.
        const baseBadges: Badge[] = [
          { text: `p90 ${fmtMs(aP90)}`, tone: "neutral" },
        ];
        const runaway = finding("agent", ["runaway-agent"]);
        if (runaway) baseBadges.push({ text: "runaway", tone: "critical", spec: { kind: "finding", id: runaway.id } });
        nodes.agent = {
          status: worse(rateStatus(aErr), loops.isEmpty ? "healthy" : loopStatus),
          state: "live",
          headline: fmtCount(ex(agentRuntime)),
          sub: "agent + workflow spans",
          badges: baseBadges,
          findings: findingBadge("agent").n,
          findingTone: findingBadge("agent").tone,
          reason: `Error ${fmtPercent(aErr * 100)}`,
          cells: {
            throughput: { status: "healthy", headline: fmtCount(ex(agentRuntime)), sub: "agent + workflow spans", badges: [] },
            latency: { status: latStatus(aP90), headline: fmtMs(aP90), sub: "p90 self-time", badges: [] },
            errors: { status: rateStatus(aErr), headline: fmtPercent(aErr * 100), sub: "agent error rate", badges: [] },
            loop: muted("amplified by orchestrator loops"),
            cost: muted(COST_DRIVER.agent ?? "—"),
          },
        };
      } else {
        nodes.agent = { ...nodes.agent, sub: "no agent spans in scope" };
      }

      // ── tools ────────────────────────────────────────────
      const tS = num(rec.toolSpans);
      const tErr = pct(num(rec.toolErr), tS);
      const tP90 = ms(num(rec.toolP90Ns));
      count.tools = tS;
      p90.tools = tP90;
      errCount.tools = num(rec.toolErr);
      if (tS > 0) {
        nodes.tools = {
          status: rateStatus(tErr),
          state: "live",
          headline: fmtCount(ex(tS)),
          sub: "tool calls",
          // "err%" pill dropped — the headline colour + status tag convey it (Pulse-6).
          badges: [
            { text: `p90 ${fmtMs(tP90)}`, tone: "neutral" },
          ],
          findings: findingBadge("tools").n,
          findingTone: findingBadge("tools").tone,
          reason: `Tool error ${fmtPercent(tErr * 100)}`,
          cells: {
            throughput: { status: "healthy", headline: fmtCount(ex(tS)), sub: "tool calls", badges: [] },
            latency: { status: latStatus(tP90), headline: fmtMs(tP90), sub: "p90 tool time", badges: [] },
            errors: { status: rateStatus(tErr), headline: fmtPercent(tErr * 100), sub: "tool / MCP errors", badges: [] },
            loop: muted("retried inside loops"),
            cost: muted(COST_DRIVER.tools ?? "—"),
          },
        };
      } else {
        nodes.tools = { ...nodes.tools, state: "ghost", sub: "no tool spans in scope" };
      }

      // ── llm ──────────────────────────────────────────────
      const lS = num(rec.llmSpans);
      const lErr = pct(num(rec.llmErr), lS);
      const truncRate = pct(num(rec.llmTrunc), lS);
      const has429 = num(rec.llm429) > 0;
      const lP90 = ms(num(rec.llmP90Ns));
      const tokens = ex(num(rec.llmTokens));
      const usd = fmtUSD(spendBreakdown.total);
      count.llm = lS;
      p90.llm = lP90;
      errCount.llm = num(rec.llmErr) + num(rec.llmTrunc) + num(rec.llm429);
      if (lS > 0) {
        let s = rateStatus(lErr);
        if (has429 || truncRate >= WARN_ERR) s = worse(s, "warning");
        // Card badges are capped to the headline cost figure plus any anomalous
        // signals (truncation / 429s, appended below). Raw tokens + p90 move to
        // the drawer's Tokens / Latency charts so the busiest tile stays legible.
        const baseBadges: Badge[] = [
          { text: `≈ ${usd}`, tone: "cost" },
        ];
        const errBadges: Badge[] = [];
        if (truncRate > 0) {
          const tf = finding("llm", ["truncation"]);
          const b: Badge = { text: `${fmtPercent(truncRate * 100)} truncated`, tone: "warning" };
          if (tf) b.spec = { kind: "finding", id: tf.id };
          baseBadges.push(b);
          errBadges.push(b);
        }
        if (has429) {
          const rf = finding("llm", ["rate-limit"]);
          const b: Badge = { text: "429s", tone: "warning" };
          if (rf) b.spec = { kind: "finding", id: rf.id };
          baseBadges.push(b);
          errBadges.push(b);
        }
        nodes.llm = {
          status: s,
          state: "live",
          headline: fmtCount(ex(lS)),
          sub: "LLM calls",
          badges: baseBadges,
          findings: findingBadge("llm").n,
          findingTone: findingBadge("llm").tone,
          reason: `Error ${fmtPercent(lErr * 100)}${has429 ? " · 429s" : ""}`,
          cells: {
            cost: { status: "healthy", headline: `≈ ${usd}`, sub: "window spend", badges: [{ text: `${fmtTokens(tokens)} tok`, tone: "neutral" }] },
            throughput: { status: "healthy", headline: fmtCount(ex(lS)), sub: "LLM calls", badges: [] },
            latency: { status: latStatus(lP90), headline: fmtMs(lP90), sub: "p90 generation", badges: [] },
            errors: { status: s, headline: fmtPercent(lErr * 100), sub: "logical + HTTP errors", badges: errBadges },
            loop: muted("re-invoked each iteration"),
          },
        };
      } else {
        nodes.llm = { ...nodes.llm, sub: "no LLM calls in scope" };
      }

      // ── vector db ────────────────────────────────────────
      const vS = num(rec.vectorSpans);
      count.vectordb = vS;
      if (vS > 0) {
        nodes.vectordb = {
          status: "healthy",
          state: "live",
          headline: fmtCount(ex(vS)),
          sub: "retrievals",
          enrich: "+ eval: hallucination",
          badges: [],
          findings: findingBadge("vectordb").n,
          findingTone: findingBadge("vectordb").tone,
          reason: "Retrieval active",
          cells: {
            throughput: { status: "healthy", headline: fmtCount(ex(vS)), sub: "retrievals", badges: [] },
            cost: muted(COST_DRIVER.vectordb ?? "—"),
          },
        };
      } else {
        nodes.vectordb = { ...nodes.vectordb, state: "ghost", sub: "no native gen_ai retrieval spans" };
      }

      // ── memory (langgraph_checkpoint_ns inference) ───────
      const mS = num(rec.memorySpans);
      const cp = num(rec.checkpointSpans);
      count.memory = mS > 0 ? mS : cp;
      if (mS > 0) {
        nodes.memory = {
          status: "healthy",
          state: "live",
          headline: fmtCount(ex(mS)),
          sub: "conversation / thread state",
          badges: [],
          findings: findingBadge("memory").n,
          findingTone: findingBadge("memory").tone,
          reason: "State store active (conversation / thread ids present)",
          cells: {
            throughput: { status: "healthy", headline: fmtCount(ex(mS)), sub: "state ops", badges: [] },
            cost: muted(COST_DRIVER.memory ?? "—"),
          },
        };
      } else if (cp > 0) {
        nodes.memory = {
          status: "muted",
          state: "inferred",
          headline: fmtCount(ex(cp)),
          sub: "checkpoint writes · inferred",
          enrich: "+ propagate thread / conversation id",
          badges: [],
          findings: findingBadge("memory").n,
          findingTone: findingBadge("memory").tone,
          reason:
            "Inferred from langgraph_checkpoint_ns. Cross-turn grouping is missing — no conversation/thread id to attribute history growth.",
          cells: {
            throughput: { status: "muted", headline: fmtCount(ex(cp)), sub: "checkpoint writes", badges: [] },
            cost: muted(COST_DRIVER.memory ?? "—"),
          },
        };
      } else {
        nodes.memory = { ...nodes.memory, state: "ghost", sub: "no state-store signal" };
      }
    }

    // ── client tier (upstream callers from Smartscape topology) ──
    // The Client tier has no native gen_ai spans, but the services that CALL the
    // AI services are in Smartscape — so we surface their count + RED metrics
    // here instead of the static "no native OTel" note. The drawer lists them
    // (each filters the whole app on click).
    if (clientUpstream.count > 0) {
      const cErr = clientUpstream.errPct; // percent
      const cStatus = rateStatus(cErr / 100);
      const aggSeries = clientUpstream.services.reduce<number[]>((acc, s) => {
        s.series.forEach((v, i) => {
          acc[i] = (acc[i] ?? 0) + v;
        });
        return acc;
      }, []);
      nodes.client = {
        status: cStatus,
        state: "live",
        headline: fmtCount(clientUpstream.count),
        sub: clientUpstream.count === 1 ? "upstream service" : "upstream services",
        badges: [
          { text: `${fmtPercent(cErr)} err`, tone: cErr >= WARN_ERR * 100 ? "warning" : "neutral" },
          { text: `p90 ${fmtMs(clientUpstream.p90Ms)}`, tone: "neutral" },
        ],
        findings: findingBadge("client").n,
        findingTone: findingBadge("client").tone,
        series: aggSeries.length >= 2 ? aggSeries : undefined,
        reason: `${clientUpstream.count} upstream caller service${clientUpstream.count === 1 ? "" : "s"} · ${fmtPercent(cErr)} error rate`,
        cells: {
          throughput: { status: "healthy", headline: fmtCount(clientUpstream.count), sub: "upstream services", badges: [] },
          latency: { status: latStatus(clientUpstream.p90Ms), headline: fmtMs(clientUpstream.p90Ms), sub: "p90 (worst caller)", badges: [] },
          errors: { status: cStatus, headline: fmtPercent(cErr), sub: "caller error rate", badges: [] },
        },
      };
    }

    // ── per-tier sparklines (attach to live tiers only) ───
    // The node sparkline switches metric with the active lens (handled in
    // MapNode): throughput by default, p90 latency / error count / tokens
    // under the Latency / Errors / Cost lenses.
    const ok = (s?: number[]) => (s && s.length >= 2 ? s : undefined);
    for (const k of ["orchestrator", "agent", "tools", "llm"] as LayerKey[]) {
      if (nodes[k].state !== "live") continue;
      nodes[k].series = ok(pulse.throughput[k]);
      nodes[k].seriesLatency = ok(pulse.latencyMs[k]);
      nodes[k].seriesErrors = ok(pulse.errors[k]);
      if (k === "llm") nodes[k].seriesCost = ok(pulse.tokens);
    }

    // ── dynamic spotlight per lens ─────────────────────────
    const present = (k: LayerKey) => nodes[k].state === "live" || nodes[k].state === "inferred";
    const topBy = (metric: Partial<Record<LayerKey, number>>, n: number): LayerKey[] =>
      (Object.keys(metric) as LayerKey[])
        .filter((k) => present(k) && (metric[k] ?? 0) > 0)
        .sort((a, b) => (metric[b] ?? 0) - (metric[a] ?? 0))
        .slice(0, n);
    const spotlight: Record<LensId, Set<LayerKey>> = {
      cost: new Set((["llm", "agent", "orchestrator"] as LayerKey[]).filter(present)),
      throughput: new Set(topBy(count, 2)),
      latency: new Set(topBy(p90, 2)),
      errors: new Set((Object.keys(errCount) as LayerKey[]).filter((k) => present(k) && (errCount[k] ?? 0) > 0)),
      // The reasoning loop runs Orchestrator → Agent → LLM → back, so LLM is
      // part of the loop view (it's re-invoked every iteration).
      loop: new Set((["orchestrator", "agent", "llm"] as LayerKey[]).filter(present)),
    };

    // ── edge weights + rates (downstream-volume weighted) ──
    const vals = Object.values(count).filter((n): n is number => typeof n === "number" && n > 0);
    const maxCount = vals.length ? Math.max(...vals) : 0;
    const noun: Partial<Record<LayerKey, string>> = {
      orchestrator: "workflow spans",
      agent: "agent spans",
      tools: "tool calls",
      llm: "LLM calls",
      vectordb: "retrievals",
      memory: "state ops",
    };
    for (const e of EDGES) {
      const key = edgeKey(e.from, e.to);
      const c = count[e.to];
      if (c != null && maxCount > 0) {
        // √-scaled so mid-volume edges stay distinguishable from the busiest one
        // instead of all collapsing to the floor (see edgeScale.ts).
        edgeWeight[key] = perceptualEdgeWeight(c, maxCount);
        edgeRate[key] = c > 0 ? `${fmtCount(ex(c))} ${noun[e.to] ?? "spans"}` : "no spans in scope";
      } else {
        edgeWeight[key] = e.baseW;
        edgeRate[key] = "no native span data";
      }
    }
    // ── inter-tier health pills (real signals) ────────────
    const n1Agents = highFreq.size;
    const truncCount = rec ? Math.round(ex(num(rec.llmTrunc))) : 0;
    const llmCalls = rec ? num(rec.llmSpans) : 0;
    const sumInput = pulse.inputTokens.reduce((a, b) => a + b, 0);
    const avgPromptTokens = llmCalls > 0 && sumInput > 0 ? sumInput / llmCalls : null;
    const edgeSignals: EdgeSignals = { n1Agents, truncCount, avgPromptTokens };

    // Agent → Tools: N+1 / high-frequency tool calls (a single tool called
    // far more than the threshold within a trace).
    if (n1Agents > 0) {
      edgeFinding[edgeKey("agent", "tools")] = {
        label: `N+1 · ${n1Agents}`,
        tone: "warning",
        spec: { kind: "n1" },
      };
    }
    // Agent → LLM: oversized prompts / context-window exhaustion (truncation).
    if (truncCount > 0) {
      edgeFinding[edgeKey("agent", "llm")] = {
        label: `ctx ×${fmtCount(truncCount)}`,
        tone: "warning",
        spec: { kind: "ctx" },
      };
    }
    // Tools → Vector DB: retrieval recall. Recall/hallucination need a RAG
    // evaluator (gen_ai.evaluation.*), which isn't emitted here — surface it as
    // an enrichment nudge rather than a fabricated percentage.
    if (nodes.tools.state === "live") {
      edgeFinding[edgeKey("tools", "vectordb")] = {
        label: "recall · eval",
        tone: "neutral",
        spec: { kind: "recall" },
      };
    }

    edgeWeight.loop = 0.5;
    const loopRate = loopPct != null ? `${loopPct.toFixed(0)}% of workflows re-enter` : null;

    const empty =
      !!rec &&
      [count.agent, count.tools, count.llm, count.vectordb, count.memory].every(
        (n) => !n,
      );

    return {
      nodes,
      edgeWeight,
      edgeRate,
      edgeFinding,
      edgeSignals,
      spotlight,
      loopPct,
      loopRate,
      loopEntity: fleetLoop.entity,
      clientUpstream,
      findings: anomalies,
      counts: { services: counts.services, agents: counts.agents, tools: counts.tools },
      breakdown,
      series: pulse,
      refreshedMs: counts.lastRefreshed,
      empty,
      isLoading: isLoading || loops.isLoading || anomLoading,
      error: error ?? undefined,
      refetch: () => {
        void refetch();
      },
    };
  }, [
    data,
    refetch,
    pulse,
    spendBreakdown.total,
    clientUpstream,
    samplingRatio,
    loops.isEmpty,
    loops.isLoading,
    highFreq,
    anomLoading,
    fleetLoop,
    byLayer,
    anomalies,
    counts.services,
    counts.agents,
    counts.tools,
    counts.lastRefreshed,
    isLoading,
    error,
  ]);
};
